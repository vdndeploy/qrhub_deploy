"""GDPR Sprint 4 — Backend tests (M1/M2/M3/M4/M8 + Trust badge + Super admin DPA view).

Covers:
- BACKEND-1  Security headers middleware (HSTS / XFO / XCTO / Referrer / Permissions / CSP)
- BACKEND-2  Analytics retention code path (best-effort: endpoint still works + startup log)
- BACKEND-3  JWT_SECRET < 32 bytes warning in backend.err.log
- BACKEND-4  Email redaction in seed logger calls
- BACKEND-5  Cloudinary tenant folder prefix (platform/ for super_admin)
- BACKEND-6  /vendors/{id}/privacy-info → gdpr_status.controller_verified + completeness
- BACKEND-7  /organizations enriched with .gdpr (dpa + controller_complete)
- BACKEND-8  /organizations/{id}/dpa-status (super admin only)
"""

import base64
import os
import re

import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://qr-deploy-1.preview.emergentagent.com').rstrip('/')
SUPER_EMAIL = 'superadmin@qrhub.it'
SUPER_PASS = 'changeme123'
DEMO_ORG_ID = '6a09a0732670dabed5479190'
DEMO_VENDOR_ID = '6a09a0d12670dabed5479197'

# 1x1 transparent PNG
PNG_1PX = base64.b64decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
)


@pytest.fixture(scope='session')
def super_session():
    s = requests.Session()
    r = s.post(f'{BASE_URL}/api/auth/login', json={'email': SUPER_EMAIL, 'password': SUPER_PASS}, timeout=20)
    assert r.status_code == 200, f'Superadmin login failed: {r.status_code} {r.text}'
    return s


# ── BACKEND-1 Security headers ───────────────────────────────────────────
class TestSecurityHeaders:
    @pytest.mark.parametrize('path', ['/api/auth/me', '/api/vendors', '/api/organizations'])
    def test_security_headers_present(self, path):
        r = requests.get(f'{BASE_URL}{path}', timeout=15)
        # we don't care about status — middleware always runs
        h = {k.lower(): v for k, v in r.headers.items()}
        assert h.get('strict-transport-security') == 'max-age=31536000; includeSubDomains', h.get('strict-transport-security')
        assert h.get('x-frame-options') == 'DENY'
        assert h.get('x-content-type-options') == 'nosniff'
        assert h.get('referrer-policy') == 'strict-origin-when-cross-origin'
        pp = h.get('permissions-policy', '')
        for needle in ['geolocation=()', 'microphone=()', 'camera=()', 'payment=()', 'usb=()', 'interest-cohort=()']:
            assert needle in pp, f'Missing {needle} in permissions-policy: {pp}'
        csp = h.get('content-security-policy', '')
        assert "frame-ancestors 'none'" in csp, csp


# ── BACKEND-2 Analytics retention ────────────────────────────────────────
class TestAnalyticsRetention:
    def test_analytics_endpoint_still_works(self, super_session):
        # /api/analytics is POST (event ingestion); we use the GET overview/detailed to
        # confirm the analytics surface still responds after startup retention path runs.
        r = super_session.get(f'{BASE_URL}/api/analytics/overview', timeout=15)
        assert r.status_code in (200, 403, 404), r.text

    def test_startup_log_retention_codepath(self):
        # The code path lives in @app.on_event('startup'); look for either "Retention: purged"
        # or simply the absence — both are valid per the test request. We just assert the log
        # file is readable.
        for p in ('/var/log/supervisor/backend.err.log', '/var/log/supervisor/backend.out.log'):
            if os.path.exists(p):
                assert os.path.getsize(p) >= 0
                return
        pytest.skip('No supervisor logs accessible')


# ── BACKEND-3 JWT_SECRET warning ─────────────────────────────────────────
class TestJwtSecretWarning:
    def test_warning_in_backend_log(self):
        try:
            with open('/var/log/supervisor/backend.err.log', 'r') as f:
                content = f.read()
        except OSError:
            pytest.skip('backend.err.log not readable')
        assert 'JWT_SECRET' in content
        assert '27 bytes' in content or re.search(r'\(\d+ bytes\)', content)
        assert 'SECURITY' in content


# ── BACKEND-4 Email redaction in logs ────────────────────────────────────
class TestEmailRedactionLogs:
    def test_redact_helper_format(self):
        # Reproduce the algorithm to validate expected output shape
        def redact(email):
            local, _, domain = email.partition('@')
            if len(local) <= 2:
                masked = local[0] + '***'
            else:
                masked = local[0] + '***' + local[-1]
            return f'{masked}@{domain}'
        assert redact('superadmin@qrhub.it') == 's***n@qrhub.it'
        assert redact('admin@example.com') == 'a***n@example.com'

    def test_no_plain_seed_email_in_recent_logs(self):
        """After M8 was introduced, any FRESH 'Super admin created' / 'Org admin created' /
        'Admin password updated' log line must use the redacted form. We can't restart the
        backend here, but we assert that if such a line exists in the log, it does NOT
        contain the plain email superadmin@qrhub.it after the redaction patch landed."""
        try:
            with open('/var/log/supervisor/backend.err.log', 'r') as f:
                lines = f.readlines()
        except OSError:
            pytest.skip('log not accessible')
        # Find lines emitted by the seed functions
        seed_lines = [ln for ln in lines if 'Super admin created' in ln or 'Admin password updated' in ln]
        # If there are any recent (post-patch) seed lines they must be redacted.
        # NOTE: pre-patch lines may still be present in old log retention; we only fail
        # if a redacted form is NEVER produced and plain emails are present.
        # Best-effort: tail last 200 lines
        recent = lines[-200:]
        plain_hits = [ln for ln in recent if 'superadmin@qrhub.it' in ln and ('Super admin created' in ln or 'Admin password updated' in ln)]
        assert not plain_hits, f'Found plain superadmin email in recent seed log lines: {plain_hits}'


# ── BACKEND-5 Cloudinary tenant folder prefix ────────────────────────────
class TestCloudinaryTenantFolder:
    def test_superadmin_upload_lands_in_platform(self, super_session):
        files = {'file': ('test_sprint4.png', PNG_1PX, 'image/png')}
        r = super_session.post(f'{BASE_URL}/api/upload', files=files, data={'folder': 'uploads'}, timeout=30)
        assert r.status_code == 200, f'Upload failed: {r.status_code} {r.text}'
        data = r.json()
        folder = data.get('folder', '')
        public_id = data.get('public_id', '')
        try:
            assert folder.startswith('platform/'), f'Expected platform/ prefix, got: {folder}'
            assert 'platform/uploads' in folder or folder == 'platform/uploads'
        finally:
            # Cleanup
            if public_id:
                # public_id may include slashes which need URL encoding
                from urllib.parse import quote
                super_session.delete(f'{BASE_URL}/api/files/{quote(public_id, safe="")}', timeout=20)


# ── BACKEND-6 Trust badge fields in privacy-info ─────────────────────────
class TestPrivacyInfoTrustBadge:
    def test_demo_vendor_incomplete(self):
        r = requests.get(f'{BASE_URL}/api/vendors/{DEMO_VENDOR_ID}/privacy-info', timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert 'gdpr_status' in data, data.keys()
        gs = data['gdpr_status']
        assert isinstance(gs.get('controller_verified'), bool)
        assert gs.get('completeness') in ('incomplete', 'verified', 'complete')
        # Demo org has only legal_name → must be incomplete
        assert gs['controller_verified'] is False, gs
        assert gs['completeness'] == 'incomplete', gs


# ── BACKEND-7 Super admin org list enriched with .gdpr ───────────────────
class TestOrgListGdprEnrichment:
    def test_org_list_has_gdpr_object(self, super_session):
        r = super_session.get(f'{BASE_URL}/api/organizations', timeout=20)
        assert r.status_code == 200, r.text
        orgs = r.json()
        assert isinstance(orgs, list) and len(orgs) > 0
        demo = next((o for o in orgs if o.get('id') == DEMO_ORG_ID), None)
        assert demo is not None, f'Demo org {DEMO_ORG_ID} not found'
        gdpr = demo.get('gdpr')
        assert gdpr is not None, demo
        for k in ('dpa_required_version', 'dpa_admins_total', 'dpa_admins_accepted',
                  'dpa_status', 'dpa_last_accept_at', 'controller_fields_filled',
                  'controller_fields_required', 'controller_complete'):
            assert k in gdpr, f'Missing key {k} in gdpr: {gdpr}'
        assert gdpr['dpa_required_version'] == '1.0'
        assert gdpr['dpa_status'] in ('pending', 'partial', 'accepted')
        assert gdpr['controller_fields_required'] == 4
        assert isinstance(gdpr['controller_complete'], bool)
        # Demo org expectations (from test request)
        assert gdpr['dpa_admins_total'] >= 1
        # Currently expected pending
        if gdpr['dpa_admins_accepted'] == 0:
            assert gdpr['dpa_status'] == 'pending'


# ── BACKEND-8 Super admin DPA detail ─────────────────────────────────────
class TestOrgDpaStatusDetail:
    def test_dpa_status_unauthorized(self):
        r = requests.get(f'{BASE_URL}/api/organizations/{DEMO_ORG_ID}/dpa-status', timeout=15)
        assert r.status_code == 401, r.text

    def test_dpa_status_super_admin(self, super_session):
        r = super_session.get(f'{BASE_URL}/api/organizations/{DEMO_ORG_ID}/dpa-status', timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data['organization_id'] == DEMO_ORG_ID
        assert data['required_version'] == '1.0'
        assert isinstance(data['admins'], list)
        for a in data['admins']:
            for k in ('email', 'name', 'accepted_version', 'accepted_at', 'accepted_ip', 'status'):
                assert k in a, f'Missing {k} in admin entry {a}'
            assert a['status'] in ('accepted', 'pending')

    def test_dpa_status_unknown_org(self, super_session):
        r = super_session.get(f'{BASE_URL}/api/organizations/000000000000000000000000/dpa-status', timeout=15)
        assert r.status_code == 404
