"""Web Push Notifications router.

Endpoints:
  - GET  /api/push/public-key             → returns the VAPID public key
  - POST /api/push/subscribe              → store an anonymous subscription
  - POST /api/push/unsubscribe            → remove a subscription by endpoint
  - POST /api/push/broadcast              → admin-triggered manual broadcast
                                            (auth required, scoped to org)

Helpers (re-used elsewhere in server.py for auto-push on Post creation):
  - bootstrap_vapid_keys(db)              → generate keys if missing
  - broadcast_push(db, scope, payload)    → batched delivery + 410 cleanup

Subscription doc shape:
  {
    'endpoint':   str  (unique key — Mongo unique index applied at bootstrap)
    'keys':       {'p256dh': str, 'auth': str}
    'vendor_id':  str
    'organization_id': str
    'scope':      'vendor' | 'organization'
    'created_at': ISO string
  }
"""
import asyncio
import base64
import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional

from ecdsa import SigningKey, NIST256p
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from pywebpush import webpush, WebPushException

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/api/push')


# ── VAPID bootstrap ────────────────────────────────────────────────────────

def _generate_vapid_keys():
    sk = SigningKey.generate(curve=NIST256p)
    vk = sk.get_verifying_key()
    return {
        # base64url WITHOUT padding — required by Web Push spec
        'private_key': base64.urlsafe_b64encode(sk.to_string()).decode().rstrip('='),
        'public_key': base64.urlsafe_b64encode(b'\x04' + vk.to_string()).decode().rstrip('='),
    }


async def bootstrap_vapid_keys(db):
    """Ensure VAPID keys exist in MongoDB. Safe to call on every boot —
    idempotent. Subject is read from VAPID_SUBJECT env, falling back to a
    generic mailto so push services have a way to reach us if needed."""
    cfg = await db.push_config.find_one({'_id': 'vapid'})
    if cfg and cfg.get('public_key') and cfg.get('private_key'):
        return cfg
    keys = _generate_vapid_keys()
    subject = (os.environ.get('VAPID_SUBJECT') or '').strip() or 'mailto:admin@qrhub.it'
    doc = {'_id': 'vapid', **keys, 'subject': subject,
           'created_at': datetime.now(timezone.utc).isoformat()}
    await db.push_config.replace_one({'_id': 'vapid'}, doc, upsert=True)
    # Ensure unique index on subscriptions so the same browser endpoint is
    # de-duped automatically across re-subscribe attempts.
    try:
        await db.push_subscriptions.create_index('endpoint', unique=True)
    except Exception as e:
        logger.warning('push_subscriptions index already exists: %s', e)
    logger.info('VAPID keys bootstrapped')
    return doc


# ── Broadcast helper ───────────────────────────────────────────────────────

async def _send_one(sub_doc, payload_json, vapid_private_key, vapid_subject):
    """Synchronous send wrapped in `asyncio.to_thread` by the caller."""
    try:
        webpush(
            subscription_info={
                'endpoint': sub_doc['endpoint'],
                'keys': sub_doc['keys'],
            },
            data=payload_json,
            vapid_private_key=vapid_private_key,
            vapid_claims={'sub': vapid_subject},
            ttl=86400,  # 24h — push services discard after this
        )
        return None
    except WebPushException as ex:
        status = getattr(getattr(ex, 'response', None), 'status_code', None)
        # 404 Not Found / 410 Gone → subscription revoked or expired.
        if status in (404, 410):
            return sub_doc['endpoint']  # signal stale → caller deletes
        logger.warning('webpush failed (status=%s): %s', status, ex)
        return None
    except Exception as ex:
        logger.exception('webpush unexpected: %s', ex)
        return None


async def broadcast_push(db, *, vendor_id: Optional[str] = None,
                         organization_id: Optional[str] = None,
                         title: str, body: str, url: str,
                         icon: Optional[str] = None):
    """Send a push to either a single vendor's subscribers OR every
    subscriber of an organization (when `vendor_id` is None and
    `organization_id` is given). Returns (sent_count, removed_count)."""
    cfg = await db.push_config.find_one({'_id': 'vapid'})
    if not cfg:
        logger.warning('broadcast_push: VAPID not bootstrapped, skipping')
        return (0, 0)

    query = {}
    if vendor_id:
        # Per-vendor push: include both vendor-scoped subs AND org-wide
        # subs of the same org so "all org offers" subscribers get them too.
        query = {'$or': [{'vendor_id': vendor_id}, {
            'organization_id': organization_id, 'scope': 'organization',
        }]} if organization_id else {'vendor_id': vendor_id}
    elif organization_id:
        query = {'organization_id': organization_id}
    else:
        return (0, 0)

    subs = await db.push_subscriptions.find(query).to_list(2000)
    if not subs:
        return (0, 0)

    payload = json.dumps({
        'title': title[:120], 'body': body[:400], 'url': url,
        'icon': icon or '/icons/icon-192.png',
    })
    tasks = [
        asyncio.to_thread(_send_one, s, payload, cfg['private_key'], cfg['subject'])
        for s in subs
    ]
    results = await asyncio.gather(*tasks)
    stale = [ep for ep in results if ep]
    if stale:
        await db.push_subscriptions.delete_many({'endpoint': {'$in': stale}})
    return (len(subs) - len(stale), len(stale))


# ── Pydantic models ────────────────────────────────────────────────────────

class _PushKeys(BaseModel):
    p256dh: str = Field(..., max_length=200)
    auth: str = Field(..., max_length=80)


class SubscribeRequest(BaseModel):
    endpoint: str = Field(..., min_length=10, max_length=600)
    keys: _PushKeys
    vendor_id: str = Field(..., max_length=64)
    scope: str = Field('vendor', max_length=20)  # 'vendor' | 'organization'


class UnsubscribeRequest(BaseModel):
    endpoint: str = Field(..., min_length=10, max_length=600)


class BroadcastRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    body: str = Field(..., min_length=1, max_length=400)
    url: Optional[str] = Field('', max_length=600)
    vendor_id: Optional[str] = Field(None, max_length=64)


# ── Routes ─────────────────────────────────────────────────────────────────

def attach_routes(db, get_current_user_dep):
    """Wire endpoints with the running app's `db` and current-user dep so we
    don't need to import server.py here (avoids circulars)."""

    @router.get('/public-key')
    async def get_public_key():
        cfg = await db.push_config.find_one({'_id': 'vapid'})
        if not cfg:
            raise HTTPException(503, 'VAPID not ready')
        return {'publicKey': cfg['public_key']}

    @router.post('/subscribe')
    async def subscribe(req: SubscribeRequest):
        # Look up the vendor to capture its org context. Required for
        # cross-targeting (org-wide subscribers also receive vendor pushes).
        v = await db.vendors.find_one({'id': req.vendor_id},
                                       {'_id': 0, 'organization_id': 1})
        if not v:
            raise HTTPException(404, 'Vendor non trovato')
        scope = req.scope if req.scope in ('vendor', 'organization') else 'vendor'
        doc = {
            'endpoint': req.endpoint,
            'keys': req.keys.dict(),
            'vendor_id': req.vendor_id,
            'organization_id': v.get('organization_id', ''),
            'scope': scope,
            'updated_at': datetime.now(timezone.utc).isoformat(),
        }
        await db.push_subscriptions.update_one(
            {'endpoint': req.endpoint},
            {'$set': doc, '$setOnInsert': {
                'created_at': datetime.now(timezone.utc).isoformat()
            }},
            upsert=True,
        )
        return {'status': 'subscribed', 'scope': scope}

    @router.post('/unsubscribe')
    async def unsubscribe(req: UnsubscribeRequest):
        await db.push_subscriptions.delete_one({'endpoint': req.endpoint})
        return {'status': 'unsubscribed'}

    @router.post('/broadcast')
    async def broadcast(req: BroadcastRequest,
                         user: dict = Depends(get_current_user_dep)):
        org_id = user.get('organization_id')
        if not org_id:
            raise HTTPException(403, 'Org context mancante')
        if req.vendor_id:
            v = await db.vendors.find_one(
                {'id': req.vendor_id, 'organization_id': org_id},
                {'_id': 0, 'id': 1}
            )
            if not v:
                raise HTTPException(404, 'Vendor non trovato nella tua org')
        sent, removed = await broadcast_push(
            db,
            vendor_id=req.vendor_id,
            organization_id=org_id,
            title=req.title,
            body=req.body,
            url=req.url or '/',
        )
        return {'sent': sent, 'cleaned_stale': removed}

    return router
