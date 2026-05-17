"""GDPR Hardening Sprint 3 backend tests.

Coverage:
- BACKEND-1: GET /api/me/dpa-status (super_admin vs org_admin)
- BACKEND-2: POST /api/me/accept-dpa (400 for super_admin, persists for org_admin)
- BACKEND-3: GET /api/me/data-export schema
- BACKEND-4: POST /api/me/revoke-all-sessions (token_version bump + 401 on old cookie)
- BACKEND-5: DELETE /api/me (400 for super_admin, deletes org_admin)
- BACKEND-6: Vendor counterparts (auth-required smoke)
- BACKEND-7: Back-compat: tokens without 'tv' claim still work (default tv=1)
"""
import os
import time
import uuid
import jwt as pyjwt
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://qr-deploy-1.preview.emergentagent.com').rstrip('/')
SUPER_EMAIL = 'superadmin@qrhub.it'
SUPER_PWD = 'changeme123'
MONGO_URL = 'mongodb+srv://vdndeploy_db_user:7FMONVsq6oCr65EC@clustervdn.dp4u4fo.mongodb.net/?retryWrites=true&w=majority'
DB_NAME = 'qrhub_vendor_db'
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-change-this')
# Try reading explicit override from backend .env
try:
    with open('/app/backend/.env') as _f:
        for _line in _f:
            if _line.startswith('JWT_SECRET='):
                JWT_SECRET = _line.split('=', 1)[1].strip().strip('"').strip("'")
                break
except Exception:
    pass


def _mongo():
    return MongoClient(MONGO_URL, serverSelectionTimeoutMS=10000)


def _clear_login_attempts():
    try:
        c = _mongo()
        c[DB_NAME].login_attempts.delete_many({})
        c.close()
    except Exception as e:
        print(f'Could not clear login_attempts: {e}')


@pytest.fixture(autouse=True, scope='module')
def cleanup_login_attempts():
    _clear_login_attempts()
    yield
    _clear_login_attempts()


@pytest.fixture(scope='module')
def super_session():
    _clear_login_attempts()
    s = requests.Session()
    r = s.post(f'{BASE_URL}/api/auth/login',
               json={'email': SUPER_EMAIL, 'password': SUPER_PWD}, timeout=15)
    assert r.status_code == 200, f'Superadmin login failed: {r.status_code} {r.text}'
    yield s


@pytest.fixture(scope='module')
def temp_org(super_session):
    """Create a temp organization for tests; cleanup at end."""
    slug = f'gdpr-test-{uuid.uuid4().hex[:8]}'
    r = super_session.post(f'{BASE_URL}/api/organizations',
                           json={'name': f'GDPR Test Org {slug}', 'slug': slug}, timeout=15)
    assert r.status_code == 200, f'org create failed: {r.status_code} {r.text}'
    org = r.json()
    yield org
    # cleanup
    try:
        super_session.delete(f'{BASE_URL}/api/organizations/{org["id"]}', timeout=15)
    except Exception as e:
        print(f'org cleanup failed: {e}')


def _make_org_admin(super_session, org_id, label='admin'):
    email = f'test-{label}-{uuid.uuid4().hex[:8]}@example.com'
    pwd = 'TestPwd!234'
    r = super_session.post(f'{BASE_URL}/api/organizations/{org_id}/users',
                           json={'email': email, 'password': pwd,
                                 'name': f'Test {label}',
                                 'organization_id': org_id}, timeout=15)
    assert r.status_code == 200, f'org user create failed: {r.status_code} {r.text}'
    s = requests.Session()
    r2 = s.post(f'{BASE_URL}/api/auth/login', json={'email': email, 'password': pwd}, timeout=15)
    assert r2.status_code == 200, f'org admin login failed: {r2.status_code} {r2.text}'
    return s, email, pwd


# ─── BACKEND-1: /me/dpa-status ────────────────────────────────────────────────
class TestDpaStatus:
    def test_super_admin_dpa_status(self, super_session):
        r = super_session.get(f'{BASE_URL}/api/me/dpa-status', timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data['required'] is False
        assert data['accepted'] is True
        assert data['current_version'] == '1.0'

    def test_org_admin_dpa_status_initial(self, super_session, temp_org):
        s, email, _ = _make_org_admin(super_session, temp_org['id'], 'dpastatus')
        try:
            r = s.get(f'{BASE_URL}/api/me/dpa-status', timeout=15)
            assert r.status_code == 200, r.text
            data = r.json()
            assert data['required'] is True
            assert data['accepted'] is False
            assert data['current_version'] == '1.0'
            assert data.get('accepted_version') in (None, '')
        finally:
            c = _mongo(); c[DB_NAME].users.delete_one({'email': email.lower()}); c.close()

    def test_dpa_status_requires_auth(self):
        r = requests.get(f'{BASE_URL}/api/me/dpa-status', timeout=15)
        assert r.status_code == 401


# ─── BACKEND-2: /me/accept-dpa ────────────────────────────────────────────────
class TestAcceptDpa:
    def test_super_admin_cannot_accept(self, super_session):
        r = super_session.post(f'{BASE_URL}/api/me/accept-dpa', timeout=15)
        assert r.status_code == 400, r.text
        assert 'super admin' in r.json().get('detail', '').lower()

    def test_org_admin_accept_and_status(self, super_session, temp_org):
        s, email, _ = _make_org_admin(super_session, temp_org['id'], 'acceptdpa')
        try:
            r = s.post(f'{BASE_URL}/api/me/accept-dpa', timeout=15)
            assert r.status_code == 200, r.text
            assert 'accettato' in r.json().get('message', '').lower()
            # Now status must be accepted
            r2 = s.get(f'{BASE_URL}/api/me/dpa-status', timeout=15)
            data = r2.json()
            assert data['accepted'] is True
            assert data['accepted_version'] == '1.0'
            assert data['accepted_at'], 'accepted_at must be set'
        finally:
            c = _mongo(); c[DB_NAME].users.delete_one({'email': email.lower()}); c.close()


# ─── BACKEND-3: /me/data-export ───────────────────────────────────────────────
class TestDataExport:
    def test_super_admin_export(self, super_session):
        r = super_session.get(f'{BASE_URL}/api/me/data-export', timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ('exported_at', 'exported_for', 'format_version', 'user',
                  'login_history_last_100', 'organization_summary',
                  'files_uploaded_by_me', 'notes'):
            assert k in data, f'missing key: {k}'
        assert data['exported_for'] == SUPER_EMAIL
        assert data['organization_summary'] is None
        user = data['user']
        for uk in ('id', 'email', 'name', 'role', 'organization_id',
                   'created_at', 'accepted_dpa_version', 'accepted_dpa_at', 'token_version'):
            assert uk in user, f'missing user key: {uk}'
        assert user['email'] == SUPER_EMAIL
        assert isinstance(data['login_history_last_100'], list)
        assert isinstance(data['notes'], list)

    def test_org_admin_export_has_org_summary(self, super_session, temp_org):
        s, email, _ = _make_org_admin(super_session, temp_org['id'], 'export')
        try:
            r = s.get(f'{BASE_URL}/api/me/data-export', timeout=20)
            assert r.status_code == 200, r.text
            data = r.json()
            assert data['organization_summary'] is not None
            org = data['organization_summary']
            for ok in ('id', 'name', 'brand_name', 'stores_count',
                       'vendors_count', 'posts_count', 'files_count'):
                assert ok in org, f'missing org key: {ok}'
            assert org['id'] == temp_org['id']
        finally:
            c = _mongo(); c[DB_NAME].users.delete_one({'email': email.lower()}); c.close()


# ─── BACKEND-4: /me/revoke-all-sessions ───────────────────────────────────────
class TestRevokeAllSessions:
    def test_old_cookie_invalidated_new_cookie_works(self, super_session, temp_org):
        s, email, _ = _make_org_admin(super_session, temp_org['id'], 'revoke')
        try:
            old_cookie = s.cookies.get('access_token')
            assert old_cookie

            r = s.post(f'{BASE_URL}/api/me/revoke-all-sessions', timeout=15)
            assert r.status_code == 200, r.text
            assert 'invalidate' in r.json().get('message', '').lower()
            new_cookie = s.cookies.get('access_token')
            assert new_cookie and new_cookie != old_cookie, 'cookie must be refreshed'

            # new cookie works (current session)
            r2 = s.get(f'{BASE_URL}/api/auth/me', timeout=15)
            assert r2.status_code == 200

            # old cookie is now invalid → 401 + Italian message
            r3 = requests.get(f'{BASE_URL}/api/auth/me',
                              cookies={'access_token': old_cookie}, timeout=15)
            assert r3.status_code == 401
            assert 'invalidata' in r3.json().get('detail', '').lower()
        finally:
            c = _mongo(); c[DB_NAME].users.delete_one({'email': email.lower()}); c.close()


# ─── BACKEND-5: DELETE /api/me ────────────────────────────────────────────────
class TestDeleteMe:
    def test_super_admin_cannot_delete_self(self, super_session):
        r = super_session.delete(f'{BASE_URL}/api/me', timeout=15)
        assert r.status_code == 400, r.text
        assert 'super admin' in r.json().get('detail', '').lower()

    def test_org_admin_can_delete_self(self, super_session, temp_org):
        s, email, _ = _make_org_admin(super_session, temp_org['id'], 'delete')
        r = s.delete(f'{BASE_URL}/api/me', timeout=15)
        assert r.status_code == 200, r.text
        assert 'eliminato' in r.json().get('message', '').lower()
        # verify user is gone from db
        c = _mongo(); doc = c[DB_NAME].users.find_one({'email': email.lower()}); c.close()
        assert doc is None, 'user record must be deleted'


# ─── BACKEND-6: Vendor counterparts (smoke) ───────────────────────────────────
class TestVendorEndpointsSmoke:
    def test_vendor_data_export_requires_auth(self):
        r = requests.get(f'{BASE_URL}/api/vendor/me/data-export', timeout=15)
        assert r.status_code == 401

    def test_vendor_revoke_requires_auth(self):
        r = requests.post(f'{BASE_URL}/api/vendor/me/revoke-all-sessions', timeout=15)
        assert r.status_code == 401

    def test_vendor_delete_requires_auth(self):
        r = requests.delete(f'{BASE_URL}/api/vendor/me', timeout=15)
        assert r.status_code == 401


# ─── BACKEND-7: Back-compat: token without 'tv' claim ────────────────────────
class TestTokenBackwardCompat:
    def test_token_without_tv_claim_works(self, super_session, temp_org):
        """Forge a JWT in the old format (no 'tv' claim) and verify /auth/me
        accepts it for a user whose token_version is 1 (default). Server should
        treat missing 'tv' as 1 (back-compat)."""
        from datetime import datetime, timezone, timedelta
        if not JWT_SECRET:
            pytest.skip('JWT_SECRET not readable')
        # Create a fresh org_admin (token_version unset → default 1)
        s, email, _ = _make_org_admin(super_session, temp_org['id'], 'backcompat')
        try:
            # Get user_id from /auth/me
            r = s.get(f'{BASE_URL}/api/auth/me', timeout=15)
            assert r.status_code == 200
            user_id = r.json()['id']
            payload = {
                'sub': user_id,
                'email': email,
                'exp': datetime.now(timezone.utc) + timedelta(hours=1),
                'type': 'access',
                # NOTE: NO 'tv' claim — simulate pre-deploy token
            }
            token = pyjwt.encode(payload, JWT_SECRET, algorithm='HS256')
            r2 = requests.get(f'{BASE_URL}/api/auth/me',
                              cookies={'access_token': token}, timeout=15)
            assert r2.status_code == 200, f'back-compat token rejected: {r2.status_code} {r2.text}'
            assert r2.json()['email'] == email
        finally:
            c = _mongo(); c[DB_NAME].users.delete_one({'email': email.lower()}); c.close()

    def test_normal_login_still_works(self):
        _clear_login_attempts()
        s = requests.Session()
        r = s.post(f'{BASE_URL}/api/auth/login',
                   json={'email': SUPER_EMAIL, 'password': SUPER_PWD}, timeout=15)
        assert r.status_code == 200
        r2 = s.get(f'{BASE_URL}/api/auth/me', timeout=15)
        assert r2.status_code == 200
        assert r2.json()['email'] == SUPER_EMAIL
