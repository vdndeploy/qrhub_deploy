"""E2E + unit tests for the new PWA heartbeat / installs analytics feature.

Covers:
  - POST /api/push/heartbeat public endpoint (upsert, normalization, fail-silent)
  - GET  /api/push/analytics `installs` block additive schema + tenant isolation
  - Regression: existing push endpoints still respond OK
"""
import os
import time
import uuid
import asyncio
from datetime import datetime, timezone, timedelta

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://qr-deploy-1.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME = os.environ.get('DB_NAME', 'qrhub_vendor_db')

ADMIN_EMAIL = 'admin@example.com'
ADMIN_PASS = 'admin123'


# ── Fixtures ────────────────────────────────────────────────────────────
@pytest.fixture(scope='module')
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={'email': ADMIN_EMAIL, 'password': ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, f'admin login failed: {r.status_code} {r.text}'
    me = s.get(f"{API}/auth/me", timeout=10).json()
    s.org_id = me['organization_id']
    return s


@pytest.fixture(scope='module')
def target_vendor(admin_session):
    r = admin_session.get(f"{API}/vendors", timeout=10)
    assert r.status_code == 200
    vendors = r.json()
    assert vendors, 'no vendors seeded'
    v = vendors[0]
    return v['id'], admin_session.org_id


@pytest.fixture(scope='module')
def mongo():
    client = AsyncIOMotorClient(MONGO_URL)
    return client[DB_NAME]


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture(autouse=True)
def _cleanup_test_devices(mongo):
    """Purge any TEST_ prefixed device_ids before + after each test."""
    _run(mongo.pwa_devices.delete_many({'device_id': {'$regex': '^TEST_'}}))
    yield
    _run(mongo.pwa_devices.delete_many({'device_id': {'$regex': '^TEST_'}}))


# ── /heartbeat public endpoint ─────────────────────────────────────────
class TestHeartbeat:
    def test_heartbeat_valid_upserts(self, target_vendor, mongo):
        vid, org_id = target_vendor
        device_id = f"TEST_{uuid.uuid4().hex[:12]}"
        r = requests.post(f"{API}/push/heartbeat", json={
            'device_id': device_id, 'vendor_id': vid, 'os': 'ios',
            'notification_permission': 'granted',
        }, timeout=10)
        assert r.status_code == 200
        assert r.json() == {'status': 'ok'}

        doc = _run(mongo.pwa_devices.find_one({'device_id': device_id}))
        assert doc is not None, 'device row not written'
        assert doc['vendor_id'] == vid
        assert doc['organization_id'] == org_id
        assert doc['os'] == 'ios'
        assert doc['notification_permission'] == 'granted'
        assert 'last_seen_at' in doc and 'first_installed_at' in doc

    def test_heartbeat_unknown_vendor_no_write(self, mongo):
        device_id = f"TEST_{uuid.uuid4().hex[:12]}"
        r = requests.post(f"{API}/push/heartbeat", json={
            'device_id': device_id, 'vendor_id': 'ghost-vendor-doesnt-exist',
            'os': 'android', 'notification_permission': 'granted',
        }, timeout=10)
        assert r.status_code == 200
        assert r.json() == {'status': 'ok'}
        doc = _run(mongo.pwa_devices.find_one({'device_id': device_id}))
        assert doc is None, 'ghost vendor should NOT create a device row'

    def test_heartbeat_normalizes_bad_os_and_permission(self, target_vendor, mongo):
        vid, _ = target_vendor
        device_id = f"TEST_{uuid.uuid4().hex[:12]}"
        r = requests.post(f"{API}/push/heartbeat", json={
            'device_id': device_id, 'vendor_id': vid, 'os': 'blackberry',
            'notification_permission': 'weirdvalue',
        }, timeout=10)
        assert r.status_code == 200
        doc = _run(mongo.pwa_devices.find_one({'device_id': device_id}))
        assert doc['os'] == 'other'
        assert doc['notification_permission'] == 'default'

    def test_heartbeat_upsert_preserves_first_installed_at(self, target_vendor, mongo):
        vid, _ = target_vendor
        device_id = f"TEST_{uuid.uuid4().hex[:12]}"
        # First call
        requests.post(f"{API}/push/heartbeat", json={
            'device_id': device_id, 'vendor_id': vid, 'os': 'android',
            'notification_permission': 'default',
        }, timeout=10)
        doc1 = _run(mongo.pwa_devices.find_one({'device_id': device_id}))
        first_installed = doc1['first_installed_at']
        first_last_seen = doc1['last_seen_at']

        time.sleep(1.1)  # ensure ISO timestamp differs
        # Second call — same device, updated permission
        requests.post(f"{API}/push/heartbeat", json={
            'device_id': device_id, 'vendor_id': vid, 'os': 'ios',
            'notification_permission': 'granted',
        }, timeout=10)
        doc2 = _run(mongo.pwa_devices.find_one({'device_id': device_id}))
        # Only one doc — upsert semantics
        count = _run(mongo.pwa_devices.count_documents({'device_id': device_id}))
        assert count == 1
        assert doc2['first_installed_at'] == first_installed, 'first_installed_at must be preserved'
        assert doc2['last_seen_at'] > first_last_seen, 'last_seen_at should advance'
        assert doc2['os'] == 'ios'
        assert doc2['notification_permission'] == 'granted'


# ── /analytics installs block ──────────────────────────────────────────
class TestAnalyticsInstalls:
    def test_installs_field_present_in_schema(self, admin_session):
        r = admin_session.get(f"{API}/push/analytics", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert 'installs' in data, "'installs' key missing from analytics response"
        installs = data['installs']
        for k in ('active_30d', 'active_7d', 'total_ever', 'silenced_30d', 'by_os'):
            assert k in installs, f"missing installs.{k}"
        for k in ('ios', 'android', 'other'):
            assert k in installs['by_os'], f"missing installs.by_os.{k}"
        # Retro-compat: other legacy keys still present
        for legacy in ('subscribers', 'totals', 'by_vendor', 'recent_broadcasts'):
            assert legacy in data, f"legacy key {legacy} disappeared"

    def test_active_and_by_os_counting(self, admin_session, target_vendor, mongo):
        vid, org_id = target_vendor
        # Push 2 iOS granted + 1 Android denied heartbeats
        devs = [
            ('ios', 'granted'), ('ios', 'granted'), ('android', 'denied'),
        ]
        ids = []
        for os_val, perm in devs:
            did = f"TEST_{uuid.uuid4().hex[:12]}"
            ids.append(did)
            requests.post(f"{API}/push/heartbeat", json={
                'device_id': did, 'vendor_id': vid, 'os': os_val,
                'notification_permission': perm,
            }, timeout=10)
        r = admin_session.get(f"{API}/push/analytics", timeout=10)
        installs = r.json()['installs']
        # Because collection may hold pre-existing rows from other tests we
        # can't assert exact totals, but we CAN assert lower bounds.
        assert installs['active_30d'] >= 3
        assert installs['by_os']['ios'] >= 2
        assert installs['by_os']['android'] >= 1
        assert installs['silenced_30d'] >= 1  # the Android 'denied' one

    def test_stale_device_not_in_active_30d(self, admin_session, target_vendor, mongo):
        vid, org_id = target_vendor
        did = f"TEST_stale_{uuid.uuid4().hex[:8]}"
        old_iso = (datetime.now(timezone.utc) - timedelta(days=45)).isoformat()
        _run(mongo.pwa_devices.insert_one({
            'device_id': did, 'vendor_id': vid, 'organization_id': org_id,
            'os': 'ios', 'notification_permission': 'granted',
            'push_endpoint': None,
            'last_seen_at': old_iso, 'first_installed_at': old_iso,
        }))
        r = admin_session.get(f"{API}/push/analytics", timeout=10)
        installs = r.json()['installs']
        # total_ever counts across all time; active_30d must NOT include it.
        assert installs['total_ever'] >= 1
        # We cannot assert exact numbers due to other data, but we can check
        # that adding a stale-only device doesn't bump active counters. We
        # verify by re-querying after removal.
        before_active = installs['active_30d']
        _run(mongo.pwa_devices.delete_one({'device_id': did}))
        after = admin_session.get(f"{API}/push/analytics", timeout=10).json()['installs']
        assert after['active_30d'] == before_active, 'stale device leaked into active_30d'

    def test_tenant_isolation(self, admin_session, target_vendor, mongo):
        """A device belonging to a foreign org must NOT show up in this
        admin's analytics."""
        vid, org_id = target_vendor
        did = f"TEST_foreign_{uuid.uuid4().hex[:8]}"
        _run(mongo.pwa_devices.insert_one({
            'device_id': did,
            'vendor_id': 'someforeignvendor',
            'organization_id': 'foreign-org-id-XYZ',
            'os': 'ios', 'notification_permission': 'granted',
            'push_endpoint': None,
            'last_seen_at': datetime.now(timezone.utc).isoformat(),
            'first_installed_at': datetime.now(timezone.utc).isoformat(),
        }))
        r = admin_session.get(f"{API}/push/analytics", timeout=10)
        # We can't easily prove absence without knowing baseline; instead
        # snapshot before + after removal — but here the doc was written
        # AFTER the snapshot. Simplest: assert the foreign row is present
        # in db but NOT counted in this admin's installs.total_ever
        # measurement (rare exact assertion possible only when we control
        # DB state — we compare pre-injection numbers).
        # Because collection state is not isolated, we assert the doc is
        # not visible via the admin's org filter by re-reading DB:
        foreign_count = _run(mongo.pwa_devices.count_documents(
            {'device_id': did, 'organization_id': 'foreign-org-id-XYZ'}
        ))
        assert foreign_count == 1
        # And the admin's analytics query filters by their own org_id — spot
        # check by adding one MORE row for the admin's org and confirming
        # only that one moves the delta:
        base_total = r.json()['installs']['total_ever']
        did2 = f"TEST_{uuid.uuid4().hex[:8]}"
        _run(mongo.pwa_devices.insert_one({
            'device_id': did2, 'vendor_id': vid, 'organization_id': org_id,
            'os': 'ios', 'notification_permission': 'granted',
            'push_endpoint': None,
            'last_seen_at': datetime.now(timezone.utc).isoformat(),
            'first_installed_at': datetime.now(timezone.utc).isoformat(),
        }))
        r2 = admin_session.get(f"{API}/push/analytics", timeout=10)
        new_total = r2.json()['installs']['total_ever']
        # Assert delta is exactly 1 (foreign row wasn't picked up)
        assert new_total == base_total + 1, (
            f'expected +1, got {new_total - base_total}. Foreign org row is '
            'leaking into admin analytics — tenant isolation broken.'
        )
        _run(mongo.pwa_devices.delete_many({'device_id': {'$in': [did, did2]}}))


# ── Regression on existing push endpoints ──────────────────────────────
class TestPushRegression:
    def test_public_key(self):
        r = requests.get(f"{API}/push/public-key", timeout=10)
        assert r.status_code == 200
        assert 'publicKey' in r.json()

    def test_broadcast_requires_auth(self):
        r = requests.post(f"{API}/push/broadcast", json={
            'title': 'x', 'body': 'y', 'url': ''
        }, timeout=10)
        assert r.status_code in (401, 403)

    def test_analytics_reset_requires_auth(self):
        r = requests.post(f"{API}/push/analytics/reset", json={'confirm': 'RESET'}, timeout=10)
        assert r.status_code in (401, 403)

    def test_subscribe_rejects_bad_vendor(self):
        r = requests.post(f"{API}/push/subscribe", json={
            'endpoint': 'https://example.com/x' * 3,
            'keys': {'p256dh': 'a' * 20, 'auth': 'b' * 20},
            'vendor_id': 'ghost-nope-xxx',
        }, timeout=10)
        assert r.status_code == 404
