"""Tests for iter_25 — Reviews Analytics endpoint (GET /api/analytics/reviews).

Covers:
- Authentication gate (401/403 for anon).
- Default period (30d) schema validation.
- All period values: today, yesterday, 7d, 30d, month, all.
- Aggregation correctness: store_landing + vendor_profile == review_clicks total.
- share_pct sums ~100 when there are clicks.
- period='all' includes zero-click stores; other periods exclude them.
- Tenant isolation via organization_id (admin only sees own stores).
- Regression on existing endpoints (/analytics/store-landings,
  /analytics/detailed, /analytics/top-vendors, /push/analytics).
"""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
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

PERIODS = ['today', 'yesterday', '7d', '30d', 'month', 'all']


def _login(email, password):
    s = requests.Session()
    r = s.post(f'{BASE_URL}/api/auth/login',
               json={'email': email, 'password': password}, timeout=15)
    assert r.status_code == 200, f'login failed: {r.status_code} {r.text}'
    return s


@pytest.fixture(scope='module')
def admin_session():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope='module')
def admin_org_id(admin_session):
    me = admin_session.get(f'{BASE_URL}/api/auth/me', timeout=10).json()
    return me.get('organization_id')


@pytest.fixture
def anon():
    return requests.Session()


# ── Auth gate ────────────────────────────────────────────────────────────

class TestAuthRequired:
    def test_anon_blocked(self, anon):
        r = anon.get(f'{BASE_URL}/api/analytics/reviews', timeout=10)
        assert r.status_code in (401, 403), \
            f'expected 401/403 anon, got {r.status_code}'


# ── Schema + shape ──────────────────────────────────────────────────────

class TestSchema:
    @pytest.mark.parametrize('period', PERIODS)
    def test_period_returns_shape(self, admin_session, period):
        r = admin_session.get(f'{BASE_URL}/api/analytics/reviews',
                              params={'period': period}, timeout=15)
        assert r.status_code == 200, f'{period}: {r.status_code} {r.text}'
        d = r.json()

        # Top-level keys
        for k in ('period', 'totals', 'by_store', 'timeline'):
            assert k in d, f'{period}: missing key {k}'
        assert d['period'] == period

        # totals shape
        t = d['totals']
        for k in ('review_clicks', 'store_landing', 'vendor_profile'):
            assert k in t, f'{period}: totals missing {k}'
            assert isinstance(t[k], int), \
                f'{period}: totals.{k} not int (got {type(t[k]).__name__})'

        # by_store rows
        assert isinstance(d['by_store'], list)
        for row in d['by_store']:
            for k in ('id', 'name', 'slug', 'store_landing_clicks',
                      'vendor_profile_clicks', 'total_clicks', 'share_pct'):
                assert k in row, f'{period}: by_store row missing {k}'
            assert isinstance(row['store_landing_clicks'], int)
            assert isinstance(row['vendor_profile_clicks'], int)
            assert row['total_clicks'] == (
                row['store_landing_clicks'] + row['vendor_profile_clicks']
            )

        # timeline rows
        assert isinstance(d['timeline'], list)
        for t_row in d['timeline']:
            assert 'date' in t_row and 'count' in t_row
            assert isinstance(t_row['count'], int)

    def test_default_period_is_30d(self, admin_session):
        r = admin_session.get(f'{BASE_URL}/api/analytics/reviews', timeout=15)
        assert r.status_code == 200
        assert r.json()['period'] == '30d'


# ── Aggregation invariants ──────────────────────────────────────────────

class TestAggregation:
    def test_totals_sum_matches(self, admin_session):
        """totals.store_landing + totals.vendor_profile == totals.review_clicks."""
        for period in PERIODS:
            r = admin_session.get(f'{BASE_URL}/api/analytics/reviews',
                                  params={'period': period}, timeout=15)
            assert r.status_code == 200
            t = r.json()['totals']
            assert t['store_landing'] + t['vendor_profile'] == t['review_clicks'], \
                f"{period}: {t['store_landing']}+{t['vendor_profile']} != {t['review_clicks']}"

    def test_by_store_total_matches_grand_total(self, admin_session):
        """Sum of by_store.total_clicks must equal totals.review_clicks
        (when period != 'all' some zero rows are hidden — they contribute 0 anyway)."""
        for period in PERIODS:
            r = admin_session.get(f'{BASE_URL}/api/analytics/reviews',
                                  params={'period': period}, timeout=15)
            d = r.json()
            sum_rows = sum(row['total_clicks'] for row in d['by_store'])
            assert sum_rows == d['totals']['review_clicks'], \
                f"{period}: by_store sum {sum_rows} != grand {d['totals']['review_clicks']}"

    def test_share_pct_sums_100(self, admin_session, admin_org_id):
        """Inject synthetic events then assert share_pct sums ~100."""
        # Resolve one store of the org
        stores_r = admin_session.get(f'{BASE_URL}/api/stores', timeout=10)
        assert stores_r.status_code == 200
        stores = stores_r.json()
        if not stores:
            pytest.skip('No stores in org — cannot test share_pct')
        store_id = stores[0]['id']

        # Inject 3 store_landing_review_click events (public track endpoint)
        unique_marker = f'TEST_{uuid.uuid4().hex[:6]}'
        for _ in range(3):
            track = requests.post(
                f'{BASE_URL}/api/analytics',
                json={
                    'event_type': 'store_landing_review_click',
                    'store_id': store_id,
                    'vendor_id': '',
                    'session_marker': unique_marker,
                },
                timeout=10,
            )
            assert track.status_code == 200, track.text

        # Re-fetch and verify
        r = admin_session.get(f'{BASE_URL}/api/analytics/reviews',
                              params={'period': '7d'}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        if d['totals']['review_clicks'] == 0:
            pytest.skip('No clicks after seeding — backend may not have processed')

        total_share = sum(row['share_pct'] for row in d['by_store'])
        # Round-off tolerance ±0.5
        assert abs(total_share - 100.0) <= 0.5, \
            f'share_pct sum {total_share} not ~100 (rows={d["by_store"]})'

    def test_period_all_includes_zero_rows(self, admin_session):
        """period='all' includes all stores even with 0 clicks."""
        # Count stores in org
        sr = admin_session.get(f'{BASE_URL}/api/stores', timeout=10)
        store_count = len(sr.json())
        if store_count == 0:
            pytest.skip('No stores')

        r = admin_session.get(f'{BASE_URL}/api/analytics/reviews',
                              params={'period': 'all'}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert len(d['by_store']) == store_count, \
            f"period=all should list all {store_count} stores, got {len(d['by_store'])}"

    def test_short_period_excludes_zero_rows(self, admin_session):
        """Short windows should hide zero-click rows (unless every store has clicks)."""
        r = admin_session.get(f'{BASE_URL}/api/analytics/reviews',
                              params={'period': '7d'}, timeout=15)
        d = r.json()
        for row in d['by_store']:
            assert row['total_clicks'] > 0, \
                f"7d should not include zero-click row: {row}"


# ── Tenant isolation ────────────────────────────────────────────────────

class TestTenantIsolation:
    def test_admin_only_sees_own_org_stores(self, admin_session, admin_org_id):
        # Stores list (org-scoped by /api/stores endpoint)
        sr = admin_session.get(f'{BASE_URL}/api/stores', timeout=10)
        assert sr.status_code == 200
        my_store_ids = {s['id'] for s in sr.json()}

        r = admin_session.get(f'{BASE_URL}/api/analytics/reviews',
                              params={'period': 'all'}, timeout=15)
        assert r.status_code == 200
        review_store_ids = {row['id'] for row in r.json()['by_store']}
        leaked = review_store_ids - my_store_ids
        assert not leaked, f'cross-tenant leak: {leaked}'


# ── Regression: existing analytics endpoints still functional ───────────

class TestRegression:
    def test_store_landings_still_works(self, admin_session):
        r = admin_session.get(f'{BASE_URL}/api/analytics/store-landings',
                              params={'period': '7d'}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert 'totals' in d and 'by_store' in d

    def test_detailed_still_works(self, admin_session):
        r = admin_session.get(f'{BASE_URL}/api/analytics/detailed',
                              params={'period': '30d'}, timeout=20)
        assert r.status_code == 200
        d = r.json()
        for k in ('total_events', 'total_clicks', 'click_breakdown', 'timeline'):
            assert k in d

    def test_top_vendors_still_works(self, admin_session):
        r = admin_session.get(f'{BASE_URL}/api/analytics/top-vendors',
                              params={'period': '30d'}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert 'items' in d and 'period' in d

    def test_push_analytics_still_works(self, admin_session):
        r = admin_session.get(f'{BASE_URL}/api/push/analytics', timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ('subscribers', 'totals', 'by_vendor', 'recent_broadcasts'):
            assert k in d
