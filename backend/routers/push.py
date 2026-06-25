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
    # Index for the analytics dashboard (org-scoped, sorted by recency).
    try:
        await db.push_broadcasts.create_index(
            [('organization_id', 1), ('created_at', -1)]
        )
        await db.push_broadcasts.create_index('id', unique=True)
    except Exception as e:
        logger.warning('push_broadcasts index already exists: %s', e)
    logger.info('VAPID keys bootstrapped')
    return doc


# ── Broadcast helper ───────────────────────────────────────────────────────

def _send_one(sub_doc, payload_json, vapid_private_key, vapid_subject):
    """Synchronous send wrapped in `asyncio.to_thread` by the caller.
    Must remain a regular `def` (not `async def`) so it can run inside the
    thread executor — otherwise `asyncio.to_thread` would receive a
    coroutine object instead of a callable result."""
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
                         icon: Optional[str] = None,
                         origin: str = 'manual'):
    """Send a push to either a single vendor's subscribers OR every
    subscriber of an organization (when `vendor_id` is None and
    `organization_id` is given). Returns (sent_count, removed_count,
    broadcast_id).

    Side effect: persists a `push_broadcasts` doc that powers the Analytics
    dashboard (sent counter + click counter once the SW pings back).
    `origin` is 'manual' for admin broadcasts or 'auto' for post-triggered
    pushes so admins can split the funnel."""
    cfg = await db.push_config.find_one({'_id': 'vapid'})
    if not cfg:
        logger.warning('broadcast_push: VAPID not bootstrapped, skipping')
        return (0, 0, None)

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
        return (0, 0, None)

    subs = await db.push_subscriptions.find(query).to_list(2000)
    if not subs:
        # Still log a 0-recipient broadcast so admins see "no audience" attempts.
        bid = await _record_broadcast(db, organization_id, vendor_id, title,
                                       body, url, origin, sent=0, stale=0)
        return (0, 0, bid)

    # Pre-create the broadcast doc so we can embed its id in the payload —
    # the SW will ping back with this id on notificationclick.
    broadcast_id = await _record_broadcast(db, organization_id, vendor_id,
                                            title, body, url, origin,
                                            sent=0, stale=0)

    # Per-subscriber payload: when the admin didn't pass an explicit deep
    # link (url is '', '/' or None), personalize the click URL to that
    # subscriber's own vendor landing — opening the root of a custom
    # domain hits the DomainGuard ("Pagina non disponibile") because root
    # is reserved for vendor pages. Falling back to '/v/<their_vendor>'
    # always lands on a valid page.
    explicit_url = bool(url) and url not in ('/', '')
    base_payload = {
        'title': title[:120], 'body': body[:400],
        'icon': icon or '/icons/icon-192.png',
        'broadcast_id': broadcast_id,
    }

    def _payload_for(sub):
        sub_url = url if explicit_url else ''
        if not sub_url:
            v_id = sub.get('vendor_id') or vendor_id or ''
            sub_url = f"/v/{v_id}" if v_id else '/'
        return json.dumps({**base_payload, 'url': sub_url})

    tasks = [
        asyncio.to_thread(_send_one, s, _payload_for(s),
                          cfg['private_key'], cfg['subject'])
        for s in subs
    ]
    results = await asyncio.gather(*tasks)
    stale = [ep for ep in results if ep]
    if stale:
        await db.push_subscriptions.delete_many({'endpoint': {'$in': stale}})
    sent_count = len(subs) - len(stale)
    # Update the broadcast doc with real counters.
    await db.push_broadcasts.update_one(
        {'id': broadcast_id},
        {'$set': {'sent': sent_count, 'stale_cleaned': len(stale)}}
    )
    return (sent_count, len(stale), broadcast_id)


async def _record_broadcast(db, organization_id, vendor_id, title, body, url,
                             origin, *, sent: int, stale: int) -> str:
    """Create a `push_broadcasts` doc and return its id.
    Lightweight by design — the analytics dashboard reads from this same
    collection so we keep it denormalized (vendor name resolved at read time)."""
    from uuid import uuid4
    bid = uuid4().hex
    await db.push_broadcasts.insert_one({
        'id': bid,
        'organization_id': organization_id or '',
        'vendor_id': vendor_id or '',
        'title': title[:120],
        'body': body[:400],
        'url': url or '/',
        'origin': origin,           # 'manual' | 'auto'
        'sent': sent,
        'stale_cleaned': stale,
        'clicks': 0,
        'created_at': datetime.now(timezone.utc).isoformat(),
    })
    return bid


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


class TrackClickRequest(BaseModel):
    broadcast_id: str = Field(..., min_length=8, max_length=64)


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
        sent, removed, broadcast_id = await broadcast_push(
            db,
            vendor_id=req.vendor_id,
            organization_id=org_id,
            title=req.title,
            body=req.body,
            url=req.url or '',
            origin='manual',
        )
        return {'sent': sent, 'cleaned_stale': removed, 'broadcast_id': broadcast_id}

    @router.post('/track-click')
    async def track_click(req: TrackClickRequest):
        """Public endpoint (no auth) called by the service worker when a
        user taps the notification. Best-effort counter — we never block
        the navigation on this. Silently returns 200 even if the id is
        unknown so a stale SW doesn't keep retrying."""
        await db.push_broadcasts.update_one(
            {'id': req.broadcast_id},
            {'$inc': {'clicks': 1},
             '$set': {'last_click_at': datetime.now(timezone.utc).isoformat()}}
        )
        return {'status': 'ok'}

    @router.get('/analytics')
    async def get_analytics(user: dict = Depends(get_current_user_dep),
                            limit: int = 20):
        """Returns aggregated push analytics for the user's org:
        - totals: subscribers (by scope), broadcasts, total_sent, total_clicks
        - recent_broadcasts: most recent N with sent/clicks/CTR + vendor name
        - by_vendor: subscribers count grouped by vendor (top 10)
        Org-scoped — never leaks cross-tenant data."""
        org_id = user.get('organization_id')
        if not org_id:
            raise HTTPException(403, 'Org context mancante')

        # ── Subscriber breakdown ──
        sub_total = await db.push_subscriptions.count_documents(
            {'organization_id': org_id}
        )
        sub_org_wide = await db.push_subscriptions.count_documents(
            {'organization_id': org_id, 'scope': 'organization'}
        )
        sub_vendor_only = sub_total - sub_org_wide

        # ── Recent broadcasts with vendor name resolved in a single pass ──
        cursor = db.push_broadcasts.find(
            {'organization_id': org_id}, {'_id': 0}
        ).sort('created_at', -1).limit(max(1, min(limit, 100)))
        recent_raw = await cursor.to_list(100)

        vendor_ids = list({b['vendor_id'] for b in recent_raw if b.get('vendor_id')})
        vendor_map = {}
        if vendor_ids:
            vendor_docs = await db.vendors.find(
                {'id': {'$in': vendor_ids}, 'organization_id': org_id},
                {'_id': 0, 'id': 1, 'name': 1}
            ).to_list(len(vendor_ids))
            vendor_map = {v['id']: v.get('name', '') for v in vendor_docs}

        recent = []
        for b in recent_raw:
            sent = b.get('sent', 0) or 0
            clicks = b.get('clicks', 0) or 0
            ctr = round((clicks / sent) * 100, 1) if sent > 0 else 0.0
            recent.append({
                'id': b['id'],
                'title': b.get('title', ''),
                'body': b.get('body', ''),
                'origin': b.get('origin', 'manual'),
                'vendor_id': b.get('vendor_id', ''),
                'vendor_name': vendor_map.get(b.get('vendor_id', ''), ''),
                'sent': sent,
                'clicks': clicks,
                'ctr_pct': ctr,
                'created_at': b.get('created_at', ''),
            })

        # ── Org-wide totals (cheap aggregate) ──
        totals_pipeline = [
            {'$match': {'organization_id': org_id}},
            {'$group': {
                '_id': None,
                'broadcasts': {'$sum': 1},
                'sent': {'$sum': {'$ifNull': ['$sent', 0]}},
                'clicks': {'$sum': {'$ifNull': ['$clicks', 0]}},
            }},
        ]
        agg = await db.push_broadcasts.aggregate(totals_pipeline).to_list(1)
        totals_doc = agg[0] if agg else {'broadcasts': 0, 'sent': 0, 'clicks': 0}
        total_sent = totals_doc.get('sent', 0)
        total_clicks = totals_doc.get('clicks', 0)
        overall_ctr = round((total_clicks / total_sent) * 100, 1) if total_sent > 0 else 0.0

        # ── Top vendors by subscriber count (top 10) ──
        by_vendor_pipeline = [
            {'$match': {'organization_id': org_id, 'vendor_id': {'$ne': ''}}},
            {'$group': {'_id': '$vendor_id', 'subscribers': {'$sum': 1}}},
            {'$sort': {'subscribers': -1}},
            {'$limit': 10},
        ]
        bv = await db.push_subscriptions.aggregate(by_vendor_pipeline).to_list(10)
        bv_vendor_ids = [r['_id'] for r in bv]
        bv_map = {}
        if bv_vendor_ids:
            vds = await db.vendors.find(
                {'id': {'$in': bv_vendor_ids}, 'organization_id': org_id},
                {'_id': 0, 'id': 1, 'name': 1}
            ).to_list(len(bv_vendor_ids))
            bv_map = {v['id']: v.get('name', '') for v in vds}

        return {
            'subscribers': {
                'total': sub_total,
                'vendor_scope': sub_vendor_only,
                'org_scope': sub_org_wide,
            },
            'totals': {
                'broadcasts': totals_doc.get('broadcasts', 0),
                'sent': total_sent,
                'clicks': total_clicks,
                'ctr_pct': overall_ctr,
            },
            'by_vendor': [
                {'vendor_id': r['_id'], 'vendor_name': bv_map.get(r['_id'], ''),
                 'subscribers': r['subscribers']}
                for r in bv
            ],
            'recent_broadcasts': recent,
        }

    return router
