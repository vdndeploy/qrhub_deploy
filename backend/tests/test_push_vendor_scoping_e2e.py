"""End-to-end validation of the cross-vendor leak bug fix.

Scenario:
  - Two vendors A and B in the SAME organization.
  - Four fake push_subscriptions inserted directly via motor:
      A-vendor, A-org (scope=organization), B-vendor, B-org (scope=organization)
  - Admin fires POST /api/push/broadcast with vendor_id=A.
  - Expected (post-fix): the persisted push_broadcasts doc reflects exactly
    2 subscribers matched (A-vendor + A-org), and NEITHER B-vendor nor B-org
    appears in the targeted endpoints. Cross-vendor leak gone.

The webpush call uses fake URLs, so `_send_one` will catch a generic
exception and return None ⇒ counted as "sent" (i.e. not stale). The
`sent` counter on push_broadcasts therefore equals the number of subs
the MongoDB query MATCHED — which is exactly what we want to assert.

Regression block:
  - vendor_id=None (org-wide) ⇒ all 4 subs reached.
"""
import asyncio
import os
import uuid

import pytest
import requests
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

# Load backend/.env (MONGO_URL, DB_NAME) and frontend/.env (REACT_APP_BACKEND_URL)
load_dotenv('/app/backend/.env')
load_dotenv('/app/frontend/.env')

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME = os.environ.get('DB_NAME')

ORG_ADMIN_EMAIL = 'admin@example.com'
ORG_ADMIN_PASSWORD = 'admin123'

PREFIX = f"E2E_SCOPING_{uuid.uuid4().hex[:8]}"


@pytest.fixture(scope='module')
def org_admin_session():
    s = requests.Session()
    s.headers.update({'Content-Type': 'application/json'})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={'email': ORG_ADMIN_EMAIL, 'password': ORG_ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"org_admin login failed: {r.status_code} {r.text}")
    return s


@pytest.fixture(scope='module')
def org_id(org_admin_session):
    me = org_admin_session.get(f"{BASE_URL}/api/auth/me").json()
    return me.get('organization_id')


@pytest.fixture(scope='module')
def two_vendors(org_admin_session):
    """Pick two distinct vendors in the org_admin's tenant."""
    r = org_admin_session.get(f"{BASE_URL}/api/vendors")
    assert r.status_code == 200
    vendors = r.json()
    if len(vendors) < 2:
        pytest.skip(f"need 2+ vendors in tenant, got {len(vendors)}")
    return vendors[0], vendors[1]


@pytest.fixture(scope='module')
def mongo_db():
    if not MONGO_URL or not DB_NAME:
        pytest.skip('MONGO_URL/DB_NAME not configured')
    # Don't hold a long-lived motor client tied to a single loop; instead
    # return a small helper that opens/closes per-call so the fixture
    # composes with both pytest-asyncio and synchronous tests (this file
    # uses synchronous tests that wrap motor calls via _run_async).
    yield {'MONGO_URL': MONGO_URL, 'DB_NAME': DB_NAME}


def _run_async(coro):
    """Run a coroutine on a fresh event loop. Safe to call from inside a
    suite that may have already exhausted the default loop."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


async def _with_db(cfg, fn):
    client = AsyncIOMotorClient(cfg['MONGO_URL'])
    try:
        return await fn(client[cfg['DB_NAME']])
    finally:
        client.close()


# Valid-looking p256dh/auth (we never actually deliver — webpush will fail
# on a fake FCM endpoint and `_send_one` returns None for non-410 errors,
# which the broadcast helper counts as 'sent'.).
_P256DH = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM'
_AUTH = 'tBHItJI5svbpez7KI4CCXg'


def _sub_doc(label, vendor_id, organization_id, scope):
    return {
        'endpoint': f"https://fcm.googleapis.com/fcm/send/{PREFIX}-{label}-{uuid.uuid4().hex}",
        'keys': {'p256dh': _P256DH, 'auth': _AUTH},
        'vendor_id': vendor_id,
        'organization_id': organization_id,
        'scope': scope,
        'created_at': '2026-01-01T00:00:00+00:00',
    }


@pytest.fixture(scope='function')
def seeded_subs(mongo_db, two_vendors, org_id):
    """Insert 4 fake subscribers into push_subscriptions, yield then cleanup.
    Function-scope because broadcast may delete them as stale (fake FCM
    endpoints return 410), so we re-seed before every test."""
    vA, vB = two_vendors
    docs = [
        _sub_doc('A-vendor', vA['id'], org_id, 'vendor'),
        _sub_doc('A-org',    vA['id'], org_id, 'organization'),
        _sub_doc('B-vendor', vB['id'], org_id, 'vendor'),
        _sub_doc('B-org',    vB['id'], org_id, 'organization'),
    ]

    async def _insert(db):
        await db.push_subscriptions.insert_many(docs)

    async def _cleanup(db):
        await db.push_subscriptions.delete_many(
            {'endpoint': {'$regex': f"^https://fcm.googleapis.com/fcm/send/{PREFIX}-"}}
        )
        await db.push_broadcasts.delete_many({'title': {'$regex': f"^{PREFIX}"}})

    _run_async(_with_db(mongo_db, _insert))
    yield {'vA': vA, 'vB': vB, 'docs': docs}
    _run_async(_with_db(mongo_db, _cleanup))


async def _get_broadcast(cfg, bid):
    async def _fn(db):
        return await db.push_broadcasts.find_one({'id': bid}, {'_id': 0})
    return await _with_db(cfg, _fn)


class TestVendorScopingE2E:
    """End-to-end DB-backed validation of the cross-vendor leak fix."""

    def test_manual_vendor_broadcast_strict_no_leak(
        self, org_admin_session, seeded_subs, mongo_db
    ):
        """vendor_id=A → broadcast doc must reflect EXACTLY 2 matched subs
        (A-vendor + A-org). B-vendor and B-org must NOT be reached."""
        title = f"{PREFIX} strict"
        r = org_admin_session.post(f"{BASE_URL}/api/push/broadcast", json={
            'title': title, 'body': 'no leak', 'url': '/',
            'vendor_id': seeded_subs['vA']['id'],
        })
        assert r.status_code == 200, r.text
        data = r.json()
        bid = data['broadcast_id']

        # Inspect the persisted push_broadcasts doc directly
        doc = _run_async(_get_broadcast(mongo_db, bid))
        assert doc is not None, f"broadcast doc {bid} not persisted"

        # `sent + stale_cleaned` == subs matched by the query.
        # For our fake FCM endpoints, webpush raises a non-410 exception
        # which `_send_one` swallows and returns None (counted as sent).
        # So matched_subs == sent.
        matched = doc.get('sent', 0) + doc.get('stale_cleaned', 0)
        assert matched == 2, (
            f"cross-vendor leak: expected 2 matched subs (A-vendor + A-org), "
            f"got {matched} (sent={doc.get('sent')}, "
            f"stale={doc.get('stale_cleaned')}). Broadcast id={bid}"
        )
        assert doc['vendor_id'] == seeded_subs['vA']['id']
        assert doc['origin'] == 'manual'

    def test_org_wide_broadcast_reaches_all_org_subs(
        self, org_admin_session, seeded_subs, mongo_db, org_id
    ):
        """vendor_id=None → every sub of the org receives. Should match the
        4 seeded subs (plus any pre-existing real subs in that org)."""
        title = f"{PREFIX} orgwide"
        r = org_admin_session.post(f"{BASE_URL}/api/push/broadcast", json={
            'title': title, 'body': 'tutti', 'url': '/',
        })
        assert r.status_code == 200, r.text
        bid = r.json()['broadcast_id']

        doc = _run_async(_get_broadcast(mongo_db, bid))
        assert doc is not None
        matched = doc.get('sent', 0) + doc.get('stale_cleaned', 0)
        # Must be at least our 4 seeded ones — there may be more real ones
        # already in the org, so use >=.
        assert matched >= 4, (
            f"org-wide reach broken: expected >=4 matched, got {matched}"
        )
        assert doc['vendor_id'] == ''  # blank means org-wide in the doc shape

    def test_manual_broadcast_other_vendor_does_not_match_first_vendors_subs(
        self, org_admin_session, seeded_subs, mongo_db
    ):
        """Mirror test: vendor_id=B → matches only B-vendor + B-org (=2).
        Validates the fix is symmetric (not biased to the first vendor)."""
        title = f"{PREFIX} mirror"
        r = org_admin_session.post(f"{BASE_URL}/api/push/broadcast", json={
            'title': title, 'body': 'mirror', 'url': '/',
            'vendor_id': seeded_subs['vB']['id'],
        })
        assert r.status_code == 200, r.text
        bid = r.json()['broadcast_id']

        doc = _run_async(_get_broadcast(mongo_db, bid))
        assert doc is not None
        matched = doc.get('sent', 0) + doc.get('stale_cleaned', 0)
        assert matched == 2, (
            f"cross-vendor leak (B side): expected 2 matched, got {matched} "
            f"(broadcast id={bid})"
        )
        assert doc['vendor_id'] == seeded_subs['vB']['id']
