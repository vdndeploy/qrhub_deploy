"""Backend tests for Web Push Notifications (VAPID + subscribe + broadcast).

Endpoints under test:
  - GET  /api/push/public-key
  - POST /api/push/subscribe   (idempotent, vendor validation, scope fallback)
  - POST /api/push/unsubscribe
  - POST /api/push/broadcast   (auth required, tenant isolation, org-wide)
  - POST /api/posts (auto-push on create with notify_subscribers=true)
"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/') or \
    'https://qr-deploy-1.preview.emergentagent.com'

SUPER_EMAIL = 'superadmin@qrhub.it'
SUPER_PASSWORD = 'changeme123'
ORG_ADMIN_EMAIL = 'admin@example.com'
ORG_ADMIN_PASSWORD = 'admin123'


# ── Fixtures ──────────────────────────────────────────────────────────────

@pytest.fixture(scope='module')
def anon():
    s = requests.Session()
    s.headers.update({'Content-Type': 'application/json'})
    return s


@pytest.fixture(scope='module')
def super_admin():
    s = requests.Session()
    s.headers.update({'Content-Type': 'application/json'})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={'email': SUPER_EMAIL, 'password': SUPER_PASSWORD})
    assert r.status_code == 200, f"super login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope='module')
def org_admin():
    s = requests.Session()
    s.headers.update({'Content-Type': 'application/json'})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={'email': ORG_ADMIN_EMAIL, 'password': ORG_ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"org_admin login failed: {r.status_code} {r.text}")
    return s


@pytest.fixture(scope='module')
def org_admin_ctx(org_admin):
    me = org_admin.get(f"{BASE_URL}/api/auth/me").json()
    return me


@pytest.fixture(scope='module')
def vendor_in_org(org_admin):
    """Pick any vendor in the org_admin's tenant."""
    r = org_admin.get(f"{BASE_URL}/api/vendors")
    assert r.status_code == 200
    vendors = r.json()
    if not vendors:
        pytest.skip('no vendors in org_admin tenant')
    return vendors[0]


@pytest.fixture(scope='module')
def other_org_vendor(super_admin):
    """Create (or pick) a vendor that belongs to a DIFFERENT organization
    than the org_admin, to validate tenant isolation on broadcast."""
    orgs = super_admin.get(f"{BASE_URL}/api/organizations").json()
    target_org = next(
        (o for o in orgs if o['id'] != '6a383aa59bbc459260a5f6e6'), None
    )
    if not target_org:
        # Need to create a 2nd org
        slug = f"push-iso-{uuid.uuid4().hex[:6]}"
        r = super_admin.post(
            f"{BASE_URL}/api/organizations",
            json={'name': f"Push Isolation {slug}", 'slug': slug,
                  'brand_name': 'Iso', 'primary_color': '#000000'}
        )
        assert r.status_code in (200, 201), r.text
        target_org = r.json()
    # Try to fetch a vendor of that org via /api/vendors as super_admin
    vendors = super_admin.get(
        f"{BASE_URL}/api/vendors?organization_id={target_org['id']}"
    ).json()
    if vendors:
        return vendors[0]
    # If no vendor, surface as skip — main agent can seed.
    pytest.skip(f"no vendor in other org {target_org['id']}")


# ── 1. Public key ─────────────────────────────────────────────────────────

class TestPublicKey:
    def test_returns_valid_vapid(self, anon):
        r = anon.get(f"{BASE_URL}/api/push/public-key")
        assert r.status_code == 200, r.text
        data = r.json()
        assert 'publicKey' in data
        pk = data['publicKey']
        # base64url, no padding, ~87 chars (65 raw bytes → 88 then strip '=')
        assert isinstance(pk, str)
        assert len(pk) >= 86 and len(pk) <= 88, f"length={len(pk)}"
        assert pk.startswith('B'), f"prefix not B: {pk[:3]}"
        # No '=' padding
        assert '=' not in pk
        # No '/' or '+' (base64url, not standard base64)
        assert '/' not in pk and '+' not in pk


# ── 2. Subscribe ──────────────────────────────────────────────────────────

def _make_sub_payload(vendor_id, endpoint=None, scope='vendor'):
    return {
        'endpoint': endpoint or f"https://fcm.googleapis.com/fcm/send/TEST-{uuid.uuid4().hex}",
        'keys': {
            'p256dh': 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
            'auth': 'tBHItJI5svbpez7KI4CCXg',
        },
        'vendor_id': vendor_id,
        'scope': scope,
    }


class TestSubscribe:
    def test_subscribe_creates_subscription(self, anon, vendor_in_org):
        payload = _make_sub_payload(vendor_in_org['id'])
        r = anon.post(f"{BASE_URL}/api/push/subscribe", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data['status'] == 'subscribed'
        assert data['scope'] == 'vendor'

    def test_subscribe_idempotent_upsert(self, anon, vendor_in_org):
        ep = f"https://fcm.googleapis.com/fcm/send/IDEMP-{uuid.uuid4().hex}"
        payload = _make_sub_payload(vendor_in_org['id'], endpoint=ep)
        r1 = anon.post(f"{BASE_URL}/api/push/subscribe", json=payload)
        r2 = anon.post(f"{BASE_URL}/api/push/subscribe", json=payload)
        assert r1.status_code == 200 and r2.status_code == 200, \
            f"{r1.status_code}/{r2.status_code} {r1.text} {r2.text}"
        # Both succeed → upsert worked (no duplicate-key 500/409)
        # Cleanup
        anon.post(f"{BASE_URL}/api/push/unsubscribe", json={'endpoint': ep})

    def test_subscribe_unknown_vendor_404(self, anon):
        payload = _make_sub_payload(f"nonexistent-{uuid.uuid4().hex}")
        r = anon.post(f"{BASE_URL}/api/push/subscribe", json=payload)
        assert r.status_code == 404, r.text

    def test_subscribe_invalid_scope_fallbacks_to_vendor(self, anon, vendor_in_org):
        payload = _make_sub_payload(vendor_in_org['id'], scope='garbage')
        r = anon.post(f"{BASE_URL}/api/push/subscribe", json=payload)
        assert r.status_code == 200, r.text
        assert r.json()['scope'] == 'vendor'

    def test_pydantic_validation_p256dh_max(self, anon, vendor_in_org):
        payload = _make_sub_payload(vendor_in_org['id'])
        payload['keys']['p256dh'] = 'x' * 201
        r = anon.post(f"{BASE_URL}/api/push/subscribe", json=payload)
        assert r.status_code in (400, 422), r.text

    def test_pydantic_validation_auth_max(self, anon, vendor_in_org):
        payload = _make_sub_payload(vendor_in_org['id'])
        payload['keys']['auth'] = 'x' * 81
        r = anon.post(f"{BASE_URL}/api/push/subscribe", json=payload)
        assert r.status_code in (400, 422), r.text


# ── 3. Unsubscribe ────────────────────────────────────────────────────────

class TestUnsubscribe:
    def test_unsubscribe_removes(self, anon, vendor_in_org):
        ep = f"https://fcm.googleapis.com/fcm/send/UNSUB-{uuid.uuid4().hex}"
        r1 = anon.post(f"{BASE_URL}/api/push/subscribe",
                       json=_make_sub_payload(vendor_in_org['id'], endpoint=ep))
        assert r1.status_code == 200
        r2 = anon.post(f"{BASE_URL}/api/push/unsubscribe",
                       json={'endpoint': ep})
        assert r2.status_code == 200
        assert r2.json()['status'] == 'unsubscribed'


# ── 4. Broadcast ──────────────────────────────────────────────────────────

class TestBroadcast:
    def test_broadcast_requires_auth(self, anon):
        r = anon.post(f"{BASE_URL}/api/push/broadcast",
                      json={'title': 'X', 'body': 'Y'})
        assert r.status_code == 401, r.text

    def test_broadcast_org_admin_own_vendor_ok(self, org_admin, vendor_in_org):
        r = org_admin.post(f"{BASE_URL}/api/push/broadcast", json={
            'title': 'Saldi', 'body': 'Sconti fino al 50%',
            'vendor_id': vendor_in_org['id'], 'url': '/',
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert 'sent' in data and 'cleaned_stale' in data
        assert isinstance(data['sent'], int)
        assert isinstance(data['cleaned_stale'], int)

    def test_broadcast_other_org_vendor_404(self, org_admin, other_org_vendor):
        r = org_admin.post(f"{BASE_URL}/api/push/broadcast", json={
            'title': 'X', 'body': 'Y',
            'vendor_id': other_org_vendor['id'],
        })
        assert r.status_code == 404, r.text

    def test_broadcast_orgwide_no_vendor(self, org_admin):
        r = org_admin.post(f"{BASE_URL}/api/push/broadcast", json={
            'title': 'Org-wide', 'body': 'Tutti gli iscritti',
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert 'sent' in data and 'cleaned_stale' in data

    def test_broadcast_title_max_120(self, org_admin):
        r = org_admin.post(f"{BASE_URL}/api/push/broadcast", json={
            'title': 'A' * 121, 'body': 'ok',
        })
        assert r.status_code in (400, 422), r.text

    def test_broadcast_body_max_400(self, org_admin):
        r = org_admin.post(f"{BASE_URL}/api/push/broadcast", json={
            'title': 'ok', 'body': 'A' * 401,
        })
        assert r.status_code in (400, 422), r.text


# ── 5. Auto-push on POST /api/posts ───────────────────────────────────────

class TestAutoPushOnPostCreate:
    def test_create_multistore_post_with_notify_returns_200(
        self, org_admin, vendor_in_org
    ):
        # Find a store_id in the same org
        stores = org_admin.get(f"{BASE_URL}/api/stores").json()
        assert isinstance(stores, list) and len(stores) > 0
        sid = stores[0]['id']
        payload = {
            'store_ids': [sid],
            'title': 'TEST_PUSH_AUTO',
            'text': 'TEST body for auto-push',
            'enabled': True,
            'notify_subscribers': True,
        }
        r = org_admin.post(f"{BASE_URL}/api/posts", json=payload)
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert 'group_id' in data
        # Cleanup
        gid = data['group_id']
        org_admin.delete(f"{BASE_URL}/api/posts/group/{gid}")



# ── 6. Push Analytics & Click Tracking ────────────────────────────────────

class TestPushAnalytics:
    def test_analytics_requires_auth(self, anon):
        r = anon.get(f"{BASE_URL}/api/push/analytics")
        assert r.status_code == 401, r.text

    def test_analytics_returns_org_scoped_shape(self, org_admin):
        r = org_admin.get(f"{BASE_URL}/api/push/analytics")
        assert r.status_code == 200, r.text
        d = r.json()
        # Schema sanity
        for k in ('subscribers', 'totals', 'by_vendor', 'recent_broadcasts'):
            assert k in d, f"missing {k}: {d}"
        for k in ('total', 'vendor_scope', 'org_scope'):
            assert k in d['subscribers']
        for k in ('broadcasts', 'sent', 'clicks', 'ctr_pct'):
            assert k in d['totals']
        assert isinstance(d['by_vendor'], list)
        assert isinstance(d['recent_broadcasts'], list)

    def test_broadcast_now_returns_broadcast_id(self, org_admin):
        r = org_admin.post(f"{BASE_URL}/api/push/broadcast", json={
            'title': 'TEST_ANALYTICS_BCAST', 'body': 'verifico shape',
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert 'broadcast_id' in d and isinstance(d['broadcast_id'], str)
        assert len(d['broadcast_id']) >= 16

    def test_track_click_increments_counter(self, org_admin):
        # 1. Fire a broadcast and capture the id
        b = org_admin.post(f"{BASE_URL}/api/push/broadcast", json={
            'title': 'TEST_ANALYTICS_CLICKS', 'body': 'CTR test',
        }).json()
        bid = b['broadcast_id']
        # 2. Hit the public track-click 3 times (no auth required)
        for _ in range(3):
            r = requests.post(f"{BASE_URL}/api/push/track-click",
                              json={'broadcast_id': bid})
            assert r.status_code == 200, r.text
            assert r.json()['status'] == 'ok'
        # 3. Verify the analytics endpoint reflects the new click count
        analytics = org_admin.get(f"{BASE_URL}/api/push/analytics").json()
        # Find our broadcast in recent_broadcasts
        match = next((x for x in analytics['recent_broadcasts'] if x['id'] == bid), None)
        assert match is not None, 'broadcast missing from analytics'
        assert match['clicks'] == 3, f"expected 3 clicks, got {match}"

    def test_track_click_unknown_id_silent_ok(self):
        # SW should never retry — backend must accept gracefully.
        r = requests.post(f"{BASE_URL}/api/push/track-click",
                          json={'broadcast_id': 'nonexistent' + uuid.uuid4().hex})
        assert r.status_code == 200, r.text

    def test_track_click_invalid_payload(self):
        r = requests.post(f"{BASE_URL}/api/push/track-click", json={})
        assert r.status_code == 422, r.text



# ── 7. URL personalization in broadcast_push payload ─────────────────────
# These tests verify the bug fix: when the admin doesn't pass an explicit
# url (or passes '/'), each subscriber receives a payload pointing to
# /v/{their_own_vendor_id} so the SW landing avoids the DomainGuard root
# block on custom domains. We test the helper directly because actually
# sending the push requires VAPID and the upstream FCM endpoint.

class TestPushUrlPersonalization:
    def test_payload_personalized_when_url_empty(self):
        """broadcast_push with url='' or '/' must build payloads with
        per-subscriber url='/v/<vendor_id>'."""
        import asyncio
        import sys
        sys.path.insert(0, '/app/backend')
        from routers import push as push_mod

        # We mock _send_one to capture the payload JSONs without actually
        # contacting push services.
        captured = []
        def fake_send(sub, payload_json, *_):
            captured.append((sub.get('endpoint'), payload_json))
            return None  # not stale

        class FakeDB:
            class _push_config:
                @staticmethod
                async def find_one(_q):
                    return {'_id': 'vapid', 'private_key': 'fake', 'subject': 'mailto:t@t.it'}
            class _push_subscriptions:
                @staticmethod
                def find(_q):
                    class _C:
                        async def to_list(self, _n):
                            return [
                                {'endpoint': 'e1', 'vendor_id': 'v-aaa', 'organization_id': 'org1', 'scope': 'organization'},
                                {'endpoint': 'e2', 'vendor_id': 'v-bbb', 'organization_id': 'org1', 'scope': 'vendor'},
                            ]
                    return _C()
                @staticmethod
                async def delete_many(_q): return None
            class _push_broadcasts:
                @staticmethod
                async def insert_one(_d): return None
                @staticmethod
                async def update_one(*_a, **_k): return None
            push_config = _push_config()
            push_subscriptions = _push_subscriptions()
            push_broadcasts = _push_broadcasts()

        original_send = push_mod._send_one
        push_mod._send_one = fake_send
        try:
            sent, removed, bid = asyncio.run(push_mod.broadcast_push(
                FakeDB(), organization_id='org1',
                title='X', body='Y', url='', origin='manual'
            ))
        finally:
            push_mod._send_one = original_send

        assert sent == 2, f"expected 2 sent, got {sent}"
        assert removed == 0
        assert bid and isinstance(bid, str)
        # Verify each captured payload has the per-subscriber URL
        import json
        for endpoint, raw in captured:
            d = json.loads(raw)
            if endpoint == 'e1':
                assert d['url'] == '/v/v-aaa', f"e1 url wrong: {d['url']}"
            elif endpoint == 'e2':
                assert d['url'] == '/v/v-bbb', f"e2 url wrong: {d['url']}"
            assert d['title'] == 'X'
            assert d['body'] == 'Y'
            assert 'broadcast_id' in d

    def test_payload_uses_explicit_url_when_provided(self):
        """When the admin passes a real URL like '/promo', that takes
        precedence over per-subscriber personalization."""
        import asyncio
        from routers import push as push_mod

        captured = []
        def fake_send(sub, payload_json, *_):
            captured.append(payload_json); return None

        class FakeDB:
            class _push_config:
                @staticmethod
                async def find_one(_q):
                    return {'_id': 'vapid', 'private_key': 'fake', 'subject': 'mailto:t@t.it'}
            class _push_subscriptions:
                @staticmethod
                def find(_q):
                    class _C:
                        async def to_list(self, _n):
                            return [{'endpoint': 'e1', 'vendor_id': 'v-aaa',
                                     'organization_id': 'org1', 'scope': 'vendor'}]
                    return _C()
                @staticmethod
                async def delete_many(_q): return None
            class _push_broadcasts:
                @staticmethod
                async def insert_one(_d): return None
                @staticmethod
                async def update_one(*_a, **_k): return None
            push_config = _push_config()
            push_subscriptions = _push_subscriptions()
            push_broadcasts = _push_broadcasts()

        original_send = push_mod._send_one
        push_mod._send_one = fake_send
        try:
            asyncio.run(push_mod.broadcast_push(
                FakeDB(), organization_id='org1',
                title='X', body='Y', url='/promo-windtre', origin='manual'
            ))
        finally:
            push_mod._send_one = original_send

        import json
        d = json.loads(captured[0])
        assert d['url'] == '/promo-windtre', f"expected explicit url, got {d['url']}"


# ── 8. Vendor scoping in broadcast_push query (BUG FIX) ──────────────────
# Critical privacy fix: when the admin selects a specific vendor in the
# Lancia Offerta dialog, the push must NOT leak to subscribers of OTHER
# vendors of the same org — even if those subs opted into "tutte le
# offerte del brand" (scope='organization'). The org-wide opt-in still
# works for AUTO-push (post creation) so brand-wide subscribers keep
# receiving announcements from any vendor; only the MANUAL targeted
# broadcast is strict.

class TestVendorScopingFix:
    def _patch_db(self, subs):
        """Build a FakeDB that returns whatever the caller's query
        actually matched against `subs`. We re-implement the MongoDB
        match logic for {'vendor_id': X}, the $or shape used for
        include_org_scope=True, and {'organization_id': Y}."""
        captured_query = {}
        def _matches(doc, q):
            if '$or' in q:
                return any(_matches(doc, sub_q) for sub_q in q['$or'])
            return all(doc.get(k) == v for k, v in q.items())

        class FakeDB:
            class _push_config:
                @staticmethod
                async def find_one(_q):
                    return {'_id': 'vapid', 'private_key': 'fake', 'subject': 'mailto:t@t.it'}
            class _push_subscriptions:
                @staticmethod
                def find(q):
                    captured_query.update({'last': q})
                    matched = [s for s in subs if _matches(s, q)]
                    class _C:
                        async def to_list(self, _n):
                            return matched
                    return _C()
                @staticmethod
                async def delete_many(_q): return None
            class _push_broadcasts:
                @staticmethod
                async def insert_one(_d): return None
                @staticmethod
                async def update_one(*_a, **_k): return None
            push_config = _push_config()
            push_subscriptions = _push_subscriptions()
            push_broadcasts = _push_broadcasts()

        return FakeDB(), captured_query

    def _run(self, db, vendor_id, organization_id, include_org_scope):
        """Drive broadcast_push and capture the endpoints actually pushed."""
        import asyncio, sys
        sys.path.insert(0, '/app/backend')
        from routers import push as push_mod

        captured_endpoints = []
        def fake_send(sub, _payload_json, *_):
            captured_endpoints.append(sub.get('endpoint'))
            return None
        original_send = push_mod._send_one
        push_mod._send_one = fake_send
        try:
            sent, removed, bid = asyncio.run(push_mod.broadcast_push(
                db, vendor_id=vendor_id, organization_id=organization_id,
                title='Flash', body='Sale', url='/',
                origin='manual', include_org_scope=include_org_scope
            ))
        finally:
            push_mod._send_one = original_send
        return captured_endpoints, sent

    def test_manual_vendor_broadcast_strict_no_cross_vendor_leak(self):
        """Bug fix: admin selects Vendor A → only A's subs receive the push.
        A subscriber who landed on Vendor B and chose 'tutte le offerte'
        (scope='organization') MUST NOT receive this push."""
        subs = [
            # Vendor A subs — should all receive (vendor scope + org scope on A)
            {'endpoint': 'A-vendor', 'vendor_id': 'A', 'organization_id': 'org1', 'scope': 'vendor'},
            {'endpoint': 'A-org', 'vendor_id': 'A', 'organization_id': 'org1', 'scope': 'organization'},
            # Vendor B subs — must NOT receive
            {'endpoint': 'B-vendor', 'vendor_id': 'B', 'organization_id': 'org1', 'scope': 'vendor'},
            {'endpoint': 'B-org', 'vendor_id': 'B', 'organization_id': 'org1', 'scope': 'organization'},
            # Vendor C in another org — must NOT receive
            {'endpoint': 'C-other-org', 'vendor_id': 'C', 'organization_id': 'org2', 'scope': 'organization'},
        ]
        db, _ = self._patch_db(subs)
        endpoints, sent = self._run(db, vendor_id='A', organization_id='org1',
                                     include_org_scope=False)
        assert sent == 2, f"expected 2 sent (A's subs), got {sent}: {endpoints}"
        assert set(endpoints) == {'A-vendor', 'A-org'}, \
            f"cross-vendor leak detected: {endpoints}"
        assert 'B-vendor' not in endpoints
        assert 'B-org' not in endpoints
        assert 'C-other-org' not in endpoints

    def test_auto_vendor_broadcast_keeps_org_wide_subs(self):
        """Regression: auto-push from post creation must still reach
        org-wide subs (scope='organization') of OTHER vendors so the
        'tutte le offerte del brand' subscription stays meaningful."""
        subs = [
            {'endpoint': 'A-vendor', 'vendor_id': 'A', 'organization_id': 'org1', 'scope': 'vendor'},
            {'endpoint': 'B-vendor', 'vendor_id': 'B', 'organization_id': 'org1', 'scope': 'vendor'},
            {'endpoint': 'B-org', 'vendor_id': 'B', 'organization_id': 'org1', 'scope': 'organization'},
            {'endpoint': 'C-other-org', 'vendor_id': 'C', 'organization_id': 'org2', 'scope': 'organization'},
        ]
        db, _ = self._patch_db(subs)
        endpoints, sent = self._run(db, vendor_id='A', organization_id='org1',
                                     include_org_scope=True)
        # A's own vendor sub + B's org-wide sub (cross-vendor opt-in)
        # The other-org sub stays out (different organization_id).
        assert set(endpoints) == {'A-vendor', 'B-org'}, f"unexpected: {endpoints}"
        assert sent == 2

    def test_org_wide_broadcast_reaches_all_org_subs(self):
        """Admin picks 'Tutti gli iscritti dell'organizzazione' → vendor_id
        is None → every sub of the org receives, regardless of scope."""
        subs = [
            {'endpoint': 'A-vendor', 'vendor_id': 'A', 'organization_id': 'org1', 'scope': 'vendor'},
            {'endpoint': 'A-org', 'vendor_id': 'A', 'organization_id': 'org1', 'scope': 'organization'},
            {'endpoint': 'B-vendor', 'vendor_id': 'B', 'organization_id': 'org1', 'scope': 'vendor'},
            {'endpoint': 'C-other-org', 'vendor_id': 'C', 'organization_id': 'org2', 'scope': 'vendor'},
        ]
        db, _ = self._patch_db(subs)
        endpoints, sent = self._run(db, vendor_id=None, organization_id='org1',
                                     include_org_scope=False)  # ignored when vendor_id is None
        assert set(endpoints) == {'A-vendor', 'A-org', 'B-vendor'}
        assert sent == 3
        assert 'C-other-org' not in endpoints  # tenant isolation
