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
from datetime import datetime, timezone, timedelta
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
                         origin: str = 'manual',
                         include_org_scope: bool = True):
    """Send a push to either a single vendor's subscribers OR every
    subscriber of an organization (when `vendor_id` is None and
    `organization_id` is given). Returns (sent_count, removed_count,
    broadcast_id).

    `include_org_scope` controls cross-vendor reach when `vendor_id` is set:
      • True (default, used by AUTO-push on post create) → also notifies
        subscribers of *other* vendors of the same org who opted into
        "tutte le offerte del brand" (scope='organization'). Keeps the
        org-wide opt-in meaningful.
      • False (used by MANUAL admin broadcast targeting a specific vendor)
        → STRICT: only subscribers whose `vendor_id` matches. Prevents
        cross-vendor leakage — when an admin selects Vendor A, subscribers
        who landed on Vendor B/C never receive that flash sale.

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
        if include_org_scope and organization_id:
            # Per-vendor push (auto): include both vendor-scoped subs AND
            # org-wide subs of the same org so "all org offers" subscribers
            # get them too.
            query = {'$or': [{'vendor_id': vendor_id}, {
                'organization_id': organization_id, 'scope': 'organization',
            }]}
        else:
            # Strict per-vendor (manual admin broadcast). Reaches every sub
            # that opted in from THIS vendor's landing — both 'vendor' and
            # 'organization' scope rows because vendor_id was captured at
            # subscribe time from the landing the user opted in on.
            query = {'vendor_id': vendor_id}
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


class PWAHeartbeatRequest(BaseModel):
    """Payload sent by the client every time the PWA opens in
    display-mode:standalone. Powers the "Installazioni attive" KPIs and
    the notification-permission delta ("installed but push off")."""
    device_id: str = Field(..., min_length=8, max_length=64)
    vendor_id: str = Field(..., min_length=1, max_length=64)
    os: str = Field(..., max_length=16)           # 'ios' | 'android' | 'desktop'
    notification_permission: str = Field('default', max_length=16)
    # Best-effort link to the push_subscriptions row so we can build the
    # "silenced install" delta (installed but permission revoked at OS level).
    push_endpoint: Optional[str] = Field(None, max_length=600)


class ResetAnalyticsRequest(BaseModel):
    # Mandatory typed confirmation — must equal "RESET" (case-insensitive).
    # Keeps a single misclick from wiping the entire analytics history.
    confirm: str = Field(..., min_length=5, max_length=10)


# ── Audit log helper (shared by push + landing analytics resets) ──────────

async def _record_analytics_reset(db, *, organization_id: str,
                                   dashboard_type: str, user: dict,
                                   deleted_count: int) -> str:
    """Append a row to `analytics_reset_log` so org-admins keep a forensic
    trail of who wiped which dashboard and when. Returns the new audit id."""
    from uuid import uuid4
    aid = uuid4().hex
    await db.analytics_reset_log.insert_one({
        'id': aid,
        'organization_id': organization_id,
        'dashboard_type': dashboard_type,  # 'push' | 'store_landings'
        'reset_by_user_id': user.get('id') or user.get('_id') or '',
        'reset_by_email': user.get('email', ''),
        'reset_by_name': user.get('name') or user.get('email', ''),
        'deleted_count': int(deleted_count),
        'reset_at': datetime.now(timezone.utc).isoformat(),
    })
    return aid


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
            # Admin explicitly picked a vendor → strict scoping. Without
            # this flag, org-wide subs of OTHER vendors (who opted into
            # "tutte le offerte del brand") would also receive the push,
            # causing cross-vendor leakage of flash sales.
            include_org_scope=req.vendor_id is None,
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

    @router.post('/heartbeat')
    async def pwa_heartbeat(req: PWAHeartbeatRequest):
        """Public endpoint called by VendorLanding every time the PWA is
        opened in display-mode:standalone (Android + iOS). Upserts a row
        in `pwa_devices` keyed by device_id — so we can:
          • Count "installazioni attive" = devices seen in the last 30gg
          • Detect uninstalls implicitly = device stops heartbeating
          • Track the "silenced installs" delta = permission != granted
        Never returns 4xx for bad input so a broken client doesn't spam
        the console — we just no-op and return 200."""
        now_iso = datetime.now(timezone.utc).isoformat()
        vendor = await db.vendors.find_one(
            {'id': req.vendor_id}, {'_id': 0, 'organization_id': 1}
        )
        if not vendor:
            # Silently ignore — the client will retry on the next open. Keeps
            # the collection clean of orphaned device rows.
            return {'status': 'ok'}
        os_val = (req.os or '').lower()
        if os_val not in ('ios', 'android', 'desktop'):
            os_val = 'other'
        perm = req.notification_permission if req.notification_permission in (
            'default', 'granted', 'denied'
        ) else 'default'
        await db.pwa_devices.update_one(
            {'device_id': req.device_id},
            {
                '$set': {
                    'vendor_id': req.vendor_id,
                    'organization_id': vendor['organization_id'],
                    'os': os_val,
                    'notification_permission': perm,
                    'push_endpoint': req.push_endpoint or None,
                    'last_seen_at': now_iso,
                },
                '$setOnInsert': {
                    'device_id': req.device_id,
                    'first_installed_at': now_iso,
                },
            },
            upsert=True,
        )
        return {'status': 'ok'}

    @router.get('/analytics')
    async def get_analytics(user: dict = Depends(get_current_user_dep),
                            limit: int = 20, period: str = 'all'):
        """Returns aggregated push analytics for the user's org:
        - totals: subscribers (by scope), broadcasts, total_sent, total_clicks
        - recent_broadcasts: most recent N with sent/clicks/CTR + vendor name
        - by_vendor: subscribers count grouped by vendor (top 10)
        Org-scoped — never leaks cross-tenant data.

        `period` filters BROADCAST-level metrics by `created_at`: today,
        yesterday, 7d, 30d, month, all (default). Subscriber counts and
        the by-vendor breakdown are NOT time-bound (an iscritto is "now",
        not "during a period") — they always reflect the live snapshot."""
        org_id = user.get('organization_id')
        if not org_id:
            raise HTTPException(403, 'Org context mancante')

        # ── Resolve period → created_at window (Europe/Rome day boundaries
        # for today/yesterday/month to match the in-store team's mental
        # model — same pattern as routers.analytics._period_to_dates). ──
        from zoneinfo import ZoneInfo
        LOCAL_TZ = ZoneInfo('Europe/Rome')
        now_utc = datetime.now(timezone.utc)
        now_local = now_utc.astimezone(LOCAL_TZ)
        period = (period or 'all').lower()
        if period == 'today':
            start_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
            start_iso = start_local.astimezone(timezone.utc).isoformat()
            end_iso = now_utc.isoformat()
        elif period == 'yesterday':
            end_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
            start_local = end_local - timedelta(days=1)
            start_iso = start_local.astimezone(timezone.utc).isoformat()
            end_iso = end_local.astimezone(timezone.utc).isoformat()
        elif period == '7d':
            start_iso = (now_utc - timedelta(days=7)).isoformat()
            end_iso = now_utc.isoformat()
        elif period == '30d':
            start_iso = (now_utc - timedelta(days=30)).isoformat()
            end_iso = now_utc.isoformat()
        elif period == 'month':
            start_local = now_local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            start_iso = start_local.astimezone(timezone.utc).isoformat()
            end_iso = now_utc.isoformat()
        else:  # 'all' or anything else → unbounded
            start_iso = None
            end_iso = None

        # Broadcast-level query: apply period filter when not 'all'.
        broadcast_q = {'organization_id': org_id}
        if start_iso is not None:
            broadcast_q['created_at'] = {'$gte': start_iso, '$lte': end_iso}

        # ── Subscriber breakdown (NOT period-bound — live snapshot) ──
        sub_total = await db.push_subscriptions.count_documents(
            {'organization_id': org_id}
        )
        sub_org_wide = await db.push_subscriptions.count_documents(
            {'organization_id': org_id, 'scope': 'organization'}
        )
        sub_vendor_only = sub_total - sub_org_wide

        # ── Recent broadcasts with vendor name resolved in a single pass ──
        cursor = db.push_broadcasts.find(
            broadcast_q, {'_id': 0}
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

        # ── Org-wide totals (cheap aggregate) — also period-filtered ──
        totals_pipeline = [
            {'$match': broadcast_q},
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

        # ── Installazioni PWA attive (pwa_devices heartbeats) ──
        # "Attiva" = ha inviato un heartbeat negli ultimi N giorni. Un utente
        # che disinstalla l'app SMETTE di heartbeatare → dopo 30gg cade dal
        # counter "attive 30d". Il campo notification_permission ci permette
        # anche di calcolare la delta "installato ma push disattivate".
        active_30d_iso = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        active_7d_iso = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        dev_pipeline = [
            {'$match': {'organization_id': org_id}},
            {'$facet': {
                'total': [{'$count': 'n'}],
                'active_30d': [
                    {'$match': {'last_seen_at': {'$gte': active_30d_iso}}},
                    {'$count': 'n'},
                ],
                'active_7d': [
                    {'$match': {'last_seen_at': {'$gte': active_7d_iso}}},
                    {'$count': 'n'},
                ],
                'by_os_30d': [
                    {'$match': {'last_seen_at': {'$gte': active_30d_iso}}},
                    {'$group': {'_id': '$os', 'n': {'$sum': 1}}},
                ],
                # "Installato ma notifiche off" = permission != 'granted' fra
                # gli attivi 30d. Ci aiuta a capire il collo di bottiglia
                # (installazioni ok, ma il canale push è chiuso).
                'silenced_30d': [
                    {'$match': {
                        'last_seen_at': {'$gte': active_30d_iso},
                        'notification_permission': {'$ne': 'granted'},
                    }},
                    {'$count': 'n'},
                ],
            }},
        ]
        dev_agg = await db.pwa_devices.aggregate(dev_pipeline).to_list(1)
        d = dev_agg[0] if dev_agg else {}
        def _pick(k):
            arr = d.get(k, [])
            return arr[0]['n'] if arr and 'n' in arr[0] else 0
        by_os = {r['_id'] or 'other': r['n'] for r in d.get('by_os_30d', [])}

        return {
            'period': period,
            'subscribers': {
                'total': sub_total,
                'vendor_scope': sub_vendor_only,
                'org_scope': sub_org_wide,
            },
            'installs': {
                'active_30d': _pick('active_30d'),
                'active_7d': _pick('active_7d'),
                'total_ever': _pick('total'),
                'silenced_30d': _pick('silenced_30d'),
                'by_os': {
                    'ios':     by_os.get('ios', 0),
                    'android': by_os.get('android', 0),
                    'other':   by_os.get('other', 0) + by_os.get('desktop', 0),
                },
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

    @router.post('/analytics/reset')
    async def reset_push_analytics(req: ResetAnalyticsRequest,
                                    user: dict = Depends(get_current_user_dep)):
        """Wipe the org's push_broadcasts history (KPIs reset to 0). Requires
        the caller to type "RESET" so a single misclick can't nuke months of
        data. Subscribers list is left untouched — only the broadcast log
        and its sent/clicks counters disappear. Writes an audit entry to
        `analytics_reset_log` so admins can trace who reset what & when."""
        org_id = user.get('organization_id')
        if not org_id:
            raise HTTPException(403, 'Org context mancante')
        if (req.confirm or '').strip().upper() != 'RESET':
            raise HTTPException(400, 'Conferma non valida — digita RESET')
        result = await db.push_broadcasts.delete_many({'organization_id': org_id})
        deleted = result.deleted_count if result else 0
        audit_id = await _record_analytics_reset(
            db, organization_id=org_id, dashboard_type='push',
            user=user, deleted_count=deleted,
        )
        logger.info('push analytics reset org=%s by=%s deleted=%s',
                     org_id, user.get('email'), deleted)
        return {'deleted': deleted, 'audit_id': audit_id}

    @router.get('/analytics/audit-log')
    async def get_push_audit_log(user: dict = Depends(get_current_user_dep),
                                  limit: int = 20):
        """Returns the most recent push-dashboard reset operations for the
        caller's organization (org-scoped). Powers the 'Storico reset'
        accordion below the Push Analytics card."""
        org_id = user.get('organization_id')
        if not org_id:
            raise HTTPException(403, 'Org context mancante')
        cursor = db.analytics_reset_log.find(
            {'organization_id': org_id, 'dashboard_type': 'push'},
            {'_id': 0}
        ).sort('reset_at', -1).limit(max(1, min(limit, 100)))
        items = await cursor.to_list(100)
        return {'items': items}

    return router
