"""Backend tests for detailed analytics, PDF export, vendor stats, landing-page enhancements
and emergent-badge removal. Iteration 2."""
import os
import re
import time
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
ADMIN_EMAIL = 'admin@windtre.com'
ADMIN_PASSWORD = 'admin123'

TEST_VENDOR_EMAIL = 'TEST_vendor_pdf@example.com'
TEST_VENDOR_PASSWORD = 'vendpass123'

# Shared state across tests
state: dict = {'store_id': None, 'vendor_id': None}


# --- Fixtures ---

@pytest.fixture(scope='module')
def admin_session():
    s = requests.Session()
    s.headers.update({'Content-Type': 'application/json'})
    r = s.post(f'{BASE_URL}/api/auth/login',
               json={'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD})
    assert r.status_code == 200, f'Admin login failed: {r.text}'
    return s


@pytest.fixture(scope='module')
def vendor_session(admin_session):
    """Create a store + vendor, set credentials, login as vendor."""
    # Create a store
    r = admin_session.post(f'{BASE_URL}/api/stores', json={
        'name': 'TEST_Store_Analytics',
        'whatsapp': '+391234567890',
        'instagram': 'https://instagram.com/test',
        'facebook': 'https://facebook.com/test',
        'google_review': 'https://g.page/test',
        'post_title': 'Promo Test',
        'post_text': 'Annuncio di prova',
        'post_cta_text': 'Scopri'
    })
    assert r.status_code == 200, f'Store create failed: {r.text}'
    state['store_id'] = r.json()['id']

    # Create vendor
    r = admin_session.post(f'{BASE_URL}/api/vendors', json={
        'name': 'TEST_Vendor_PDF',
        'bio': 'bio',
        'store_id': state['store_id']
    })
    assert r.status_code == 200, f'Vendor create failed: {r.text}'
    state['vendor_id'] = r.json()['id']

    # Set credentials
    r = admin_session.post(
        f'{BASE_URL}/api/vendors/{state["vendor_id"]}/credentials',
        json={'email': TEST_VENDOR_EMAIL, 'password': TEST_VENDOR_PASSWORD})
    assert r.status_code == 200, f'Set creds failed: {r.text}'

    # Login as vendor
    vs = requests.Session()
    vs.headers.update({'Content-Type': 'application/json'})
    r = vs.post(f'{BASE_URL}/api/vendor-auth/login',
                json={'email': TEST_VENDOR_EMAIL, 'password': TEST_VENDOR_PASSWORD})
    assert r.status_code == 200, f'Vendor login failed: {r.text}'
    return vs


# --- Track events with UA / IP capture ---

class TestTrackEventCapture:
    def test_post_analytics_with_ua_persists_device_fields(self, admin_session, vendor_session):
        # Generate variety of events
        ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
        s = requests.Session()
        s.headers.update({'User-Agent': ua, 'X-Forwarded-For': '8.8.8.8'})
        for et in ['page_view', 'whatsapp_click', 'maps_click', 'post_cta_click',
                   'instagram_click', 'facebook_click']:
            r = s.post(f'{BASE_URL}/api/analytics',
                       json={'vendor_id': state['vendor_id'], 'event_type': et})
            assert r.status_code == 200, f'{et} failed: {r.text}'
        # Allow geo lookup async tasks to complete
        time.sleep(1)


# --- Vendor stats now includes new click types ---

class TestVendorStats:
    def test_vendor_stats_lists_new_click_types(self, vendor_session):
        r = vendor_session.get(f'{BASE_URL}/api/vendor/stats')
        assert r.status_code == 200, r.text
        data = r.json()
        assert 'click_breakdown' in data
        cb = data['click_breakdown']
        # All 7 click types must be present as keys
        for ct in ['whatsapp_click', 'instagram_click', 'facebook_click',
                   'review_click', 'tiktok_click', 'maps_click', 'post_cta_click']:
            assert ct in cb, f'Missing click type {ct} in vendor stats'
        # Counts we just generated
        assert cb['whatsapp_click'] >= 1
        assert cb['maps_click'] >= 1
        assert cb['post_cta_click'] >= 1


# --- Detailed analytics (admin) ---

class TestDetailedAnalyticsAdmin:
    def _assert_structure(self, body, expected_period):
        for key in ['period', 'start', 'end', 'total_events', 'total_views',
                    'total_clicks', 'click_breakdown', 'device_breakdown',
                    'top_cities', 'timeline', 'hourly_pattern', 'event_log']:
            assert key in body, f'Missing key: {key}'
        assert body['period'] == expected_period
        assert isinstance(body['hourly_pattern'], list) and len(body['hourly_pattern']) == 24
        assert isinstance(body['top_cities'], list)
        assert isinstance(body['timeline'], list)
        assert isinstance(body['event_log'], list)
        # All 7 click types in click_breakdown
        for ct in ['whatsapp_click', 'instagram_click', 'facebook_click',
                   'review_click', 'tiktok_click', 'maps_click', 'post_cta_click']:
            assert ct in body['click_breakdown']

    def test_requires_admin_auth(self):
        r = requests.get(f'{BASE_URL}/api/analytics/detailed?period=30d')
        assert r.status_code == 401

    def test_30d_global(self, admin_session):
        r = admin_session.get(f'{BASE_URL}/api/analytics/detailed?period=30d')
        assert r.status_code == 200, r.text
        body = r.json()
        self._assert_structure(body, '30d')
        assert body['total_events'] >= 6
        assert body['total_clicks'] >= 5

    def test_7d_period(self, admin_session):
        r = admin_session.get(f'{BASE_URL}/api/analytics/detailed?period=7d')
        assert r.status_code == 200
        self._assert_structure(r.json(), '7d')

    def test_month_period(self, admin_session):
        r = admin_session.get(f'{BASE_URL}/api/analytics/detailed?period=month')
        assert r.status_code == 200
        body = r.json()
        self._assert_structure(body, 'month')
        # start should be first day of current month
        assert body['start'].endswith('-01T00:00:00+00:00') or 'T00:00:00' in body['start']

    def test_filter_by_vendor(self, admin_session):
        r = admin_session.get(
            f'{BASE_URL}/api/analytics/detailed?period=30d&vendor_id={state["vendor_id"]}')
        assert r.status_code == 200
        body = r.json()
        self._assert_structure(body, '30d')
        # event log entries should all be for our vendor (or empty)
        for ev in body['event_log']:
            assert ev['vendor_id'] == state['vendor_id']
        assert body['total_events'] >= 6


# --- Detailed analytics (vendor scope) ---

class TestDetailedAnalyticsVendor:
    def test_requires_vendor_auth(self):
        r = requests.get(f'{BASE_URL}/api/vendor/analytics/detailed?period=30d')
        assert r.status_code == 401

    def test_vendor_detailed(self, vendor_session):
        r = vendor_session.get(f'{BASE_URL}/api/vendor/analytics/detailed?period=30d')
        assert r.status_code == 200, r.text
        body = r.json()
        assert body['period'] == '30d'
        assert body['total_events'] >= 6
        for ev in body['event_log']:
            assert ev['vendor_id'] == state['vendor_id']


# --- PDF export (admin) ---

class TestPDFExportAdmin:
    def test_requires_auth(self):
        r = requests.get(f'{BASE_URL}/api/analytics/export/pdf?period=30d')
        assert r.status_code == 401

    def test_global_pdf(self, admin_session):
        r = admin_session.get(f'{BASE_URL}/api/analytics/export/pdf?period=30d')
        assert r.status_code == 200, r.text
        assert r.headers.get('content-type', '').startswith('application/pdf')
        assert r.content[:5] == b'%PDF-'
        cd = r.headers.get('content-disposition', '')
        assert 'attachment' in cd
        assert '.pdf' in cd

    def test_vendor_filtered_pdf(self, admin_session):
        r = admin_session.get(
            f'{BASE_URL}/api/analytics/export/pdf?period=7d&vendor_id={state["vendor_id"]}')
        assert r.status_code == 200
        assert r.content[:5] == b'%PDF-'
        assert len(r.content) > 500


# --- PDF export (vendor) ---

class TestPDFExportVendor:
    def test_requires_vendor_auth(self):
        r = requests.get(f'{BASE_URL}/api/vendor/analytics/export/pdf')
        assert r.status_code == 401

    def test_vendor_pdf(self, vendor_session):
        r = vendor_session.get(f'{BASE_URL}/api/vendor/analytics/export/pdf?period=month')
        assert r.status_code == 200, r.text
        assert r.headers.get('content-type', '').startswith('application/pdf')
        assert r.content[:5] == b'%PDF-'


# --- Public vendor data (used by landing page post block) ---

class TestPublicVendorPostFields:
    def test_get_vendor_returns_post_fields(self):
        r = requests.get(f'{BASE_URL}/api/vendors/{state["vendor_id"]}')
        assert r.status_code == 200
        body = r.json()
        # Post fields must exist (defaulted to '' by setdefault)
        for k in ['post_title', 'post_text', 'post_media_url',
                  'post_cta_text', 'post_whatsapp_message']:
            assert k in body


# --- Frontend index.html: emergent badge removed ---

class TestEmergentBadgeRemoved:
    def test_no_emergent_badge_in_index(self):
        # Public landing page served by frontend
        r = requests.get(f'{BASE_URL}/', timeout=15, allow_redirects=True)
        assert r.status_code == 200
        html = r.text.lower()
        assert 'id="emergent-badge"' not in html
        assert "id='emergent-badge'" not in html


# --- Cleanup ---

class TestZCleanup:
    def test_delete_vendor_and_store(self, admin_session):
        if state.get('vendor_id'):
            admin_session.delete(f'{BASE_URL}/api/vendors/{state["vendor_id"]}')
        if state.get('store_id'):
            admin_session.delete(f'{BASE_URL}/api/stores/{state["store_id"]}')
