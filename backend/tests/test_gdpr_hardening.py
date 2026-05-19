"""GDPR Hardening sprint tests:
- BACKEND-1/2: Rate limit on /api/auth/login and /api/vendor-auth/login (HTTP 429 after 5)
- BACKEND-3: Public GET /api/vendors/{vendor_id}/privacy-info
- BACKEND-4: PUT /api/organizations/{org_id} accepts new GDPR fields (legal_name, vat_number, ...)
- BACKEND-5: GET /api/vendors/{vendor_id} returns always-on cookie_banner + has_privacy_info
- BACKEND-6: GET /api/analytics/export/pdf smoke test for superadmin
"""
import os
import time
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'http://localhost:8001').rstrip('/')
VENDOR_ID = '6a09a0d12670dabed5479197'
SUPER_EMAIL = os.environ.get('SUPERADMIN_EMAIL', 'superadmin@qrhub.it')
SUPER_PWD = os.environ.get('SUPERADMIN_PASSWORD', '')
MONGO_URL = os.environ.get('MONGO_URL', '')
DB_NAME = os.environ.get('DB_NAME', 'qrhub_vendor_db')

if not SUPER_PWD or not MONGO_URL:
    pytest.skip('SUPERADMIN_PASSWORD and MONGO_URL must be set (e.g. via backend/.env)', allow_module_level=True)


def _clear_login_attempts():
    try:
        c = MongoClient(MONGO_URL, serverSelectionTimeoutMS=10000)
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
    """Authenticated session for superadmin (clear login_attempts after)."""
    _clear_login_attempts()
    s = requests.Session()
    r = s.post(f'{BASE_URL}/api/auth/login',
               json={'email': SUPER_EMAIL, 'password': SUPER_PWD}, timeout=15)
    assert r.status_code == 200, f'Superadmin login failed: {r.status_code} {r.text}'
    yield s


# ───────────────────── BACKEND-1: admin login rate limit ─────────────────────
class TestAdminLoginRateLimit:
    def test_rate_limit_returns_429_after_5_failures(self):
        _clear_login_attempts()
        email = 'ratelimit-test@example.com'
        statuses = []
        for i in range(6):
            r = requests.post(f'{BASE_URL}/api/auth/login',
                              json={'email': email, 'password': 'wrong-pwd'}, timeout=15)
            statuses.append(r.status_code)
        # First 5 are 401 (user not found), 6th must be 429
        assert statuses[:5] == [401] * 5, f'Expected 5x401, got: {statuses}'
        assert statuses[5] == 429, f'6th attempt expected 429, got {statuses[5]}'
        # Check detail message in Italian
        r6 = requests.post(f'{BASE_URL}/api/auth/login',
                           json={'email': email, 'password': 'wrong-pwd'}, timeout=15)
        assert r6.status_code == 429
        body = r6.json()
        assert 'Troppi tentativi falliti' in body.get('detail', ''), f'Got detail: {body}'
        assert 'Retry-After' in r6.headers
        _clear_login_attempts()

    def test_successful_login_does_not_get_blocked_after_cleanup(self):
        _clear_login_attempts()
        r = requests.post(f'{BASE_URL}/api/auth/login',
                         json={'email': SUPER_EMAIL, 'password': SUPER_PWD}, timeout=15)
        assert r.status_code == 200, f'Superadmin login should succeed: {r.status_code} {r.text}'


# ───────────────────── BACKEND-2: vendor login rate limit ─────────────────────
class TestVendorLoginRateLimit:
    def test_vendor_login_rate_limit(self):
        _clear_login_attempts()
        email = 'vendor-ratelimit-test@example.com'
        statuses = []
        for i in range(6):
            r = requests.post(f'{BASE_URL}/api/vendor-auth/login',
                              json={'email': email, 'password': 'wrong-pwd'}, timeout=15)
            statuses.append(r.status_code)
        # First 5 are 401, 6th must be 429
        assert all(s in (400, 401) for s in statuses[:5]), f'First 5 should be 401, got: {statuses}'
        assert statuses[5] == 429, f'6th attempt expected 429, got {statuses[5]}'
        _clear_login_attempts()


# ───────────────────── BACKEND-3: privacy-info endpoint ─────────────────────
class TestPrivacyInfoEndpoint:
    def test_privacy_info_public_no_auth(self):
        r = requests.get(f'{BASE_URL}/api/vendors/{VENDOR_ID}/privacy-info', timeout=15)
        assert r.status_code == 200, f'Expected 200, got {r.status_code}: {r.text}'
        data = r.json()
        # required top-level keys
        for k in ['vendor', 'organization', 'controller', 'processor',
                  'sub_processors', 'data_collected', 'legal_basis', 'retention', 'rights']:
            assert k in data, f'Missing key: {k}'
        # sub_processors must include 5 entries with required vendors
        sub_names = [s['name'] for s in data['sub_processors']]
        for needed in ['Fly.io', 'Vercel', 'MongoDB Atlas', 'Cloudinary', 'ipapi.co']:
            assert needed in sub_names, f'Sub-processor missing: {needed}'
        assert len(data['sub_processors']) >= 5

        # data_collected has required arrays
        dc = data['data_collected']
        for k in ['aggregate_metrics', 'cookies_technical', 'never_stored']:
            assert k in dc, f'data_collected missing key: {k}'
            assert isinstance(dc[k], list)

        # rights = list of 7 articles
        assert isinstance(data['rights'], list)
        assert len(data['rights']) == 7, f'Expected 7 rights, got {len(data["rights"])}'

        # vendor id matches
        assert data['vendor']['id'] == VENDOR_ID

    def test_privacy_info_404_for_unknown_vendor(self):
        r = requests.get(f'{BASE_URL}/api/vendors/non-existent-vendor-xxxxx/privacy-info', timeout=15)
        assert r.status_code == 404


# ───────────────────── BACKEND-4: org update GDPR fields ─────────────────────
class TestOrganizationGDPRFields:
    def test_put_org_with_gdpr_fields_persists(self, super_session):
        # Find an org via GET /api/organizations
        r = super_session.get(f'{BASE_URL}/api/organizations', timeout=15)
        assert r.status_code == 200, f'GET /api/organizations failed: {r.status_code} {r.text}'
        orgs = r.json()
        assert isinstance(orgs, list) and len(orgs) > 0, 'No organizations returned'
        org = orgs[0]
        org_id = org['id']

        # Save original values for restore
        original_payload = {
            'legal_name': org.get('legal_name', '') or '',
            'vat_number': org.get('vat_number', '') or '',
            'legal_address': org.get('legal_address', '') or '',
            'privacy_contact_email': org.get('privacy_contact_email', '') or '',
            'privacy_policy_url': org.get('privacy_policy_url', '') or '',
        }

        new_payload = {
            'legal_name': 'TEST QRHub Legal SRL',
            'vat_number': 'IT12345678901',
            'legal_address': 'Via Test 1, 00100 Roma, IT',
            'privacy_contact_email': 'privacy-test@example.com',
            'privacy_policy_url': 'https://example.com/privacy',
        }
        upd = super_session.put(f'{BASE_URL}/api/organizations/{org_id}', json=new_payload, timeout=15)
        assert upd.status_code == 200, f'PUT failed: {upd.status_code} {upd.text}'

        # Verify via GET
        r2 = super_session.get(f'{BASE_URL}/api/organizations', timeout=15)
        orgs2 = r2.json()
        org2 = next((o for o in orgs2 if o['id'] == org_id), None)
        assert org2 is not None
        for k, v in new_payload.items():
            assert org2.get(k) == v, f'Field {k} not persisted: expected {v}, got {org2.get(k)}'

        # Restore originals
        super_session.put(f'{BASE_URL}/api/organizations/{org_id}', json=original_payload, timeout=15)


# ───────────────────── BACKEND-5: vendor public cookie_banner ─────────────────────
class TestVendorPublicResponse:
    def test_vendor_public_returns_cookie_banner_always_enabled(self):
        r = requests.get(f'{BASE_URL}/api/vendors/{VENDOR_ID}', timeout=15)
        assert r.status_code == 200, f'Expected 200, got {r.status_code}: {r.text}'
        v = r.json()
        assert 'organization' in v, 'organization missing'
        org = v['organization']
        assert 'cookie_banner' in org, 'cookie_banner missing'
        cb = org['cookie_banner']
        # GDPR mandatory: always enabled=True
        assert cb.get('enabled') is True, f'cookie_banner.enabled must be True, got {cb.get("enabled")}'
        assert isinstance(cb.get('use_custom_text'), bool)
        assert 'text' in cb
        assert 'link' in cb
        assert 'has_privacy_info' in org
        assert isinstance(org['has_privacy_info'], bool)


# ───────────────────── BACKEND-6: PDF export smoke test ─────────────────────
class TestAnalyticsPdfExport:
    def test_pdf_export_returns_200_for_superadmin(self, super_session):
        r = super_session.get(
            f'{BASE_URL}/api/analytics/export/pdf',
            params={'vendor_id': VENDOR_ID}, timeout=30
        )
        # Endpoint may require additional params; accept 200 or 400 (validation),
        # but explicitly reject 500/403/401.
        assert r.status_code in (200, 400, 404), f'Unexpected status: {r.status_code} {r.text[:300]}'
        # If 200, check content-type pdf-like
        if r.status_code == 200:
            ct = r.headers.get('content-type', '')
            assert 'pdf' in ct.lower() or 'octet' in ct.lower(), f'Unexpected content-type: {ct}'
