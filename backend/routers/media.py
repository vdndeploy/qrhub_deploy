"""Media library + file upload routes.

Extracted from server.py (Feb 2026 modular refactor).
Endpoints handled:
- POST   /api/upload                    file upload to Cloudinary (admin + vendor)
- GET    /api/files                     legacy file list (admin)
- DELETE /api/files/{public_id}         legacy single delete
- POST   /api/files/bulk-delete         legacy bulk delete
- GET    /api/media                     paged library (kind=uploads|posts), per-tenant
- GET    /api/media/stats               counts + bytes breakdown
- DELETE /api/media/{public_id}         tenant-aware delete with in-use guard
"""
import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional

import aiofiles
import cloudinary
import cloudinary.uploader
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel

# Late-binding imports from server. Safe because routers/* are imported by
# server.py AFTER all of the names below are defined.
import server as _server
from server import (
    db, logger,
    get_current_user, get_current_user_or_vendor,
    _is_super_admin, _tenant_filter,
    UPLOAD_DIR,
)

router = APIRouter(tags=['media'])


@router.post('/upload')
async def upload_file(request: Request, file: UploadFile = File(...), folder: str = Form('uploads'), user: dict = Depends(get_current_user_or_vendor)):
    allowed_types = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail='Tipo file non supportato')

    is_vendor = user.get('_principal') == 'vendor'
    # Vendors can only upload their own profile photo: hard-pin them to a fixed folder
    # so they can't write to /posts or other admin areas.
    if is_vendor:
        folder = 'uploads'
    elif folder not in ('uploads', 'posts', 'landings'):
        # Whitelist — admins can upload to vendor-profile, posts or landing-hero buckets.
        # Anything else collapses to 'uploads' as a safety fallback. Landings must be
        # explicitly listed otherwise hero-image uploads (folder=landings sent by
        # Landings.js editor) would silently pollute the vendor "Foto profilo" gallery.
        folder = 'uploads'

    # GDPR M1 — tenant isolation: prefix Cloudinary folder with org id so different
    # tenants land in disjoint namespaces. Super admin uploads (no organization_id)
    # go to a shared 'platform' folder. The Cloudinary public_id itself remains a
    # long UUID-based string so direct guessing is not feasible either way.
    org_id = (user.get('organization_id') or '').strip() if not _is_super_admin(user) else ''
    cl_folder = f'org_{org_id}/{folder}' if org_id else f'platform/{folder}'

    content = await file.read()

    if _server.CLOUDINARY_ENABLED:
        # Upload to Cloudinary
        is_video = file.content_type.startswith('video/')
        try:
            result = cloudinary.uploader.upload(
                content,
                resource_type='video' if is_video else 'image',
                folder=cl_folder,
                use_filename=True,
                unique_filename=True,
                overwrite=False
            )
            # Probe basic dimensions for aspect-ratio hints
            doc = {
                'public_id': result.get('public_id', ''),
                'url': result.get('secure_url', ''),
                'resource_type': result.get('resource_type', 'image'),
                'format': result.get('format', ''),
                'width': result.get('width'),
                'height': result.get('height'),
                'bytes': result.get('bytes', 0),
                'folder': cl_folder,
                'kind': folder,  # 'uploads' (vendor photos) | 'posts' (post media) | 'landings' (landing hero)
                'organization_id': user.get('organization_id'),
                'original_filename': file.filename,
                'created_at': datetime.now(timezone.utc).isoformat(),
                'uploaded_by': user.get('email', ''),
                'uploaded_by_id': str(user.get('_id') or user.get('id') or ''),
                'uploaded_by_principal': user.get('_principal', 'user'),
            }
            await db.files.insert_one(doc.copy())
            doc.pop('_id', None)
            return {'url': doc['url'], 'public_id': doc['public_id'],
                    'width': doc.get('width'), 'height': doc.get('height'),
                    'resource_type': doc['resource_type']}
        except Exception as e:
            logger.error(f'Cloudinary upload failed: {e}')
            raise HTTPException(status_code=500, detail=f'Errore Cloudinary: {str(e)}')
    
    # Fallback: local storage. Derive the public URL from the actual request
    # (scheme + host) so the frontend can render the image. The previous code
    # used localhost:8001 when env was missing, producing unreachable URLs.
    ext = file.filename.split('.')[-1] if '.' in file.filename else 'bin'
    filename = f"{uuid.uuid4()}.{ext}"
    file_path = UPLOAD_DIR / filename
    async with aiofiles.open(file_path, 'wb') as f:
        await f.write(content)
    base = (os.environ.get('FRONTEND_URL') or os.environ.get('REACT_APP_BACKEND_URL') or '').rstrip('/')
    if not base:
        # Use the request host (works in preview/dev where no env is set).
        base = str(request.base_url).rstrip('/')
    file_url = f"{base}/uploads/{filename}"
    logger.warning(f'Cloudinary disabled — file saved locally at {file_url}. Configure CLOUDINARY_* env or DB config for prod uploads.')
    return {'url': file_url, 'filename': filename, 'public_id': filename}


@router.get('/files')
async def list_files(skip: int = 0, limit: int = 24, folder: Optional[str] = None,
                     orphans_only: bool = False, user: dict = Depends(get_current_user)):
    """List uploaded files (admin file manager). Marks orphans = files not referenced by any post,
    by a vendor profile image, or by an organization logo. The `folder` filter matches the
    short `kind` (uploads|posts) — the stored `folder` value is composite (org_<id>/<kind>)."""
    q = _tenant_filter(user)
    if folder in ('uploads', 'posts', 'landings'):
        q['kind'] = folder
    elif folder:
        q['folder'] = folder

    total = await db.files.count_documents(q)
    files = await db.files.find(q, {'_id': 0}).sort('created_at', -1).skip(skip).limit(limit).to_list(limit)

    # Determine in-use public_ids + urls. We MUST mirror /api/media's logic here:
    # vendor profile photos and org logos are tracked by URL (not public_id), so a
    # file that's referenced as a vendor picture or as the org logo must be marked
    # in_use to avoid accidental deletion from the orphan list.
    in_use_pid, in_use_url = await _compute_in_use_sets()

    enriched = []
    for f in files:
        pid = f.get('public_id', '')
        url = f.get('url', '')
        f['in_use'] = (pid in in_use_pid) or (url in in_use_url)
        enriched.append(f)

    if orphans_only:
        enriched = [f for f in enriched if not f['in_use']]

    return {'files': enriched, 'total': total, 'skip': skip, 'limit': limit}


@router.delete('/files/{public_id:path}')
async def delete_file(public_id: str, user: dict = Depends(get_current_user)):
    f = await db.files.find_one(_tenant_filter(user, {'public_id': public_id}), {'_id': 0})
    if not f:
        raise HTTPException(status_code=404, detail='File non trovato')

    # Refuse to delete a file that's currently the profile picture of a vendor
    # or the logo of an org — that would visually break landing pages.
    _, in_use_url = await _compute_in_use_sets()
    if f.get('url') and f['url'] in in_use_url:
        raise HTTPException(
            status_code=409,
            detail='File in uso come foto profilo o logo organizzazione. Rimuovi prima il riferimento.'
        )

    if CLOUDINARY_ENABLED:
        try:
            cloudinary.uploader.destroy(public_id, resource_type=f.get('resource_type', 'image'), invalidate=True)
        except Exception as e:
            logger.warning(f'Cloudinary destroy failed for {public_id}: {e}')
    else:
        # Local file
        try:
            (UPLOAD_DIR / public_id).unlink(missing_ok=True)
        except Exception:
            pass

    await db.files.delete_one({'public_id': public_id})
    # Detach from any posts that referenced this
    await db.posts.update_many(
        {'media_public_id': public_id},
        {'$set': {'media_url': '', 'media_public_id': '', 'media_resource_type': '', 'aspect_ratio': None}}
    )
    return {'message': 'File eliminato', 'public_id': public_id}


class BulkDeleteRequest(BaseModel):
    public_ids: List[str]


@router.post('/files/bulk-delete')
async def bulk_delete_files(req: BulkDeleteRequest, user: dict = Depends(get_current_user)):
    """Bulk delete files. Refuses to delete files that are currently used as a
    vendor profile picture or an organization logo — those would visually break
    landing pages. The frontend orphan filter already hides them, this is a
    server-side safety net."""
    in_use_pid, in_use_url = await _compute_in_use_sets()
    deleted = 0
    failed = []
    for pid in req.public_ids:
        try:
            f = await db.files.find_one(_tenant_filter(user, {'public_id': pid}), {'_id': 0})
            if not f:
                failed.append({'public_id': pid, 'reason': 'not_found'})
                continue
            url = f.get('url', '')
            # Hard-block if the file is referenced as a vendor photo or an org logo.
            # Posts still get auto-detached below for backwards compatibility with
            # the legacy admin "free up post media" flow.
            if url and url in in_use_url:
                failed.append({'public_id': pid, 'reason': 'in_use_protected'})
                continue
            if CLOUDINARY_ENABLED:
                try:
                    cloudinary.uploader.destroy(pid, resource_type=f.get('resource_type', 'image'), invalidate=True)
                except Exception as e:
                    logger.warning(f'Cloudinary destroy failed for {pid}: {e}')
            await db.files.delete_one({'public_id': pid})
            await db.posts.update_many(
                {'media_public_id': pid},
                {'$set': {'media_url': '', 'media_public_id': '', 'media_resource_type': '', 'aspect_ratio': None}}
            )
            deleted += 1
        except Exception as e:
            failed.append({'public_id': pid, 'reason': str(e)})
    return {'deleted': deleted, 'failed': failed}


# ──────────────────────────────────────────────────────────────────
# Media Library — picker + management endpoints
# Reuse-friendly view of all org-scoped uploads. Accessible to both
# admins (full org scope, all kinds) and vendors (only kind='uploads' so
# they can pick existing profile photos; delete only their own).
# ──────────────────────────────────────────────────────────────────

async def _compute_in_use_sets():
    """Return (public_ids_used_in_posts, urls_used_as_vendor_photos)."""
    in_use_pid = set()
    async for p in db.posts.find({}, {'_id': 0, 'media_public_id': 1}):
        if p.get('media_public_id'):
            in_use_pid.add(p['media_public_id'])
    async for s in db.stores.find({'post_media_public_id': {'$ne': ''}}, {'_id': 0, 'post_media_public_id': 1}):
        if s.get('post_media_public_id'):
            in_use_pid.add(s['post_media_public_id'])
    in_use_url = set()
    async for v in db.vendors.find({'profile_image_url': {'$ne': ''}}, {'_id': 0, 'profile_image_url': 1}):
        u = (v.get('profile_image_url') or '').strip()
        if u:
            in_use_url.add(u)
    async for o in db.organizations.find({'logo_url': {'$ne': ''}}, {'_id': 0, 'logo_url': 1}):
        u = (o.get('logo_url') or '').strip()
        if u:
            in_use_url.add(u)
    return in_use_pid, in_use_url


@router.get('/media')
async def list_media(
    kind: Optional[str] = None,
    skip: int = 0,
    limit: int = 60,
    search: str = '',
    mine_only: bool = False,
    user: dict = Depends(get_current_user_or_vendor),
):
    """List org-scoped media for picker / library.
    - Admins see all kinds; can filter by ?kind=uploads|posts.
    - Vendors are scoped to kind='uploads' regardless of param and can pass mine_only=true.
    """
    is_vendor = user.get('_principal') == 'vendor'
    q: dict = {}
    org_id = (user.get('organization_id') or '').strip()
    if not _is_super_admin(user):
        if not org_id:
            return {'items': [], 'total': 0, 'skip': skip, 'limit': limit}
        q['organization_id'] = org_id

    if is_vendor:
        q['kind'] = 'uploads'
    elif kind in ('uploads', 'posts', 'landings'):
        q['kind'] = kind

    if mine_only:
        my_id = str(user.get('_id') or user.get('id') or '')
        if my_id:
            q['uploaded_by_id'] = my_id

    if search:
        q['$or'] = [
            {'original_filename': {'$regex': search, '$options': 'i'}},
            {'public_id': {'$regex': search, '$options': 'i'}},
        ]

    limit = max(1, min(int(limit or 60), 200))
    skip = max(0, int(skip or 0))

    total = await db.files.count_documents(q)
    files = await db.files.find(q, {'_id': 0}).sort('created_at', -1).skip(skip).limit(limit).to_list(limit)

    in_use_pid, in_use_url = await _compute_in_use_sets()
    me_id = str(user.get('_id') or user.get('id') or '')

    items = []
    for f in files:
        pid = f.get('public_id', '')
        url = f.get('url', '')
        f['in_use'] = pid in in_use_pid or url in in_use_url
        f['is_mine'] = (str(f.get('uploaded_by_id') or '')) == me_id
        # Permission flag for the UI: admins can delete anything in their tenant,
        # vendors can delete only their own uploads.
        if is_vendor:
            f['can_delete'] = f['is_mine']
        else:
            f['can_delete'] = True
        items.append(f)
    return {'items': items, 'total': total, 'skip': skip, 'limit': limit}


@router.get('/media/stats')
async def media_stats(user: dict = Depends(get_current_user_or_vendor)):
    """Quick stats: total count, total bytes, by-kind breakdown for the org."""
    q: dict = {}
    if not _is_super_admin(user):
        org_id = (user.get('organization_id') or '').strip()
        if not org_id:
            return {'count': 0, 'bytes': 0, 'by_kind': {}}
        q['organization_id'] = org_id
    pipeline = [
        {'$match': q},
        {'$group': {
            '_id': '$kind',
            'count': {'$sum': 1},
            'bytes': {'$sum': {'$ifNull': ['$bytes', 0]}},
        }},
    ]
    by_kind: dict = {}
    total_count, total_bytes = 0, 0
    async for row in db.files.aggregate(pipeline):
        k = row.get('_id') or 'other'
        by_kind[k] = {'count': row['count'], 'bytes': row['bytes']}
        total_count += row['count']
        total_bytes += row['bytes']
    return {'count': total_count, 'bytes': total_bytes, 'by_kind': by_kind}


@router.delete('/media/{public_id:path}')
async def delete_media(public_id: str, user: dict = Depends(get_current_user_or_vendor)):
    """Delete a media asset. Vendors can only delete their own uploads."""
    q: dict = {'public_id': public_id}
    if not _is_super_admin(user):
        org_id = (user.get('organization_id') or '').strip()
        if not org_id:
            raise HTTPException(status_code=403, detail='Nessuna organizzazione assegnata')
        q['organization_id'] = org_id

    f = await db.files.find_one(q, {'_id': 0})
    if not f:
        raise HTTPException(status_code=404, detail='File non trovato')

    is_vendor = user.get('_principal') == 'vendor'
    if is_vendor:
        my_id = str(user.get('_id') or user.get('id') or '')
        if str(f.get('uploaded_by_id') or '') != my_id:
            raise HTTPException(status_code=403, detail='Puoi cancellare solo le tue foto')

    in_use_pid, in_use_url = await _compute_in_use_sets()
    if f.get('public_id') in in_use_pid or f.get('url') in in_use_url:
        # Don't silently break a published post/vendor card — require explicit detach first.
        raise HTTPException(
            status_code=409,
            detail='Media in uso (post o foto profilo). Rimuovi prima il riferimento o usa il bulk-delete admin.'
        )

    if CLOUDINARY_ENABLED:
        try:
            cloudinary.uploader.destroy(public_id, resource_type=f.get('resource_type', 'image'), invalidate=True)
        except Exception as e:
            logger.warning(f'Cloudinary destroy failed for {public_id}: {e}')
    await db.files.delete_one({'public_id': public_id})
    return {'message': 'File eliminato', 'public_id': public_id}
