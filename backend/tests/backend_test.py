"""Backend API tests for WindTre Vendor QR Hub."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'http://localhost:8001').rstrip('/')
ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'admin@example.com')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', '')

if not ADMIN_PASSWORD:
    pytest.skip('ADMIN_PASSWORD must be set in env (e.g. backend/.env)', allow_module_level=True)


@pytest.fixture(scope='session')
def session():
    s = requests.Session()
    s.headers.update({'Content-Type': 'application/json'})
    return s


@pytest.fixture(scope='session')
def auth_session(session):
    r = session.post(f'{BASE_URL}/api/auth/login',
                     json={'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD})
    assert r.status_code == 200, f'Login failed: {r.status_code} {r.text}'
    data = r.json()
    assert data['email'] == ADMIN_EMAIL
    # Cookie should be set
    assert 'access_token' in session.cookies
    return session


# ---- Auth ----
class TestAuth:
    def test_login_success(self, session):
        r = session.post(f'{BASE_URL}/api/auth/login',
                         json={'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD})
        assert r.status_code == 200
        body = r.json()
        assert body['email'] == ADMIN_EMAIL
        assert 'id' in body

    def test_login_invalid(self, session):
        r = requests.post(f'{BASE_URL}/api/auth/login',
                          json={'email': ADMIN_EMAIL, 'password': 'wrong'})
        assert r.status_code == 401

    def test_me_requires_auth(self):
        r = requests.get(f'{BASE_URL}/api/auth/me')
        assert r.status_code == 401

    def test_me_authenticated(self, auth_session):
        r = auth_session.get(f'{BASE_URL}/api/auth/me')
        assert r.status_code == 200
        assert r.json()['email'] == ADMIN_EMAIL


# ---- Vendors CRUD ----
class TestVendors:
    created_id = None

    def test_list_vendors_requires_auth(self):
        r = requests.get(f'{BASE_URL}/api/vendors')
        assert r.status_code == 401

    def test_create_vendor(self, auth_session):
        payload = {
            'name': 'TEST_Vendor_Alpha',
            'bio': 'Bio test',
            'whatsapp': '+391234567890',
            'instagram': 'https://instagram.com/test',
            'facebook': 'https://facebook.com/test',
            'google_review': 'https://g.page/test'
        }
        r = auth_session.post(f'{BASE_URL}/api/vendors', json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body['name'] == payload['name']
        assert body['bio'] == payload['bio']
        assert body['qr_url'].endswith(f"/v/{body['id']}")
        TestVendors.created_id = body['id']

    def test_get_vendor_public(self, session):
        assert TestVendors.created_id
        r = requests.get(f'{BASE_URL}/api/vendors/{TestVendors.created_id}')
        assert r.status_code == 200
        assert r.json()['id'] == TestVendors.created_id

    def test_list_vendors(self, auth_session):
        r = auth_session.get(f'{BASE_URL}/api/vendors')
        assert r.status_code == 200
        ids = [v['id'] for v in r.json()]
        assert TestVendors.created_id in ids

    def test_update_vendor(self, auth_session):
        r = auth_session.put(
            f'{BASE_URL}/api/vendors/{TestVendors.created_id}',
            json={'name': 'TEST_Vendor_Updated', 'bio': 'Updated bio',
                  'whatsapp': '', 'instagram': '', 'facebook': '', 'google_review': ''})
        assert r.status_code == 200
        assert r.json()['name'] == 'TEST_Vendor_Updated'
        # persistence check
        r2 = requests.get(f'{BASE_URL}/api/vendors/{TestVendors.created_id}')
        assert r2.json()['name'] == 'TEST_Vendor_Updated'

    def test_qr_generation(self, auth_session):
        r = auth_session.get(f'{BASE_URL}/api/vendors/{TestVendors.created_id}/qr')
        assert r.status_code == 200
        assert r.headers.get('content-type') == 'image/png'
        assert len(r.content) > 100
        assert r.content[:8] == b'\x89PNG\r\n\x1a\n'

    def test_vendor_404(self, auth_session):
        r = auth_session.get(f'{BASE_URL}/api/vendors/nonexistent123/qr')
        assert r.status_code == 404


# ---- Analytics ----
class TestAnalytics:
    def test_track_page_view(self, session):
        assert TestVendors.created_id
        r = requests.post(f'{BASE_URL}/api/analytics',
                          json={'vendor_id': TestVendors.created_id,
                                'event_type': 'page_view'})
        assert r.status_code == 200

    def test_track_click_events(self):
        for evt in ['whatsapp_click', 'instagram_click', 'facebook_click', 'review_click']:
            r = requests.post(f'{BASE_URL}/api/analytics',
                              json={'vendor_id': TestVendors.created_id,
                                    'event_type': evt})
            assert r.status_code == 200, f'{evt} failed'

    def test_analytics_overview(self, auth_session):
        r = auth_session.get(f'{BASE_URL}/api/analytics/overview')
        assert r.status_code == 200
        body = r.json()
        assert body['total_vendors'] >= 1
        assert body['total_views'] >= 1
        assert body['total_clicks'] >= 4
        assert isinstance(body['vendor_stats'], list)
        match = [v for v in body['vendor_stats'] if v['id'] == TestVendors.created_id]
        assert match and match[0]['views'] >= 1 and match[0]['clicks'] >= 4


# ---- Config ----
class TestConfig:
    def test_get_config(self, auth_session):
        r = auth_session.get(f'{BASE_URL}/api/config')
        assert r.status_code == 200
        body = r.json()
        for k in ['flyio_api_key', 'flyio_app_name', 'vercel_token', 'vercel_project_id']:
            assert k in body

    def test_update_config(self, auth_session):
        payload = {'flyio_api_key': 'test_key', 'flyio_app_name': 'test_app',
                   'vercel_token': 'vtoken', 'vercel_project_id': 'pid'}
        r = auth_session.put(f'{BASE_URL}/api/config', json=payload)
        assert r.status_code == 200
        r2 = auth_session.get(f'{BASE_URL}/api/config')
        data = r2.json()
        assert data['flyio_api_key'] == 'test_key'
        assert data['vercel_project_id'] == 'pid'


# ---- Cleanup ----
class TestCleanup:
    def test_delete_vendor(self, auth_session):
        r = auth_session.delete(f'{BASE_URL}/api/vendors/{TestVendors.created_id}')
        assert r.status_code == 200
        r2 = requests.get(f'{BASE_URL}/api/vendors/{TestVendors.created_id}')
        assert r2.status_code == 404
