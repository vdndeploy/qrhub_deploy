"""Iter 26 — Push Analytics period filter tests.

Validates GET /api/push/analytics?period=... feature added to push.py.
Requirements:
  - Auth gate (401 anon)
  - Default period = 'all' (backward compatible)
  - Schema includes 'period' echo
  - Subscribers NOT period-filtered (live snapshot)
  - Totals (broadcasts/sent/clicks/ctr_pct) filtered by created_at window
  - recent_broadcasts limited to the window
  - All 6 period labels accepted: today, yesterday, 7d, 30d, month, all
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/') or \
    'https://qr-deploy-1.preview.emergentagent.com'

ORG_ADMIN_EMAIL = 'admin@example.com'
ORG_ADMIN_PASSWORD = 'admin123'


@pytest.fixture(scope='module')
def anon():
    s = requests.Session()
    s.headers.update({'Content-Type': 'application/json'})
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


class TestAuthGate:
    def test_anon_blocked(self, anon):
        r = anon.get(f"{BASE_URL}/api/push/analytics")
        assert r.status_code == 401, r.text

    def test_anon_blocked_with_period(self, anon):
        r = anon.get(f"{BASE_URL}/api/push/analytics?period=today")
        assert r.status_code == 401, r.text


class TestPeriodEchoAndSchema:
    @pytest.mark.parametrize('period', ['today', 'yesterday', '7d', '30d', 'month', 'all'])
    def test_each_period_returns_200_and_echoes(self, org_admin, period):
        r = org_admin.get(f"{BASE_URL}/api/push/analytics?period={period}")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get('period') == period, f"period not echoed: got {d.get('period')}"
        # Required keys
        for k in ('subscribers', 'totals', 'by_vendor', 'recent_broadcasts'):
            assert k in d, f"missing {k} for period={period}"
        for k in ('broadcasts', 'sent', 'clicks', 'ctr_pct'):
            assert k in d['totals']
        for k in ('total', 'vendor_scope', 'org_scope'):
            assert k in d['subscribers']

    def test_default_period_is_all(self, org_admin):
        r = org_admin.get(f"{BASE_URL}/api/push/analytics")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get('period') == 'all', f"expected default 'all', got {d.get('period')}"

    def test_unknown_period_falls_back_to_all_window(self, org_admin):
        # Per code: anything not in the known list → unbounded (start=None)
        r = org_admin.get(f"{BASE_URL}/api/push/analytics?period=bogus")
        assert r.status_code == 200, r.text
        d = r.json()
        # 'period' echoes whatever the client passed (lower-cased)
        assert d.get('period') == 'bogus'
        # Behavior of 'bogus' should match 'all' totals
        r_all = org_admin.get(f"{BASE_URL}/api/push/analytics?period=all").json()
        assert d['totals']['broadcasts'] == r_all['totals']['broadcasts']


class TestSubscribersNotFilteredByPeriod:
    """Subscribers list is a live snapshot — same number across all periods."""
    def test_subscribers_invariant_across_periods(self, org_admin):
        snaps = {}
        for p in ('today', 'yesterday', '7d', '30d', 'month', 'all'):
            d = org_admin.get(f"{BASE_URL}/api/push/analytics?period={p}").json()
            snaps[p] = d['subscribers']['total']
        # All values must be equal (subscribers are NOT bound to broadcast window)
        unique = set(snaps.values())
        assert len(unique) == 1, f"subscribers leaked period filter: {snaps}"


class TestTotalsFilteredByPeriod:
    """Totals (broadcasts/sent/clicks) must be filtered by created_at window.
    Strategy: fire 1 broadcast NOW, then verify counters increase ONLY for the
    'today'/'7d'/'30d'/'month'/'all' windows — NOT for 'yesterday'."""

    def test_new_broadcast_visible_in_today_and_all_not_in_yesterday(self, org_admin):
        # Snapshot before
        before = {}
        for p in ('today', 'yesterday', '7d', '30d', 'month', 'all'):
            before[p] = org_admin.get(f"{BASE_URL}/api/push/analytics?period={p}") \
                .json()['totals']['broadcasts']

        # Fire a broadcast (will land in 'today' window — Europe/Rome)
        title = f'TEST_PERIOD_{uuid.uuid4().hex[:8]}'
        r = org_admin.post(f"{BASE_URL}/api/push/broadcast",
                           json={'title': title, 'body': 'period test'})
        assert r.status_code == 200, r.text
        bid = r.json().get('broadcast_id')
        assert bid, f"no broadcast_id: {r.json()}"

        # Snapshot after
        after = {}
        for p in ('today', 'yesterday', '7d', '30d', 'month', 'all'):
            after[p] = org_admin.get(f"{BASE_URL}/api/push/analytics?period={p}") \
                .json()['totals']['broadcasts']

        # 'today', '7d', '30d', 'month', 'all' should all increase by exactly 1
        for p in ('today', '7d', '30d', 'month', 'all'):
            assert after[p] == before[p] + 1, \
                f"period={p} did not pick up new broadcast: before={before[p]} after={after[p]}"

        # 'yesterday' must NOT see the new broadcast (it's a closed past window)
        assert after['yesterday'] == before['yesterday'], \
            f"yesterday window leaked: before={before['yesterday']} after={after['yesterday']}"

    def test_recent_broadcasts_limited_to_window(self, org_admin):
        # The brand-new broadcast we just fired should appear in 'today' recent_broadcasts
        # but not in 'yesterday'.
        title = f'TEST_RECENT_{uuid.uuid4().hex[:8]}'
        r = org_admin.post(f"{BASE_URL}/api/push/broadcast",
                           json={'title': title, 'body': 'recent test'})
        assert r.status_code == 200
        bid = r.json()['broadcast_id']

        today = org_admin.get(f"{BASE_URL}/api/push/analytics?period=today").json()
        yesterday = org_admin.get(f"{BASE_URL}/api/push/analytics?period=yesterday").json()

        today_ids = [b['id'] for b in today['recent_broadcasts']]
        yesterday_ids = [b['id'] for b in yesterday['recent_broadcasts']]

        assert bid in today_ids, f"new broadcast missing from today: {today_ids[:5]}"
        assert bid not in yesterday_ids, \
            f"new broadcast leaked into yesterday window: {yesterday_ids[:5]}"


class TestRegression:
    """Make sure adjacent analytics endpoints still respond OK (iter_25)."""
    def test_reviews_analytics_still_ok(self, org_admin):
        r = org_admin.get(f"{BASE_URL}/api/analytics/reviews")
        assert r.status_code == 200, r.text

    def test_store_landings_still_ok(self, org_admin):
        r = org_admin.get(f"{BASE_URL}/api/analytics/store-landings")
        assert r.status_code == 200, r.text

    def test_detailed_still_ok(self, org_admin):
        r = org_admin.get(f"{BASE_URL}/api/analytics/detailed")
        assert r.status_code == 200, r.text

    def test_push_broadcast_still_ok(self, org_admin):
        r = org_admin.post(f"{BASE_URL}/api/push/broadcast",
                           json={'title': 'TEST_REGR', 'body': 'regression'})
        assert r.status_code == 200, r.text
        assert 'sent' in r.json() and 'cleaned_stale' in r.json()
