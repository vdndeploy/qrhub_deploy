"""Backend tests for iteration 3: Cloudinary uploads, file manager, multi-post carousel, public posts inclusion."""
import io
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://vendor-qr-hub.preview.emergentagent.com').rstrip('/')
ADMIN_EMAIL = 'admin@windtre.com'
ADMIN_PASSWORD = 'admin123'

# 1x1 transparent PNG
PNG_BYTES = (
    b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01'
    b'\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xcf'
    b'\xc0\x00\x00\x00\x03\x00\x01\x9b\x9d\xa1\xa6\x00\x00\x00\x00IEND\xaeB`\x82'
)


@pytest.fixture(scope='module')
def admin_session():
    s = requests.Session()
    r = s.post(f'{BASE_URL}/api/auth/login',
               json={'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD})
    assert r.status_code == 200, f'Login failed: {r.text}'
    assert 'access_token' in s.cookies
    return s


@pytest.fixture(scope='module')
def test_store(admin_session):
    """Create a TEST_ store and clean up after."""
    payload = {
        'name': 'TEST_Store_Iter3',
        'whatsapp': '+391234567890', 'whatsapp_message': '', 'instagram': '',
        'facebook': '', 'tiktok': '', 'google_review': '', 'google_maps_url': '',
        'post_title': '', 'post_text': '', 'post_media_url': '',
        'post_cta_text': '', 'post_whatsapp_message': ''
    }
    r = admin_session.post(f'{BASE_URL}/api/stores', json=payload)
    assert r.status_code == 200, r.text
    store_id = r.json()['id']
    yield store_id
    # cleanup vendors then store
    vs = admin_session.get(f'{BASE_URL}/api/vendors').json()
    for v in vs:
        if v.get('store_id') == store_id:
            admin_session.delete(f'{BASE_URL}/api/vendors/{v["id"]}')
    admin_session.delete(f'{BASE_URL}/api/stores/{store_id}')


@pytest.fixture(scope='module')
def test_vendor(admin_session, test_store):
    r = admin_session.post(f'{BASE_URL}/api/vendors', json={
        'name': 'TEST_Vendor_Iter3', 'bio': 'b', 'store_id': test_store
    })
    assert r.status_code == 200, r.text
    return r.json()['id']


# ──────────────────────────────────────────────────────────────────
# Upload endpoint - Cloudinary integration
# ──────────────────────────────────────────────────────────────────
class TestUploadCloudinary:
    public_id = None

    def test_upload_requires_auth(self):
        r = requests.post(f'{BASE_URL}/api/upload',
                          files={'file': ('t.png', io.BytesIO(PNG_BYTES), 'image/png')})
        assert r.status_code == 401

    def test_upload_returns_cloudinary_url(self, admin_session):
        # Don't send Content-Type=application/json on multipart
        s = requests.Session()
        s.cookies = admin_session.cookies
        # NOTE: backend reads `folder` from query (Query param), not form. Send via params.
        r = s.post(f'{BASE_URL}/api/upload',
                   files={'file': ('TEST_pixel.png', io.BytesIO(PNG_BYTES), 'image/png')},
                   params={'folder': 'posts'})
        assert r.status_code == 200, r.text
        body = r.json()
        assert 'url' in body and 'public_id' in body
        assert 'res.cloudinary.com/doqp3gr5e' in body['url']
        assert body['resource_type'] == 'image'
        assert body['width'] == 1 and body['height'] == 1
        TestUploadCloudinary.public_id = body['public_id']

    def test_upload_creates_db_files_record(self, admin_session):
        assert TestUploadCloudinary.public_id
        r = admin_session.get(f'{BASE_URL}/api/files', params={'folder': 'posts', 'limit': 100})
        assert r.status_code == 200
        body = r.json()
        ids = [f['public_id'] for f in body['files']]
        assert TestUploadCloudinary.public_id in ids
        rec = next(f for f in body['files'] if f['public_id'] == TestUploadCloudinary.public_id)
        assert rec['folder'] == 'posts'
        assert rec['original_filename'] == 'TEST_pixel.png'
        assert rec['bytes'] > 0

    def test_upload_invalid_type_rejected(self, admin_session):
        s = requests.Session()
        s.cookies = admin_session.cookies
        r = s.post(f'{BASE_URL}/api/upload',
                   files={'file': ('t.txt', io.BytesIO(b'hello'), 'text/plain')})
        assert r.status_code == 400


# ──────────────────────────────────────────────────────────────────
# Files listing & filters
# ──────────────────────────────────────────────────────────────────
class TestFilesListing:
    def test_files_requires_auth(self):
        r = requests.get(f'{BASE_URL}/api/files')
        assert r.status_code == 401

    def test_files_pagination_shape(self, admin_session):
        r = admin_session.get(f'{BASE_URL}/api/files', params={'skip': 0, 'limit': 24})
        assert r.status_code == 200
        body = r.json()
        for k in ['files', 'total', 'skip', 'limit']:
            assert k in body
        assert body['skip'] == 0 and body['limit'] == 24
        assert isinstance(body['files'], list)
        # in_use flag is present
        if body['files']:
            assert 'in_use' in body['files'][0]

    def test_files_folder_filter(self, admin_session):
        r = admin_session.get(f'{BASE_URL}/api/files', params={'folder': 'posts', 'limit': 100})
        assert r.status_code == 200
        for f in r.json()['files']:
            assert f['folder'] == 'posts'

    def test_orphans_only(self, admin_session):
        # Orphan = not used by any post. Our upload above is orphan (not attached to a post yet).
        r = admin_session.get(f'{BASE_URL}/api/files', params={'orphans_only': True, 'limit': 100})
        assert r.status_code == 200
        for f in r.json()['files']:
            assert f['in_use'] is False


# ──────────────────────────────────────────────────────────────────
# Posts CRUD
# ──────────────────────────────────────────────────────────────────
class TestPostsCRUD:
    p1 = None
    p2 = None
    p3 = None

    def test_list_posts_empty(self, admin_session, test_store):
        r = admin_session.get(f'{BASE_URL}/api/stores/{test_store}/posts')
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_post_auto_position(self, admin_session, test_store):
        # Send position=None explicitly to trigger auto-positioning (default in PostCreate is 0
        # which suppresses auto-positioning - tracked as a backend bug).
        r1 = admin_session.post(f'{BASE_URL}/api/stores/{test_store}/posts', json={
            'title': 'TEST Post 1', 'text': 'hello', 'cta_text': 'Scopri',
            'media_url': 'https://res.cloudinary.com/doqp3gr5e/image/upload/v1/posts/dummy.png',
            'media_public_id': 'posts/dummy_p1', 'media_resource_type': 'image',
            'aspect_ratio': 1.0, 'position': None
        })
        assert r1.status_code == 200, r1.text
        b1 = r1.json()
        assert b1['title'] == 'TEST Post 1'
        assert b1['position'] == 0
        TestPostsCRUD.p1 = b1['id']

        r2 = admin_session.post(f'{BASE_URL}/api/stores/{test_store}/posts',
                                json={'title': 'TEST Post 2', 'position': None})
        assert r2.status_code == 200
        TestPostsCRUD.p2 = r2.json()['id']
        assert r2.json()['position'] == 1

        r3 = admin_session.post(f'{BASE_URL}/api/stores/{test_store}/posts',
                                json={'title': 'TEST Post 3', 'position': None})
        assert r3.status_code == 200
        TestPostsCRUD.p3 = r3.json()['id']
        assert r3.json()['position'] == 2

    def test_list_posts_ordered(self, admin_session, test_store):
        r = admin_session.get(f'{BASE_URL}/api/stores/{test_store}/posts')
        assert r.status_code == 200
        posts = r.json()
        assert len(posts) >= 3
        positions = [p['position'] for p in posts]
        assert positions == sorted(positions)

    def test_update_post(self, admin_session):
        r = admin_session.put(f'{BASE_URL}/api/posts/{TestPostsCRUD.p1}', json={
            'title': 'TEST Post 1 Updated', 'text': 'updated', 'cta_text': '',
            'media_url': '', 'media_public_id': '', 'media_resource_type': '',
            'aspect_ratio': 1.5
        })
        assert r.status_code == 200
        assert r.json()['title'] == 'TEST Post 1 Updated'
        assert r.json()['aspect_ratio'] == 1.5

    def test_reorder_posts(self, admin_session, test_store):
        new_order = [TestPostsCRUD.p3, TestPostsCRUD.p1, TestPostsCRUD.p2]
        r = admin_session.post(f'{BASE_URL}/api/stores/{test_store}/posts/reorder',
                               json={'post_ids': new_order})
        assert r.status_code == 200
        # verify
        rr = admin_session.get(f'{BASE_URL}/api/stores/{test_store}/posts').json()
        ordered_ids = [p['id'] for p in rr]
        assert ordered_ids[:3] == new_order

    def test_delete_post(self, admin_session, test_store):
        r = admin_session.delete(f'{BASE_URL}/api/posts/{TestPostsCRUD.p2}')
        assert r.status_code == 200
        rr = admin_session.get(f'{BASE_URL}/api/stores/{test_store}/posts').json()
        assert TestPostsCRUD.p2 not in [p['id'] for p in rr]

    def test_delete_post_404(self, admin_session):
        r = admin_session.delete(f'{BASE_URL}/api/posts/nonexistent_xyz')
        assert r.status_code == 404


# ──────────────────────────────────────────────────────────────────
# Public vendor includes posts array
# ──────────────────────────────────────────────────────────────────
class TestPublicVendorPosts:
    def test_vendor_public_returns_posts(self, test_vendor):
        r = requests.get(f'{BASE_URL}/api/vendors/{test_vendor}')
        assert r.status_code == 200
        body = r.json()
        assert 'posts' in body
        assert isinstance(body['posts'], list)
        # Posts created in TestPostsCRUD should be visible (p1 + p3 remain after delete of p2)
        assert len(body['posts']) >= 2
        # sorted by position
        positions = [p['position'] for p in body['posts']]
        assert positions == sorted(positions)


# ──────────────────────────────────────────────────────────────────
# Cleanup uploaded Cloudinary file + bulk-delete endpoint shape
# ──────────────────────────────────────────────────────────────────
class TestFilesDelete:
    def test_bulk_delete_shape(self, admin_session):
        r = admin_session.post(f'{BASE_URL}/api/files/bulk-delete',
                               json={'public_ids': ['nonexistent_pid_xyz_test']})
        assert r.status_code == 200
        body = r.json()
        assert 'deleted' in body and 'failed' in body
        assert body['deleted'] == 0
        assert any(f['public_id'] == 'nonexistent_pid_xyz_test' for f in body['failed'])

    def test_delete_uploaded_file(self, admin_session):
        pid = TestUploadCloudinary.public_id
        if not pid:
            pytest.skip('upload skipped')
        r = admin_session.delete(f'{BASE_URL}/api/files/{pid}')
        assert r.status_code == 200
        # Verify gone
        rr = admin_session.get(f'{BASE_URL}/api/files', params={'folder': 'posts', 'limit': 100})
        ids = [f['public_id'] for f in rr.json()['files']]
        assert pid not in ids


# ──────────────────────────────────────────────────────────────────
# Cascade delete posts when store deleted
# ──────────────────────────────────────────────────────────────────
class TestStoreCascade:
    def test_cascade_delete_posts(self, admin_session):
        # create temporary store
        r = admin_session.post(f'{BASE_URL}/api/stores', json={
            'name': 'TEST_Cascade_Store',
            'whatsapp': '', 'whatsapp_message': '', 'instagram': '',
            'facebook': '', 'tiktok': '', 'google_review': '', 'google_maps_url': '',
            'post_title': '', 'post_text': '', 'post_media_url': '',
            'post_cta_text': '', 'post_whatsapp_message': ''
        })
        assert r.status_code == 200
        sid = r.json()['id']
        # Add a post
        admin_session.post(f'{BASE_URL}/api/stores/{sid}/posts', json={'title': 'TEST cascade post'})
        # No vendors linked, so we can delete the store
        d = admin_session.delete(f'{BASE_URL}/api/stores/{sid}')
        assert d.status_code == 200
        # Posts should be gone
        rr = admin_session.get(f'{BASE_URL}/api/stores/{sid}/posts')
        assert rr.status_code == 200
        assert rr.json() == []
