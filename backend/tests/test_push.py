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
