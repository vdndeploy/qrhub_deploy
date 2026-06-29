"""Top Vendors endpoint regression tests (iteration 22)."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    # Fall back to frontend/.env
    try:
        with open('/app/frontend/.env') as f:
            for line in f:
                if line.startswith('REACT_APP_BACKEND_URL='):
                    BASE_URL = line.split('=', 1)[1].strip().rstrip('/')
                    break
    except Exception:
        pass

ADMIN_EMAIL = 'admin@example.com'
ADMIN_PASS = 'admin123'


@pytest.fixture(scope='module')
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={'email': ADMIN_EMAIL, 'password': ADMIN_PASS}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope='module')
def admin_org_id(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/auth/me", timeout=20)
    assert r.status_code == 200
    return r.json().get('organization_id')


# --- Auth ---------------------------------------------------------------

def test_top_vendors_requires_auth():
    r = requests.get(f"{BASE_URL}/api/analytics/top-vendors?period=30d", timeout=20)
    assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"


# --- Shape & ordering ---------------------------------------------------

def test_top_vendors_30d_shape(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/analytics/top-vendors?period=30d", timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    for k in ('period', 'start', 'end', 'items'):
        assert k in body, f"missing key {k}"
    assert body['period'] == '30d'
    assert isinstance(body['items'], list)
    # Items shape
    if body['items']:
        item = body['items'][0]
        for k in ('vendor_id', 'vendor_name', 'profile_image_url',
                  'scans', 'whatsapp_clicks', 'ctr_pct'):
            assert k in item, f"missing item key {k}"
    # Ordered by scans desc
    scans = [it['scans'] for it in body['items']]
    assert scans == sorted(scans, reverse=True), f"items not ordered desc: {scans}"


# --- Deterministic seeded data ----------------------------------------

def test_top_vendors_30d_seeded_values(admin_session):
    """Iter 22 seed: vendor1=25/5, vendor2=12/2, vendor3=5/0 (QA org)."""
    r = admin_session.get(f"{BASE_URL}/api/analytics/top-vendors?period=30d", timeout=30)
    assert r.status_code == 200
    items = r.json()['items']
    # Look at top 3 by scans
    assert len(items) >= 3, f"expected >=3 items, got {len(items)}: {items}"
    top3 = items[:3]
    actual = [(it['scans'], it['whatsapp_clicks'], it['ctr_pct']) for it in top3]
    expected = [(25, 5, 20.0), (12, 2, 16.7), (5, 0, 0.0)]
    assert actual == expected, f"expected {expected}, got {actual}"


# --- Tenant isolation --------------------------------------------------

def test_top_vendors_tenant_isolation(admin_session, admin_org_id):
    r = admin_session.get(f"{BASE_URL}/api/analytics/top-vendors?period=30d&limit=50", timeout=30)
    assert r.status_code == 200
    for it in r.json()['items']:
        # organization_id may be in response (optional check)
        oid = it.get('organization_id')
        if oid is not None:
            assert oid == admin_org_id, f"cross-tenant leak: {oid} != {admin_org_id}"


# --- Period filter -----------------------------------------------------

@pytest.mark.parametrize('period', ['today', 'yesterday', '7d', '30d', 'month'])
def test_top_vendors_period_filters(admin_session, period):
    r = admin_session.get(f"{BASE_URL}/api/analytics/top-vendors?period={period}", timeout=30)
    assert r.status_code == 200, f"{period}: {r.status_code} {r.text}"
    body = r.json()
    assert body['period'] == period
    assert isinstance(body['items'], list)


# --- Limit -------------------------------------------------------------

def test_top_vendors_limit_2(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/analytics/top-vendors?period=30d&limit=2", timeout=30)
    assert r.status_code == 200
    assert len(r.json()['items']) <= 2


def test_top_vendors_limit_cap_at_50(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/analytics/top-vendors?period=30d&limit=100", timeout=30)
    assert r.status_code == 200
    assert len(r.json()['items']) <= 50
