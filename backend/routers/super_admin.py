"""Super-admin operational tools (Feb 2026).

Adds three new (additive, non-breaking) endpoint groups:

  Backup:
    - GET  /api/super-admin/backup/db        → ZIP with every Mongo collection (JSON)
    - GET  /api/super-admin/backup/github    → ZIP of the GitHub repo (proxies the
                                                official `/zipball/{ref}` endpoint)

  Free-tier usage monitor:
    - GET  /api/super-admin/usage            → aggregated usage stats from Fly.io,
                                                MongoDB Atlas, Cloudinary, Vercel.
                                                Each provider is best-effort: missing
                                                credentials → status 'not_configured'.

All endpoints are super_admin only. No existing flow is touched.
"""
import io
import json
import zipfile
from datetime import datetime, timezone

import httpx
from bson import json_util
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from server import (
    db,
    logger,
    require_super_admin,
    _load_deploy_config,
    _fly_graphql,
)

router = APIRouter(tags=['super_admin'])


# ─────────────────────────────────────────────────────────────────────────────
# 1) DATABASE BACKUP
# ─────────────────────────────────────────────────────────────────────────────

@router.get('/super-admin/backup/db')
async def backup_database(user: dict = Depends(require_super_admin)):
    """Stream a ZIP with every collection serialised as JSON (bson.json_util).

    The export uses Mongo Extended JSON so types like ObjectId/Date are preserved
    and the file can be re-imported via `mongoimport --jsonArray`. Document _id
    is intentionally NOT stripped: the goal is a full fidelity snapshot.
    """
    buf = io.BytesIO()
    coll_names = [c for c in await db.list_collection_names() if not c.startswith('system.')]
    coll_names.sort()
    manifest = {
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'db_name': db.name,
        'collections': {},
        'tool': 'qrhub-super-admin-backup/1.0',
    }
    with zipfile.ZipFile(buf, mode='w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for name in coll_names:
            cursor = db[name].find({})
            docs = await cursor.to_list(length=None)
            payload = json_util.dumps(docs, ensure_ascii=False, indent=None)
            zf.writestr(f'collections/{name}.json', payload)
            manifest['collections'][name] = len(docs)
        zf.writestr('manifest.json', json.dumps(manifest, indent=2, ensure_ascii=False))
        zf.writestr(
            'README.txt',
            (
                "QRHub Mongo backup\n"
                "==================\n\n"
                "Restore one collection with:\n"
                "  mongoimport --uri \"$MONGO_URL\" --db <DB> \\\n"
                "              --collection <name> --file collections/<name>.json --jsonArray\n\n"
                "Restore all collections (bash):\n"
                "  for f in collections/*.json; do\n"
                "    name=$(basename \"$f\" .json)\n"
                "    mongoimport --uri \"$MONGO_URL\" --db <DB> \\\n"
                "                --collection \"$name\" --file \"$f\" --jsonArray\n"
                "  done\n"
            ),
        )
    buf.seek(0)
    ts = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
    fname = f'qrhub-db-backup-{ts}.zip'
    logger.info(f'[backup] DB snapshot generated: {len(coll_names)} collections by {user.get("email")}')
    return Response(
        content=buf.getvalue(),
        media_type='application/zip',
        headers={'Content-Disposition': f'attachment; filename={fname}'},
    )


# ─────────────────────────────────────────────────────────────────────────────
# 2) GITHUB REPO BACKUP
# ─────────────────────────────────────────────────────────────────────────────

@router.get('/super-admin/backup/github')
async def backup_github(ref: str = 'main', user: dict = Depends(require_super_admin)):
    """Proxy `GET /repos/{owner}/{repo}/zipball/{ref}` so the super admin can
    download a snapshot of the source repo without ever exposing the token in
    the browser. Requires `github_repo` + `github_token` configured in the
    Settings panel.
    """
    cfg = await _load_deploy_config()
    repo = (cfg.get('github_repo') or '').strip()
    token = (cfg.get('github_token') or '').strip()
    if not repo or '/' not in repo:
        raise HTTPException(status_code=400, detail='github_repo non configurato (owner/repo) nel pannello Impostazioni → Backup')
    if not token:
        raise HTTPException(status_code=400, detail='github_token non configurato nel pannello Impostazioni → Backup')

    owner, repo_name = repo.split('/', 1)
    url = f'https://api.github.com/repos/{owner}/{repo_name}/zipball/{ref}'
    headers = {
        'Authorization': f'Bearer {token}',
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'qrhub-super-admin-backup',
    }
    try:
        async with httpx.AsyncClient(timeout=90.0, follow_redirects=True) as c:
            r = await c.get(url, headers=headers)
    except httpx.HTTPError as e:
        logger.error(f'[backup] GitHub zipball failed: {e}')
        raise HTTPException(status_code=502, detail=f'GitHub irraggiungibile: {e}')

    if r.status_code == 401:
        raise HTTPException(status_code=400, detail='Token GitHub non valido o scaduto')
    if r.status_code == 404:
        raise HTTPException(status_code=404, detail=f'Repository {repo} o ref "{ref}" non trovato')
    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail=f'GitHub ha risposto {r.status_code}: {r.text[:200]}')

    ts = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
    fname = f'qrhub-repo-{owner}-{repo_name}-{ref}-{ts}.zip'
    logger.info(f'[backup] GitHub snapshot {repo}@{ref} downloaded by {user.get("email")}')
    return Response(
        content=r.content,
        media_type='application/zip',
        headers={'Content-Disposition': f'attachment; filename={fname}'},
    )


# ─────────────────────────────────────────────────────────────────────────────
# 3) FREE-TIER USAGE MONITOR
# ─────────────────────────────────────────────────────────────────────────────

# Static free-tier limits we expose to the UI so it can render % bars.
# Values reflect public published limits as of Feb 2026. If a provider changes
# them we update here, not in the frontend.
FREE_LIMITS = {
    'fly': {
        # Fly.io's "Hobby plan" allowance: 3 shared-cpu-1x VMs, 3GB persistent
        # volumes, 160GB outbound bandwidth per month.
        'machines': 3,
        'volume_gb': 3,
        'bandwidth_gb_month': 160,
        'docs': 'https://fly.io/docs/about/pricing/',
    },
    'mongodb_atlas': {
        # M0 Sandbox: 512MB storage, shared CPU, no time limit.
        'storage_mb': 512,
        'docs': 'https://www.mongodb.com/pricing',
    },
    'cloudinary': {
        # Cloudinary Free: 25 monthly "credits". 1 credit ≈ 1k transformations
        # OR 1GB storage OR 1GB bandwidth.
        'credits_month': 25,
        'docs': 'https://cloudinary.com/pricing',
    },
    'vercel': {
        # Vercel Hobby: 100GB bandwidth, 6000 build minutes, 100 deployments/day.
        'bandwidth_gb_month': 100,
        'build_minutes_month': 6000,
        'docs': 'https://vercel.com/pricing',
    },
}


async def _usage_fly(cfg: dict) -> dict:
    token = (cfg.get('flyio_api_key') or '').strip()
    app_name = (cfg.get('flyio_app_name') or '').strip()
    if not token or not app_name:
        return {'status': 'not_configured', 'limits': FREE_LIMITS['fly']}
    # Fly does not expose a free public usage API for bandwidth in GraphQL.
    # We surface what we CAN know: machine count + region + status.
    query = """query($name:String!){
        app(name:$name){
            name status hostname
            machines{ nodes{ id state region } }
            volumes{ nodes{ id sizeGb region } }
        }
    }"""
    try:
        data = await _fly_graphql(token, query, {'name': app_name})
    except HTTPException as e:
        return {'status': 'error', 'error': str(e.detail)[:300], 'limits': FREE_LIMITS['fly']}
    except Exception as e:
        return {'status': 'error', 'error': str(e)[:300], 'limits': FREE_LIMITS['fly']}
    app = (data or {}).get('app') or {}
    all_machines = (app.get('machines') or {}).get('nodes') or []
    # Fly keeps destroyed machines in the GraphQL response forever — filter
    # those out so the "used" count reflects only billable/active instances.
    machines = [m for m in all_machines if (m.get('state') or '').lower() not in ('destroyed', 'destroying')]
    volumes = (app.get('volumes') or {}).get('nodes') or []
    total_vol_gb = sum((v.get('sizeGb') or 0) for v in volumes)
    return {
        'status': 'ok',
        'app': app.get('name'),
        'hostname': app.get('hostname'),
        'app_status': app.get('status'),
        'machines_used': len(machines),
        'machines_limit': FREE_LIMITS['fly']['machines'],
        'volume_gb_used': total_vol_gb,
        'volume_gb_limit': FREE_LIMITS['fly']['volume_gb'],
        'machines': [
            {'id': m.get('id'), 'state': m.get('state'), 'region': m.get('region')}
            for m in machines
        ],
        'note': 'Bandwidth non esposto dall\'API Fly: verifica manuale su fly.io dashboard → Billing.',
        'limits': FREE_LIMITS['fly'],
    }


async def _usage_mongodb(cfg: dict) -> dict:
    pub = (cfg.get('atlas_public_key') or '').strip()
    priv = (cfg.get('atlas_private_key') or '').strip()
    group = (cfg.get('atlas_group_id') or '').strip()
    if not pub or not priv or not group:
        return {
            'status': 'not_configured',
            'limits': FREE_LIMITS['mongodb_atlas'],
            'hint': 'Configura atlas_public_key + atlas_private_key + atlas_group_id (Atlas → Project Settings → API Keys, ruolo Project Read Only).',
        }
    # Atlas Admin API uses Digest auth; httpx supports it via DigestAuth.
    url = f'https://cloud.mongodb.com/api/atlas/v2/groups/{group}/clusters'
    try:
        async with httpx.AsyncClient(timeout=20.0, auth=httpx.DigestAuth(pub, priv)) as c:
            r = await c.get(url, headers={'Accept': 'application/vnd.atlas.2023-02-01+json'})
        if r.status_code >= 400:
            return {'status': 'error', 'error': f'{r.status_code} {r.text[:200]}',
                    'limits': FREE_LIMITS['mongodb_atlas']}
        data = r.json()
    except httpx.HTTPError as e:
        return {'status': 'error', 'error': str(e)[:300], 'limits': FREE_LIMITS['mongodb_atlas']}

    clusters = data.get('results') or data.get('clusters') or []
    out = []
    for cl in clusters:
        out.append({
            'name': cl.get('name'),
            'state': cl.get('stateName'),
            'instance_size': (cl.get('providerSettings') or {}).get('instanceSizeName') or cl.get('clusterType'),
            'mongo_version': cl.get('mongoDBVersion'),
        })
    return {
        'status': 'ok',
        'clusters_count': len(out),
        'clusters': out,
        'note': 'Storage % esatto richiede Metrics API per cluster; visibile su Atlas → Metrics → Data Size.',
        'limits': FREE_LIMITS['mongodb_atlas'],
    }


async def _usage_cloudinary(cfg: dict) -> dict:
    key = (cfg.get('cloudinary_api_key') or '').strip()
    secret = (cfg.get('cloudinary_api_secret') or '').strip()
    cloud = (cfg.get('cloudinary_cloud_name') or '').strip()
    if not key or not secret or not cloud:
        return {
            'status': 'not_configured',
            'limits': FREE_LIMITS['cloudinary'],
            'hint': 'Servono cloudinary_api_key + secret + cloud_name (già richiesti dal pannello).',
        }
    url = f'https://api.cloudinary.com/v1_1/{cloud}/usage'
    try:
        async with httpx.AsyncClient(timeout=15.0, auth=(key, secret)) as c:
            r = await c.get(url)
        if r.status_code >= 400:
            return {'status': 'error', 'error': f'{r.status_code} {r.text[:200]}',
                    'limits': FREE_LIMITS['cloudinary']}
        d = r.json()
    except httpx.HTTPError as e:
        return {'status': 'error', 'error': str(e)[:300], 'limits': FREE_LIMITS['cloudinary']}

    # Cloudinary's /usage returns credits + limit + percent + storage/bandwidth/transformations.
    credits = d.get('credits') or {}
    return {
        'status': 'ok',
        'plan': d.get('plan'),
        'credits_used': credits.get('usage'),
        'credits_limit': credits.get('limit') or FREE_LIMITS['cloudinary']['credits_month'],
        'credits_pct': credits.get('used_percent'),
        'transformations': (d.get('transformations') or {}).get('usage'),
        'bandwidth_bytes': (d.get('bandwidth') or {}).get('usage'),
        'storage_bytes': (d.get('storage') or {}).get('usage'),
        'last_updated': d.get('last_updated'),
        'limits': FREE_LIMITS['cloudinary'],
    }


async def _usage_vercel(cfg: dict) -> dict:
    token = (cfg.get('vercel_token') or '').strip()
    project = (cfg.get('vercel_project_id') or '').strip()
    team = (cfg.get('vercel_org_id') or '').strip()
    if not token or not project:
        return {'status': 'not_configured', 'limits': FREE_LIMITS['vercel']}
    # No public, account-wide /usage endpoint exists on the Hobby plan. We
    # surface deployment frequency (last 30 days) as a proxy + last build
    # duration so the admin can spot anomalies. Full bandwidth/build-minutes
    # need to be checked on vercel.com dashboard.
    params = {'projectId': project, 'limit': 100, 'state': 'READY'}
    if team:
        params['teamId'] = team
    try:
        async with httpx.AsyncClient(timeout=20.0) as c:
            r = await c.get(
                'https://api.vercel.com/v6/deployments',
                params=params,
                headers={'Authorization': f'Bearer {token}'},
            )
        if r.status_code >= 400:
            return {'status': 'error', 'error': f'{r.status_code} {r.text[:200]}',
                    'limits': FREE_LIMITS['vercel']}
        d = r.json()
    except httpx.HTTPError as e:
        return {'status': 'error', 'error': str(e)[:300], 'limits': FREE_LIMITS['vercel']}

    deps = d.get('deployments') or []
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    last_30d = [x for x in deps if (now_ms - (x.get('created') or 0)) < 30 * 24 * 3600 * 1000]
    last_24h = [x for x in deps if (now_ms - (x.get('created') or 0)) < 24 * 3600 * 1000]
    latest = deps[0] if deps else None
    return {
        'status': 'ok',
        'project': project,
        'deployments_30d': len(last_30d),
        'deployments_24h': len(last_24h),
        'deployments_24h_limit': 100,
        'latest_state': (latest or {}).get('state'),
        'latest_ts': (latest or {}).get('created'),
        'note': 'Bandwidth e build-minutes non esposti dall\'API; check su vercel.com → Settings → Usage.',
        'limits': FREE_LIMITS['vercel'],
    }


@router.get('/super-admin/usage')
async def get_usage(user: dict = Depends(require_super_admin)):
    """Aggregate free-tier usage from Fly, MongoDB Atlas, Cloudinary, Vercel.

    Best-effort: any provider missing credentials reports `status: not_configured`
    and the others still return. Total request time is bounded by the slowest
    provider (~20s timeout each).
    """
    import asyncio
    cfg = await _load_deploy_config()
    fly, atlas, cdn, vercel = await asyncio.gather(
        _usage_fly(cfg),
        _usage_mongodb(cfg),
        _usage_cloudinary(cfg),
        _usage_vercel(cfg),
        return_exceptions=False,
    )
    return {
        'fetched_at': datetime.now(timezone.utc).isoformat(),
        'fly': fly,
        'mongodb_atlas': atlas,
        'cloudinary': cdn,
        'vercel': vercel,
    }
