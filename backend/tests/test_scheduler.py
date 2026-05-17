"""
Scheduler tests — verifies start_at/end_at filtering on posts.
Ensures:
  - Admin GET /api/stores/{id}/posts returns ALL posts with status.
  - Public GET /api/vendors/{id} returns only 'active' posts.
  - Status derivation (scheduled/active/expired) based on now vs start_at/end_at.
"""
import os
import time
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    # fallback read from frontend .env (preview env)
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')

ADMIN_EMAIL = 'admin@windtre.com'
ADMIN_PASSWORD = 'admin123'


@pytest.fixture(scope='session')
def admin_session():
    s = requests.Session()
    r = s.post(f'{BASE_URL}/api/auth/login',
               json={'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD},
               timeout=15)
    assert r.status_code == 200, f'Admin login failed: {r.status_code} {r.text}'
    return s


@pytest.fixture(scope='session')
def test_store(admin_session):
    # create a dedicated TEST_ store
    r = admin_session.post(f'{BASE_URL}/api/stores',
                           json={'name': 'TEST_Scheduler_Store',
                                 'whatsapp': '+39000000000',
                                 'instagram': 'https://instagram.com/test'},
                           timeout=15)
    assert r.status_code == 200, r.text
    store = r.json()
    yield store
    # cleanup: delete posts then store
    posts = admin_session.get(f'{BASE_URL}/api/stores/{store["id"]}/posts', timeout=15)
    if posts.status_code == 200:
        for p in posts.json():
            admin_session.delete(f'{BASE_URL}/api/posts/{p["id"]}', timeout=15)
    admin_session.delete(f'{BASE_URL}/api/stores/{store["id"]}', timeout=15)


@pytest.fixture(scope='session')
def test_vendor(admin_session, test_store):
    r = admin_session.post(f'{BASE_URL}/api/vendors',
                           json={'name': 'TEST_Scheduler_Vendor',
                                 'bio': 'scheduler test',
                                 'store_id': test_store['id']},
                           timeout=15)
    assert r.status_code == 200, r.text
    vendor = r.json()
    yield vendor
    admin_session.delete(f'{BASE_URL}/api/vendors/{vendor["id"]}', timeout=15)


def _iso(dt):
    return dt.astimezone(timezone.utc).isoformat()


# ────────── Core scheduler unit tests ──────────

class TestSchedulerStatus:

    def test_post_no_dates_is_active(self, admin_session, test_store):
        r = admin_session.post(f'{BASE_URL}/api/stores/{test_store["id"]}/posts',
                               json={'title': 'TEST_no_dates', 'text': 'hello'})
        assert r.status_code == 200, r.text
        p = r.json()
        assert p['status'] == 'active', f"expected active, got {p}"
        assert p['start_at'] in (None, '')
        assert p['end_at'] in (None, '')
        admin_session.delete(f'{BASE_URL}/api/posts/{p["id"]}')

    def test_post_future_start_is_scheduled(self, admin_session, test_store):
        future = datetime.now(timezone.utc) + timedelta(days=3)
        r = admin_session.post(f'{BASE_URL}/api/stores/{test_store["id"]}/posts',
                               json={'title': 'TEST_future', 'text': 'x',
                                     'start_at': _iso(future)})
        assert r.status_code == 200, r.text
        p = r.json()
        assert p['status'] == 'scheduled', p
        assert p['start_at'] is not None
        admin_session.delete(f'{BASE_URL}/api/posts/{p["id"]}')

    def test_post_past_end_is_expired(self, admin_session, test_store):
        past = datetime.now(timezone.utc) - timedelta(days=1)
        r = admin_session.post(f'{BASE_URL}/api/stores/{test_store["id"]}/posts',
                               json={'title': 'TEST_expired', 'text': 'x',
                                     'end_at': _iso(past)})
        assert r.status_code == 200, r.text
        p = r.json()
        assert p['status'] == 'expired', p
        admin_session.delete(f'{BASE_URL}/api/posts/{p["id"]}')

    def test_post_in_window_is_active(self, admin_session, test_store):
        start = datetime.now(timezone.utc) - timedelta(hours=1)
        end = datetime.now(timezone.utc) + timedelta(days=1)
        r = admin_session.post(f'{BASE_URL}/api/stores/{test_store["id"]}/posts',
                               json={'title': 'TEST_window', 'text': 'x',
                                     'start_at': _iso(start), 'end_at': _iso(end)})
        assert r.status_code == 200
        p = r.json()
        assert p['status'] == 'active', p
        admin_session.delete(f'{BASE_URL}/api/posts/{p["id"]}')


# ────────── Public vs admin visibility ──────────

class TestPublicVsAdminVisibility:

    def test_admin_sees_all_public_sees_active(self, admin_session, test_store, test_vendor):
        future = datetime.now(timezone.utc) + timedelta(days=2)
        past = datetime.now(timezone.utc) - timedelta(days=2)

        ids = []
        # Scheduled
        r1 = admin_session.post(f'{BASE_URL}/api/stores/{test_store["id"]}/posts',
                                json={'title': 'TEST_sched', 'start_at': _iso(future)})
        assert r1.status_code == 200
        ids.append(r1.json()['id'])

        # Expired
        r2 = admin_session.post(f'{BASE_URL}/api/stores/{test_store["id"]}/posts',
                                json={'title': 'TEST_exp', 'end_at': _iso(past)})
        assert r2.status_code == 200
        ids.append(r2.json()['id'])

        # Active
        r3 = admin_session.post(f'{BASE_URL}/api/stores/{test_store["id"]}/posts',
                                json={'title': 'TEST_act'})
        assert r3.status_code == 200
        active_id = r3.json()['id']
        ids.append(active_id)

        try:
            # Admin list — all 3 with status values present
            ar = admin_session.get(f'{BASE_URL}/api/stores/{test_store["id"]}/posts')
            assert ar.status_code == 200
            admin_posts = ar.json()
            admin_ids = {p['id']: p for p in admin_posts}
            for pid in ids:
                assert pid in admin_ids, f'{pid} missing from admin list'
                assert admin_ids[pid]['status'] in ('scheduled', 'active', 'expired')

            statuses = {admin_ids[i]['status'] for i in ids}
            assert statuses == {'scheduled', 'active', 'expired'}, statuses

            # Public — only active
            pr = requests.get(f'{BASE_URL}/api/vendors/{test_vendor["id"]}', timeout=15)
            assert pr.status_code == 200
            pub_posts = pr.json().get('posts', [])
            pub_ids = {p['id'] for p in pub_posts}
            assert active_id in pub_ids, f'active post missing from public: {pub_ids}'
            for pid in ids:
                if pid != active_id:
                    assert pid not in pub_ids, f'non-active {pid} leaked into public feed'
            for p in pub_posts:
                assert p['status'] == 'active', p
        finally:
            for pid in ids:
                admin_session.delete(f'{BASE_URL}/api/posts/{pid}')


# ────────── Update flow ──────────

class TestUpdateScheduling:

    def test_put_post_updates_schedule(self, admin_session, test_store):
        # create active
        r = admin_session.post(f'{BASE_URL}/api/stores/{test_store["id"]}/posts',
                               json={'title': 'TEST_upd', 'text': 'y'})
        assert r.status_code == 200
        pid = r.json()['id']
        assert r.json()['status'] == 'active'

        # Update with past end_at -> expired
        past = datetime.now(timezone.utc) - timedelta(hours=2)
        u = admin_session.put(f'{BASE_URL}/api/posts/{pid}',
                              json={'title': 'TEST_upd', 'text': 'y', 'end_at': _iso(past)})
        assert u.status_code == 200, u.text
        assert u.json()['status'] == 'expired', u.json()
        assert u.json()['end_at'] is not None

        # GET persistence check
        g = admin_session.get(f'{BASE_URL}/api/stores/{test_store["id"]}/posts')
        updated = next(x for x in g.json() if x['id'] == pid)
        assert updated['status'] == 'expired'
        assert updated['end_at'] is not None

        admin_session.delete(f'{BASE_URL}/api/posts/{pid}')


# ────────── Regression: legacy flows ──────────

class TestRegression:

    def test_auth_login_me(self, admin_session):
        me = admin_session.get(f'{BASE_URL}/api/auth/me', timeout=15)
        assert me.status_code == 200
        assert me.json()['email'] == ADMIN_EMAIL

    def test_list_stores_and_vendors(self, admin_session):
        s = admin_session.get(f'{BASE_URL}/api/stores', timeout=15)
        assert s.status_code == 200
        assert isinstance(s.json(), list)

        v = admin_session.get(f'{BASE_URL}/api/vendors', timeout=15)
        assert v.status_code == 200

    def test_public_vendor_legacy_store_only_active_posts(self, admin_session):
        """Legacy store 69ebad2db89f49c0ab046d58 must only expose active posts publicly."""
        store_id = '69ebad2db89f49c0ab046d58'
        # find a vendor on this store
        vs = admin_session.get(f'{BASE_URL}/api/vendors').json()
        vendor = next((v for v in vs if v.get('store_id') == store_id), None)
        if not vendor:
            pytest.skip('no vendor on legacy store; skipping')
        r = requests.get(f'{BASE_URL}/api/vendors/{vendor["id"]}', timeout=15)
        assert r.status_code == 200
        posts = r.json().get('posts', [])
        for p in posts:
            assert p['status'] == 'active', f'non-active leaked: {p}'

    def test_auto_position_on_omitted_field(self, admin_session, test_store):
        """Iteration-3 bug fix regression: omitting 'position' triggers auto-positioning."""
        ids = []
        for i in range(3):
            r = admin_session.post(f'{BASE_URL}/api/stores/{test_store["id"]}/posts',
                                   json={'title': f'TEST_pos_{i}'})
            assert r.status_code == 200
            ids.append(r.json()['id'])

        g = admin_session.get(f'{BASE_URL}/api/stores/{test_store["id"]}/posts').json()
        my_posts = [p for p in g if p['id'] in ids]
        positions = [p['position'] for p in my_posts]
        # Expect distinct positions (auto-increment) not all zero
        assert len(set(positions)) == len(positions), f'positions collided: {positions}'

        for pid in ids:
            admin_session.delete(f'{BASE_URL}/api/posts/{pid}')
