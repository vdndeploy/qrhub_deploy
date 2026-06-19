"""Iteration 3 — Test new analytics period filters (today/yesterday) and
expanded click types (appointment_click + pwa_install) for:
- /api/analytics/daily-counter?days=1&offset_days=1 (Ieri)
- /api/analytics/detailed?period=today|yesterday (KPI cards)
- /api/analytics/detailed click_breakdown includes 9 channels
- /api/vendor/stats?period=today|yesterday|7d|month|all with 9-channel breakdown
"""
import os
import pytest
import requests

def _load_base_url():
    url = os.environ.get('REACT_APP_BACKEND_URL', '')
    if not url:
        try:
            with open('/app/frontend/.env') as f:
                for line in f:
                    if line.startswith('REACT_APP_BACKEND_URL='):
                        url = line.split('=', 1)[1].strip()
                        break
        except Exception:
            pass
    return url.rstrip('/')

BASE_URL = _load_base_url()
SUPER_EMAIL = 'superadmin@qrhub.it'
SUPER_PASSWORD = 'ErnDan24.10'

EXPECTED_CLICK_TYPES = [
    'whatsapp_click', 'instagram_click', 'facebook_click', 'review_click',
    'tiktok_click', 'maps_click', 'post_cta_click',
    'appointment_click', 'pwa_install',
]


@pytest.fixture(scope='module')
def super_session():
    s = requests.Session()
    s.headers.update({'Content-Type': 'application/json'})
    r = s.post(f'{BASE_URL}/api/auth/login',
               json={'email': SUPER_EMAIL, 'password': SUPER_PASSWORD})
    assert r.status_code == 200, f'Super login failed: {r.status_code} {r.text}'
    return s


@pytest.fixture(scope='module')
def vento_org_id(super_session):
    """Find VENTO DEL NORD SRL organization id (has live analytics data)."""
    r = super_session.get(f'{BASE_URL}/api/organizations')
    assert r.status_code == 200, r.text
    orgs = r.json()
    vento = next((o for o in orgs if 'VENTO DEL NORD' in (o.get('name') or '').upper()), None)
    assert vento is not None, f'VENTO DEL NORD not found in {[o.get("name") for o in orgs]}'
    return vento['id']


@pytest.fixture(scope='module')
def vento_super_session(super_session, vento_org_id):
    """Impersonate VENTO DEL NORD as super admin via active-org cookie or
    similar. Falls back to using super session if impersonation endpoint
    differs. We try to set the impersonated org context via /api/auth/impersonate-org."""
    # Try common impersonation patterns
    for path in ['/api/auth/impersonate-org', '/api/organizations/impersonate',
                 f'/api/organizations/{vento_org_id}/impersonate']:
        r = super_session.post(f'{BASE_URL}{path}',
                               json={'organization_id': vento_org_id})
        if r.status_code == 200:
            return super_session
    # If no impersonation endpoint exists, super sees all data — that's fine.
    return super_session


# ─── /analytics/daily-counter Ieri (yesterday hourly) ───

class TestDailyCounterIeri:
    def test_yesterday_returns_24_hourly_buckets(self, vento_super_session):
        r = vento_super_session.get(
            f'{BASE_URL}/api/analytics/daily-counter?days=1&offset_days=1')
        assert r.status_code == 200, r.text
        body = r.json()
        # Series has 1 entry (yesterday's date)
        assert isinstance(body.get('series'), list) and len(body['series']) == 1, body
        # hourly_series populated (since days==1)
        assert body.get('hourly_series') is not None, 'hourly_series should be set when days=1'
        assert isinstance(body['hourly_series'], list) and len(body['hourly_series']) == 24
        for h, row in enumerate(body['hourly_series']):
            assert row['hour'] == h
            assert 'scans' in row and 'whatsapp' in row

    def test_today_returns_24_hourly_buckets(self, vento_super_session):
        r = vento_super_session.get(
            f'{BASE_URL}/api/analytics/daily-counter?days=1&offset_days=0')
        assert r.status_code == 200, r.text
        body = r.json()
        assert len(body['series']) == 1
        assert body.get('hourly_series') is not None
        assert len(body['hourly_series']) == 24

    def test_7d_no_hourly_series(self, vento_super_session):
        r = vento_super_session.get(f'{BASE_URL}/api/analytics/daily-counter?days=7')
        assert r.status_code == 200, r.text
        body = r.json()
        assert len(body['series']) == 7
        # hourly_series should be None when days != 1
        assert body.get('hourly_series') is None


# ─── /analytics/detailed today/yesterday + 9 click channels ───

class TestDetailedAnalyticsToday:
    REQ_KEYS = {'period', 'start', 'end', 'total_events', 'total_views',
                'total_clicks', 'click_breakdown', 'device_breakdown',
                'top_cities', 'timeline', 'hourly_pattern', 'event_log'}

    def _validate(self, body, expected_period):
        missing = self.REQ_KEYS - set(body.keys())
        assert not missing, f'missing keys: {missing}'
        assert body['period'] == expected_period
        cb = body['click_breakdown']
        for ct in EXPECTED_CLICK_TYPES:
            assert ct in cb, f'Missing click type {ct} in click_breakdown (got {list(cb.keys())})'
        assert isinstance(body['hourly_pattern'], list) and len(body['hourly_pattern']) == 24

    def test_period_today(self, vento_super_session):
        r = vento_super_session.get(f'{BASE_URL}/api/analytics/detailed?period=today')
        assert r.status_code == 200, r.text
        self._validate(r.json(), 'today')

    def test_period_yesterday(self, vento_super_session):
        r = vento_super_session.get(f'{BASE_URL}/api/analytics/detailed?period=yesterday')
        assert r.status_code == 200, r.text
        self._validate(r.json(), 'yesterday')

    def test_period_7d_has_9_channels(self, vento_super_session):
        r = vento_super_session.get(f'{BASE_URL}/api/analytics/detailed?period=7d')
        assert r.status_code == 200, r.text
        self._validate(r.json(), '7d')

    def test_period_30d(self, vento_super_session):
        r = vento_super_session.get(f'{BASE_URL}/api/analytics/detailed?period=30d')
        assert r.status_code == 200, r.text
        self._validate(r.json(), '30d')

    def test_period_month(self, vento_super_session):
        r = vento_super_session.get(f'{BASE_URL}/api/analytics/detailed?period=month')
        assert r.status_code == 200, r.text
        self._validate(r.json(), 'month')


# ─── /vendor/stats with period query + 9 channels ───
# We need a vendor session. We try to use any vendor with credentials from VENTO.

@pytest.fixture(scope='module')
def vendor_session(super_session, vento_org_id):
    """Create an ephemeral vendor under VENTO, set creds, login. Cleanup at end."""
    # Find a store under VENTO
    r = super_session.get(f'{BASE_URL}/api/stores?organization_id={vento_org_id}')
    if r.status_code != 200:
        pytest.skip(f'Cannot list stores: {r.status_code}')
    stores = r.json()
    if not stores:
        pytest.skip('No stores in VENTO to attach vendor')
    store_id = stores[0]['id']

    # Create vendor
    r = super_session.post(f'{BASE_URL}/api/vendors', json={
        'name': 'TEST_VendorPeriods',
        'bio': 'bio',
        'store_id': store_id,
        'organization_id': vento_org_id,
    })
    if r.status_code != 200:
        pytest.skip(f'Vendor create failed: {r.status_code} {r.text}')
    vid = r.json()['id']

    # Set credentials
    email = 'TEST_vendor_periods@example.com'
    pwd = 'VendPeriods123!'
    r = super_session.post(
        f'{BASE_URL}/api/vendors/{vid}/credentials',
        json={'email': email, 'password': pwd})
    if r.status_code != 200:
        super_session.delete(f'{BASE_URL}/api/vendors/{vid}')
        pytest.skip(f'Vendor cred set failed: {r.status_code} {r.text}')

    vs = requests.Session()
    vs.headers.update({'Content-Type': 'application/json'})
    r = vs.post(f'{BASE_URL}/api/vendor-auth/login',
                json={'email': email, 'password': pwd})
    if r.status_code != 200:
        super_session.delete(f'{BASE_URL}/api/vendors/{vid}')
        pytest.skip(f'Vendor login failed: {r.status_code} {r.text}')

    yield vs

    # Cleanup
    try:
        super_session.delete(f'{BASE_URL}/api/vendors/{vid}')
    except Exception:
        pass


class TestVendorStatsPeriods:
    def _check_breakdown(self, body):
        assert 'click_breakdown' in body
        cb = body['click_breakdown']
        for ct in EXPECTED_CLICK_TYPES:
            assert ct in cb, f'Missing {ct} in vendor stats click_breakdown (got {list(cb.keys())})'

    @pytest.mark.parametrize('period', ['today', 'yesterday', '7d', 'month', 'all'])
    def test_periods(self, vendor_session, period):
        r = vendor_session.get(f'{BASE_URL}/api/vendor/stats?period={period}')
        assert r.status_code == 200, f'period={period} -> {r.status_code} {r.text}'
        self._check_breakdown(r.json())

    def test_no_period_defaults_ok(self, vendor_session):
        r = vendor_session.get(f'{BASE_URL}/api/vendor/stats')
        assert r.status_code == 200
        self._check_breakdown(r.json())


# ─── CLICK_TYPES whitelist accepts the new event types ───

class TestNewEventTypeWhitelist:
    def test_appointment_and_pwa_install_tracked(self, super_session, vento_org_id):
        # Get any vendor in VENTO
        r = super_session.get(f'{BASE_URL}/api/vendors?organization_id={vento_org_id}')
        if r.status_code != 200 or not r.json():
            pytest.skip('No vendors to track against')
        vid = r.json()[0]['id']
        s = requests.Session()
        for et in ['appointment_click', 'pwa_install']:
            r = s.post(f'{BASE_URL}/api/analytics',
                       json={'vendor_id': vid, 'event_type': et})
            assert r.status_code == 200, f'{et} rejected: {r.status_code} {r.text}'
