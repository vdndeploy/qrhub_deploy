"""Test media delete endpoint fix (CLOUDINARY_ENABLED NameError fix).

Validates:
- DELETE /api/media/{public_id} works (no NameError, returns 200)
- DELETE on non-existent public_id returns 404
- DELETE on in-use media returns 409
- Bulk delete POST /api/files/bulk-delete works (regression for line 216 fix)
- DELETE /api/files/{public_id} works (regression for line 169 fix)
"""
import os
import io
import time
import pytest
import requests
from urllib.parse import quote

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://qr-deploy-1.preview.emergentagent.com').rstrip('/')
ADMIN_EMAIL = 'admin@example.com'
ADMIN_PASSWORD = 'admin123'


@pytest.fixture(scope='module')
def admin_session():
    s = requests.Session()
    r = s.post(f'{BASE_URL}/api/auth/login',
               json={'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD})
    assert r.status_code == 200, f'Login failed: {r.status_code} {r.text}'
    return s


def _upload_test_image(session, folder='uploads'):
    """Upload a tiny PNG to /api/upload and return its public_id, url, in_use, kind."""
    # 1x1 transparent PNG
    png_bytes = (
        b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01'
        b'\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff'
        b'\xff?\x00\x05\xfe\x02\xfe\xdc\xccY\xe7\x00\x00\x00\x00IEND\xaeB`\x82'
    )
    files = {'file': (f'test_{int(time.time()*1000)}.png', io.BytesIO(png_bytes), 'image/png')}
    data = {'folder': folder}
    r = session.post(f'{BASE_URL}/api/upload', files=files, data=data)
    assert r.status_code == 200, f'Upload failed: {r.status_code} {r.text}'
    return r.json()


# ── Media: successful delete (the actual bug fix) ───────────────────────────
class TestMediaDeleteSuccess:
    def test_delete_uploaded_media_returns_200(self, admin_session):
        up = _upload_test_image(admin_session, folder='uploads')
        pid = up.get('public_id')
        assert pid, f'No public_id in upload response: {up}'

        encoded = quote(pid, safe='')
        r = admin_session.delete(f'{BASE_URL}/api/media/{encoded}')
        assert r.status_code == 200, f'DELETE /api/media failed: {r.status_code} {r.text}'
        body = r.json()
        assert body.get('message') == 'File eliminato'
        assert body.get('public_id') == pid

        # Verify it's gone from listing
        listing = admin_session.get(f'{BASE_URL}/api/media?limit=200').json()
        pids = [i.get('public_id') for i in listing.get('items', [])]
        assert pid not in pids, 'Deleted media still appears in /api/media listing'


# ── Media: 404 on unknown public_id ─────────────────────────────────────────
class TestMediaDeleteNotFound:
    def test_delete_unknown_pid_returns_404(self, admin_session):
        fake = quote('org_unknown/uploads/does_not_exist_xyz_999', safe='')
        r = admin_session.delete(f'{BASE_URL}/api/media/{fake}')
        assert r.status_code == 404, f'Expected 404, got {r.status_code} {r.text}'


# ── Media: 409 when media is in-use (vendor profile image or post media) ────
class TestMediaDeleteInUseGuard:
    def test_delete_in_use_returns_409(self, admin_session):
        """Mark vendor.profile_image_url = uploaded url via direct DB write, then
        attempt delete — must return 409 from _compute_in_use_sets guard."""
        try:
            import asyncio
            from motor.motor_asyncio import AsyncIOMotorClient
            from dotenv import load_dotenv
            load_dotenv('/app/backend/.env')
        except ImportError as e:
            pytest.skip(f'motor/dotenv not available: {e}')

        mongo_url = os.environ.get('MONGO_URL')
        db_name = os.environ.get('DB_NAME')
        if not mongo_url or not db_name:
            pytest.skip(f'MONGO_URL/DB_NAME not set: url={bool(mongo_url)} db={bool(db_name)}')

        up = _upload_test_image(admin_session, folder='uploads')
        pid = up['public_id']
        url = up['url']

        async def _seed_and_cleanup(action='seed'):
            client = AsyncIOMotorClient(mongo_url)
            db = client[db_name]
            try:
                v = await db.vendors.find_one({}, {'_id': 0, 'id': 1, 'profile_image_url': 1})
                if not v:
                    return None, None
                vid = v.get('id')
                if action == 'seed':
                    orig = v.get('profile_image_url', '')
                    await db.vendors.update_one({'id': vid},
                                                {'$set': {'profile_image_url': url}})
                    return vid, orig
                if action == 'restore':
                    return vid, None
            finally:
                client.close()

        vid, orig = asyncio.get_event_loop().run_until_complete(_seed_and_cleanup('seed'))
        if not vid:
            pytest.skip('No vendor available in DB to seed in-use ref')

        encoded = quote(pid, safe='')
        try:
            r = admin_session.delete(f'{BASE_URL}/api/media/{encoded}')
            assert r.status_code == 409, (
                f'Expected 409 for in-use media, got {r.status_code} {r.text}'
            )
            assert 'in uso' in r.text.lower()
        finally:
            async def _restore():
                client = AsyncIOMotorClient(mongo_url)
                db = client[db_name]
                try:
                    await db.vendors.update_one({'id': vid},
                                                {'$set': {'profile_image_url': orig or ''}})
                finally:
                    client.close()
            try:
                asyncio.get_event_loop().run_until_complete(_restore())
            except Exception:
                pass
            try:
                admin_session.delete(f'{BASE_URL}/api/media/{encoded}')
            except Exception:
                pass


# ── Regression: legacy DELETE /api/files/{public_id} ────────────────────────
class TestLegacyFilesDelete:
    def test_legacy_delete_files_endpoint(self, admin_session):
        up = _upload_test_image(admin_session, folder='uploads')
        pid = up.get('public_id')
        encoded = quote(pid, safe='')
        r = admin_session.delete(f'{BASE_URL}/api/files/{encoded}')
        assert r.status_code == 200, f'DELETE /api/files failed: {r.status_code} {r.text}'
        body = r.json()
        assert body.get('message') == 'File eliminato'


# ── Regression: POST /api/files/bulk-delete (line 216 fix) ──────────────────
class TestBulkDelete:
    def test_bulk_delete_multiple_files(self, admin_session):
        up1 = _upload_test_image(admin_session, folder='uploads')
        up2 = _upload_test_image(admin_session, folder='uploads')
        payload = {'public_ids': [up1['public_id'], up2['public_id']]}
        r = admin_session.post(f'{BASE_URL}/api/files/bulk-delete', json=payload)
        assert r.status_code == 200, f'Bulk delete failed: {r.status_code} {r.text}'
        body = r.json()
        assert body.get('deleted') == 2, f'Expected 2 deleted, got {body}'
        assert body.get('failed') in ([], None) or len(body.get('failed', [])) == 0


# ── Tenant isolation: not raised here directly (no second tenant available) ─
class TestTenantIsolation:
    def test_other_tenant_pid_returns_404(self, admin_session):
        # A public_id with a different org prefix should be 404 for our admin
        fake = quote('org_other_tenant_xyz/uploads/some_file', safe='')
        r = admin_session.delete(f'{BASE_URL}/api/media/{fake}')
        assert r.status_code == 404, f'Expected 404 cross-tenant, got {r.status_code}'
