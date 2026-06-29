"""Tests for iter_24 — Analytics Reset + Audit Log endpoints.
Covers:
- POST /api/push/analytics/reset (auth, confirm, tenant isolation)
- GET  /api/push/analytics/audit-log
- POST /api/analytics/store-landings/reset
- GET  /api/analytics/store-landings/audit-log
- Regression: GET /api/push/analytics shape
- Regression: GET /api/analytics/store-landings shape
"""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    # Fall back to reading frontend .env (the env var may not be exported in pytest shell)
    try:
        with open('/app/frontend/.env') as f:
            for line in f:
                if line.startswith('REACT_APP_BACKEND_URL='):
                    BASE_URL = line.split('=', 1)[1].strip().rstrip('/')
                    break
    except Exception:
        pass

ADMIN_EMAIL = 'admin@example.com'
ADMIN_PASSWORD = 'admin123'


def _login(email, password):
    s = requests.Session()
    r = s.post(f'{BASE_URL}/api/auth/login', json={'email': email, 'password': password}, timeout=15)
    assert r.status_code == 200, f'login failed: {r.status_code} {r.text}'
    return s


@pytest.fixture(scope='module')
def admin_session():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture
def anon():
    return requests.Session()


# ── Auth-required checks ───────────────────────────────────────────────────

class TestAuthRequired:
    def test_push_reset_requires_auth(self, anon):
        r = anon.post(f'{BASE_URL}/api/push/analytics/reset', json={'confirm': 'RESET'}, timeout=10)
        assert r.status_code in (401, 403), f'expected 401/403, got {r.status_code}'

    def test_push_audit_requires_auth(self, anon):
        r = anon.get(f'{BASE_URL}/api/push/analytics/audit-log', timeout=10)
        assert r.status_code in (401, 403)

    def test_landings_reset_requires_auth(self, anon):
        r = anon.post(f'{BASE_URL}/api/analytics/store-landings/reset', json={'confirm': 'RESET'}, timeout=10)
        assert r.status_code in (401, 403)

    def test_landings_audit_requires_auth(self, anon):
        r = anon.get(f'{BASE_URL}/api/analytics/store-landings/audit-log', timeout=10)
        assert r.status_code in (401, 403)


# ── Confirmation guard ─────────────────────────────────────────────────────

class TestConfirmGuard:
    def test_push_reset_rejects_wrong_confirm(self, admin_session):
        r = admin_session.post(f'{BASE_URL}/api/push/analytics/reset',
                               json={'confirm': 'NOPE'}, timeout=15)
        # Pydantic may reject due to max_length=10 or backend may return 400
        assert r.status_code in (400, 422), f'expected 400/422, got {r.status_code}'

    def test_push_reset_accepts_case_insensitive(self, admin_session):
        # Backend uses .upper() so 'reset' should be accepted
        r = admin_session.post(f'{BASE_URL}/api/push/analytics/reset',
                               json={'confirm': 'reset'}, timeout=15)
        assert r.status_code == 200, f'case-insensitive reset failed: {r.status_code} {r.text}'
        data = r.json()
        assert 'deleted' in data and 'audit_id' in data
        assert isinstance(data['deleted'], int)
        assert isinstance(data['audit_id'], str) and len(data['audit_id']) > 0

    def test_landings_reset_rejects_wrong_confirm(self, admin_session):
        r = admin_session.post(f'{BASE_URL}/api/analytics/store-landings/reset',
                               json={'confirm': 'WRONG'}, timeout=15)
        assert r.status_code in (400, 422)


# ── Happy path + audit log persistence ────────────────────────────────────

class TestPushResetFlow:
    def test_reset_and_audit_persistence(self, admin_session):
        # Get audit count BEFORE
        before = admin_session.get(f'{BASE_URL}/api/push/analytics/audit-log', timeout=10)
        assert before.status_code == 200
        before_items = before.json().get('items', [])
        before_count = len(before_items)

        # Perform reset
        r = admin_session.post(f'{BASE_URL}/api/push/analytics/reset',
                               json={'confirm': 'RESET'}, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert 'deleted' in data
        assert 'audit_id' in data
        audit_id = data['audit_id']

        # Verify audit_log persisted the new entry
        after = admin_session.get(f'{BASE_URL}/api/push/analytics/audit-log', timeout=10)
        assert after.status_code == 200
        items = after.json().get('items', [])
        # cap=20, may be saturated but we know one was just added
        assert len(items) >= 1
        ids = {it.get('id') for it in items}
        assert audit_id in ids, f'newly-created audit id {audit_id} not found in audit-log'

        # Shape assertions on the new audit entry
        entry = next(it for it in items if it.get('id') == audit_id)
        assert entry.get('organization_id')
        assert entry.get('dashboard_type') == 'push'
        assert entry.get('reset_by_email') == ADMIN_EMAIL
        assert isinstance(entry.get('deleted_count'), int)
        assert entry.get('reset_at')
        assert 'reset_by_user_id' in entry
        assert 'reset_by_name' in entry

    def test_push_analytics_zero_after_reset(self, admin_session):
        # Reset then check totals
        admin_session.post(f'{BASE_URL}/api/push/analytics/reset',
                           json={'confirm': 'RESET'}, timeout=20)
        r = admin_session.get(f'{BASE_URL}/api/push/analytics', timeout=15)
        assert r.status_code == 200
        data = r.json()
        # Schema checks
        for k in ('subscribers', 'totals', 'by_vendor', 'recent_broadcasts'):
            assert k in data, f'missing key {k}'
        # After reset, broadcasts must be 0
        assert data['totals']['broadcasts'] == 0
        assert data['totals']['sent'] == 0
        assert data['totals']['clicks'] == 0
        assert data['recent_broadcasts'] == []


class TestLandingsResetFlow:
    def test_reset_and_audit_persistence(self, admin_session):
        r = admin_session.post(f'{BASE_URL}/api/analytics/store-landings/reset',
                               json={'confirm': 'RESET'}, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert 'deleted' in data and 'audit_id' in data
        audit_id = data['audit_id']
        assert isinstance(data['deleted'], int)

        after = admin_session.get(f'{BASE_URL}/api/analytics/store-landings/audit-log', timeout=10)
        assert after.status_code == 200
        items = after.json().get('items', [])
        assert len(items) >= 1
        entry = next((it for it in items if it.get('id') == audit_id), None)
        assert entry is not None
        assert entry.get('dashboard_type') == 'store_landings'
        assert entry.get('reset_by_email') == ADMIN_EMAIL
        assert isinstance(entry.get('deleted_count'), int)
        assert entry.get('reset_at')
        assert entry.get('organization_id')

    def test_landings_analytics_zero_after_reset(self, admin_session):
        admin_session.post(f'{BASE_URL}/api/analytics/store-landings/reset',
                           json={'confirm': 'RESET'}, timeout=20)
        r = admin_session.get(f'{BASE_URL}/api/analytics/store-landings?period=30d', timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert 'totals' in data and 'by_store' in data
        t = data['totals']
        # After reset, every counter must be 0
        for k in ('views', 'cta_clicks', 'review_clicks', 'maps_clicks',
                   'social_clicks', 'form_views', 'bounces'):
            assert t.get(k, 0) == 0, f'totals.{k} not 0 after reset: {t[k]}'
        assert t.get('conversion_rate', 0) == 0.0
        assert t.get('bounce_rate', 0) == 0.0


# ── Tenant isolation: super admin reset must NOT wipe org-admin's audit ──

class TestTenantIsolation:
    def test_audit_log_is_org_scoped(self, admin_session):
        """Org-admin's audit-log must only contain entries for its own org."""
        r = admin_session.get(f'{BASE_URL}/api/push/analytics/audit-log', timeout=10)
        assert r.status_code == 200
        items = r.json().get('items', [])
        # Resolve admin's org id via /auth/me
        me = admin_session.get(f'{BASE_URL}/api/auth/me', timeout=10).json()
        my_org = me.get('organization_id')
        assert my_org, 'admin must have organization_id'
        for it in items:
            assert it.get('organization_id') == my_org, \
                f'cross-tenant leak in audit log: {it.get("organization_id")} != {my_org}'
            assert it.get('dashboard_type') == 'push'

    def test_landings_audit_log_is_org_scoped(self, admin_session):
        r = admin_session.get(f'{BASE_URL}/api/analytics/store-landings/audit-log', timeout=10)
        assert r.status_code == 200
        items = r.json().get('items', [])
        me = admin_session.get(f'{BASE_URL}/api/auth/me', timeout=10).json()
        my_org = me.get('organization_id')
        for it in items:
            assert it.get('organization_id') == my_org
            assert it.get('dashboard_type') == 'store_landings'


# ── Push broadcast vendor scoping regression (iter_23) ────────────────────

class TestPushBroadcastRegression:
    def test_broadcast_endpoint_still_reachable(self, admin_session):
        # Anonymous → 401/403
        anon = requests.Session()
        r = anon.post(f'{BASE_URL}/api/push/broadcast',
                       json={'title': 'x', 'body': 'y'}, timeout=10)
        assert r.status_code in (401, 403)

        # Authenticated with no subs → 0 sent but 200 OK
        r = admin_session.post(f'{BASE_URL}/api/push/broadcast',
                               json={'title': f'TEST_{uuid.uuid4().hex[:6]}',
                                     'body': 'regression test'},
                               timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert 'sent' in data and 'broadcast_id' in data
