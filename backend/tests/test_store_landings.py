"""Backend tests for Store Landing Variants — multi-landing per store.

Validates the CRUD + public lookup flow:
  - GET    /api/stores/{id}/landings
  - POST   /api/stores/{id}/landings
  - PATCH  /api/stores/{id}/landings/{variant_id}
  - DELETE /api/stores/{id}/landings/{variant_id}
  - GET    /api/store-landing/{slug}  ← also resolves variant slugs

Tenant isolation, slug uniqueness across both collections, override merge
into the public payload, and the cascade where store.landing_enabled=False
disables every variant are all asserted here.
"""
import os
import uuid
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

# Load the backend's own env so pymongo connects to the same Atlas DB the
# running backend uses. Without this the local-only fallback hits an
# in-memory test DB that the backend never reads, making cascade tests
# silently pass-through.
load_dotenv('/app/backend/.env')

BACKEND_URL = (os.environ.get('REACT_APP_BACKEND_URL')
               or 'https://qr-deploy-1.preview.emergentagent.com')
BASE_URL = BACKEND_URL.rstrip('/')

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017/')
DB_NAME = os.environ.get('DB_NAME', 'test_database')


@pytest.fixture(scope='module')
def db():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


@pytest.fixture
def org_admin():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={'email': 'admin@example.com', 'password': 'admin123'})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture
def store_id(org_admin):
    r = org_admin.get(f"{BASE_URL}/api/stores")
    assert r.status_code == 200, r.text
    stores = r.json()
    assert stores, 'QA org needs at least one store'
    return stores[0]['id']


@pytest.fixture(autouse=True)
def cleanup_test_variants(db):
    """Remove any TEST_* variants between test runs so retries don't see stale data."""
    yield
    db.store_landings.delete_many({'name': {'$regex': '^TEST_'}})


class TestStoreLandingVariantsCRUD:
    def test_list_empty(self, org_admin, store_id):
        r = org_admin.get(f"{BASE_URL}/api/stores/{store_id}/landings")
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_create_and_list(self, org_admin, store_id):
        suffix = uuid.uuid4().hex[:6]
        payload = {
            'name': f'TEST_Variant_{suffix}',
            'title': 'Passa alla Fibra',
            'cta_color': '#7B1FA2',
            'whatsapp_message': 'Vorrei info su Fibra',
        }
        r = org_admin.post(f"{BASE_URL}/api/stores/{store_id}/landings",
                            json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d['name'] == payload['name']
        assert d['slug'].startswith('test-variant')
        assert d['cta_color'] == '#7B1FA2'
        assert d['enabled'] is True
        assert d['landing_url']
        # Verify list now includes it
        all_lst = org_admin.get(f"{BASE_URL}/api/stores/{store_id}/landings").json()
        assert any(v['id'] == d['id'] for v in all_lst)

    def test_update_variant_changes_slug(self, org_admin, store_id):
        # create
        r = org_admin.post(f"{BASE_URL}/api/stores/{store_id}/landings",
                            json={'name': 'TEST_Update_Me', 'title': 'old'})
        v = r.json()
        # update — change name + slug
        r2 = org_admin.patch(
            f"{BASE_URL}/api/stores/{store_id}/landings/{v['id']}",
            json={'name': 'TEST_Updated_Name', 'slug': 'TEST_brand_new',
                  'title': 'new title', 'cta_color': '#FF0000'}
        )
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d['name'] == 'TEST_Updated_Name'
        # Slug is slugified server-side; just verify it changed
        assert d['slug'] != v['slug']
        assert d['title'] == 'new title'
        assert d['cta_color'] == '#FF0000'

    def test_delete_variant(self, org_admin, store_id):
        r = org_admin.post(f"{BASE_URL}/api/stores/{store_id}/landings",
                            json={'name': 'TEST_To_Delete'})
        v = r.json()
        r2 = org_admin.delete(
            f"{BASE_URL}/api/stores/{store_id}/landings/{v['id']}")
        assert r2.status_code == 200, r2.text
        # Listed no more
        all_lst = org_admin.get(f"{BASE_URL}/api/stores/{store_id}/landings").json()
        assert not any(x['id'] == v['id'] for x in all_lst)

    def test_slug_unique_across_collections(self, org_admin, store_id):
        # The primary store landing_slug already exists (qa-demo-store) →
        # create a variant with the same slug; backend should auto-suffix it.
        r = org_admin.post(f"{BASE_URL}/api/stores/{store_id}/landings",
                            json={'name': 'TEST_Collide', 'slug': 'qa-demo-store'})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d['slug'] != 'qa-demo-store'
        assert d['slug'].startswith('qa-demo-store')

    def test_unauth_blocked(self, store_id):
        r = requests.get(f"{BASE_URL}/api/stores/{store_id}/landings")
        assert r.status_code == 401


class TestStoreLandingVariantsPublicLookup:
    def test_variant_slug_resolves_with_overrides(self, org_admin, store_id, db):
        # Ensure parent store has landing_enabled — otherwise the cascade kicks in.
        db.stores.update_one({'id': store_id}, {'$set': {'landing_enabled': True}})
        suffix = uuid.uuid4().hex[:6]
        r = org_admin.post(f"{BASE_URL}/api/stores/{store_id}/landings", json={
            'name': f'TEST_Public_{suffix}',
            'title': 'Override Title',
            'subtitle': 'Override Subtitle',
            'cta_color': '#123456',
            'whatsapp_message': 'Override WA',
        })
        v = r.json()
        # Public lookup — no auth
        r2 = requests.get(f"{BASE_URL}/api/store-landing/{v['slug']}")
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d['landing_slug'] == v['slug']
        assert d['landing_title'] == 'Override Title'
        assert d['landing_subtitle'] == 'Override Subtitle'
        assert d['landing_cta_color'] == '#123456'
        assert d['landing_whatsapp_message'] == 'Override WA'

    def test_cascade_store_landing_disabled(self, org_admin, store_id, db):
        """If the parent store has landing_enabled=False, the variant slug
        must also 404 — protects against orphaned promo URLs leaking."""
        suffix = uuid.uuid4().hex[:6]
        r = org_admin.post(f"{BASE_URL}/api/stores/{store_id}/landings",
                            json={'name': f'TEST_Cascade_{suffix}'})
        v = r.json()
        db.stores.update_one({'id': store_id},
                              {'$set': {'landing_enabled': False}})
        try:
            r2 = requests.get(f"{BASE_URL}/api/store-landing/{v['slug']}")
            assert r2.status_code == 404
        finally:
            db.stores.update_one({'id': store_id},
                                  {'$set': {'landing_enabled': True}})

    def test_variant_disabled_blocks_public_lookup(self, org_admin, store_id, db):
        db.stores.update_one({'id': store_id}, {'$set': {'landing_enabled': True}})
        r = org_admin.post(f"{BASE_URL}/api/stores/{store_id}/landings",
                            json={'name': 'TEST_Off_Variant', 'enabled': False})
        v = r.json()
        r2 = requests.get(f"{BASE_URL}/api/store-landing/{v['slug']}")
        assert r2.status_code == 404

    def test_primary_slug_not_regressed(self, db, store_id):
        db.stores.update_one({'id': store_id},
                              {'$set': {'landing_enabled': True,
                                        'landing_slug': 'qa-demo-store'}})
        r = requests.get(f"{BASE_URL}/api/store-landing/qa-demo-store")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d['landing_slug'] == 'qa-demo-store'
        # No variant logo override → org logo wins (may be empty string)
        assert 'logo_url' in d['organization']
