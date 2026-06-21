"""Backend tests for the Store Landing lead-gen feature (Jan 2026).

Covers:
- PUT /api/stores/{id} with landing_* fields (slug auto-gen)
- GET /api/stores returns landing_* fields
- GET /api/store-landing/{slug} (public, no auth)
- GET /api/store-landing/<missing> -> 404 with Italian message
- GET /og/s/{slug} -> SEO HTML with OG/Twitter/JSON-LD
- POST /api/analytics accepts the 7 store_landing_* events with store_id
- GET /api/analytics/store-landings?period=7d -> funnel structure
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://qr-deploy-1.preview.emergentagent.com').rstrip('/')
# /og/s/ is a non-/api root route. The k8s preview ingress only forwards /api/*
# to the backend, so we must hit the real Fly deployment for OG preview tests.
OG_BASE_URL = os.environ.get('FLY_BACKEND_URL', 'https://qrhub.fly.dev').rstrip('/')

SUPER_ADMIN_EMAIL = 'superadmin@qrhub.it'
SUPER_ADMIN_PASSWORD = 'ErnDan24.10'
LANDING_SLUG = 'windtre-castelnuovo-del-garda'


# ── shared fixtures ────────────────────────────────────────────────────────
@pytest.fixture(scope='module')
def api():
    s = requests.Session()
    s.headers.update({'Content-Type': 'application/json'})
    return s


@pytest.fixture(scope='module')
def admin(api):
    """Login (cookie-based) and return the authenticated session."""
    r = api.post(
        f'{BASE_URL}/api/auth/login',
        json={'email': SUPER_ADMIN_EMAIL, 'password': SUPER_ADMIN_PASSWORD},
    )
    assert r.status_code == 200, f'login failed: {r.status_code} {r.text}'
    # Cookie is set on the session automatically by requests
    assert 'access_token' in api.cookies, f'no cookie set: {dict(api.cookies)}'
    return api


@pytest.fixture(scope='module')
def landing_store():
    """The seeded test store with landing already enabled (public endpoint)."""
    r = requests.get(f'{BASE_URL}/api/store-landing/{LANDING_SLUG}')
    if r.status_code != 200:
        pytest.skip(f'Seed landing not found: {r.status_code} {r.text}')
    return r.json()


# ── 1. PUT /api/stores/{id} with landing_* fields ──────────────────────────
class TestStoresLandingFields:
    def test_get_stores_includes_landing_fields(self, admin):
        r = admin.get(f'{BASE_URL}/api/stores')
        assert r.status_code == 200, r.text
        stores = r.json()
        assert isinstance(stores, list) and len(stores) > 0, 'no stores'
        s0 = stores[0]
        # All 11 landing_* fields must be present (after the setdefault on GET)
        for k in ('landing_enabled', 'landing_slug', 'landing_title',
                  'landing_subtitle', 'landing_hero_image', 'landing_cta_mode',
                  'landing_whatsapp_message', 'landing_html_widget',
                  'landing_show_reviews', 'landing_show_hours',
                  'landing_show_map'):
            assert k in s0, f'missing field {k} on store {s0.get("id")}'

    def test_put_store_enable_landing_autogenerates_slug(self, admin):
        # find a store WITHOUT landing_enabled to avoid clobbering seed
        r = admin.get(f'{BASE_URL}/api/stores')
        stores = r.json()
        candidate = next(
            (s for s in stores
             if not s.get('landing_enabled')
             and s.get('id')
             and s.get('landing_slug', '') != LANDING_SLUG),
            None
        )
        if not candidate:
            pytest.skip('no candidate store available for PUT test')
        sid = candidate['id']
        payload = {
            **{k: v for k, v in candidate.items() if k not in ('_id',)},
            'landing_enabled': True,
            'landing_title': 'TEST_Landing',
            'landing_subtitle': 'TEST subtitle',
            'landing_cta_mode': 'whatsapp',
        }
        r = admin.put(f'{BASE_URL}/api/stores/{sid}', json=payload)
        assert r.status_code in (200, 204), f'{r.status_code} {r.text}'
        # verify via GET
        r2 = admin.get(f'{BASE_URL}/api/stores')
        assert r2.status_code == 200
        updated = next((s for s in r2.json() if s['id'] == sid), None)
        assert updated is not None
        assert updated['landing_enabled'] is True
        assert updated['landing_title'] == 'TEST_Landing'
        # auto-generated slug must be a non-empty kebab-ish string
        assert updated['landing_slug'], 'slug not auto-generated'
        assert isinstance(updated['landing_slug'], str)
        assert ' ' not in updated['landing_slug']

        # Teardown — disable landing on the candidate to avoid side-effects
        payload2 = {**payload, 'landing_enabled': False, 'landing_title': ''}
        admin.put(f'{BASE_URL}/api/stores/{sid}', json=payload2)


# ── 2. GET /api/store-landing/{slug} (public) ──────────────────────────────
class TestPublicStoreLandingEndpoint:
    def test_public_landing_returns_200_with_fields(self):
        r = requests.get(f'{BASE_URL}/api/store-landing/{LANDING_SLUG}')
        assert r.status_code == 200, r.text
        d = r.json()
        # core landing fields
        for k in ('id', 'name', 'landing_title', 'landing_subtitle',
                  'landing_slug', 'landing_cta_mode', 'landing_show_reviews',
                  'landing_show_hours', 'landing_show_map', 'organization'):
            assert k in d, f'missing field {k}'
        # organization sub-object
        org = d['organization']
        assert isinstance(org, dict)
        for k in ('name', 'logo_url', 'primary_color'):
            assert k in org, f'organization missing {k}'
        # primary_color must be a non-empty color string (hex or #default)
        assert org['primary_color'] and isinstance(org['primary_color'], str)
        assert d['landing_slug'] == LANDING_SLUG

    def test_public_landing_404_for_missing_slug(self):
        r = requests.get(f'{BASE_URL}/api/store-landing/non-existent-slug-xyz')
        assert r.status_code == 404, r.text
        d = r.json()
        # Italian error message
        msg = d.get('detail') or d.get('message') or ''
        assert 'Landing non disponibile' in msg, f'expected Italian 404 msg, got: {d}'

    def test_public_landing_no_auth_required(self):
        """Should work even without Authorization header."""
        # Use a fresh session with NO Authorization
        r = requests.get(
            f'{BASE_URL}/api/store-landing/{LANDING_SLUG}',
            headers={'Accept': 'application/json'}
        )
        assert r.status_code == 200


# ── 3. GET /og/s/{slug} (SEO crawler endpoint) ─────────────────────────────
class TestOgPreviewEndpoint:
    def test_og_preview_returns_seo_html(self):
        r = requests.get(f'{OG_BASE_URL}/og/s/{LANDING_SLUG}')
        assert r.status_code == 200, r.text
        html = r.text
        assert '<title>' in html
        assert 'og:title' in html
        assert 'og:description' in html
        assert 'twitter:card' in html
        assert 'application/ld+json' in html
        assert 'LocalBusiness' in html
        # meta refresh redirect to SPA
        assert 'http-equiv="refresh"' in html
        # JSON-LD context
        assert 'schema.org' in html

    def test_og_preview_missing_slug_returns_200_soft(self):
        r = requests.get(f'{OG_BASE_URL}/og/s/totally-fake-slug-zzz')
        # Soft 200 by design (so crawlers don't poison cache)
        assert r.status_code == 200


# ── 4. POST /api/analytics accepts store_landing_* events ──────────────────
STORE_LANDING_EVENTS = [
    'store_landing_view',
    'store_landing_whatsapp_click',
    'store_landing_review_click',
    'store_landing_maps_click',
    'store_landing_social_click',
    'store_landing_form_view',
    'store_landing_bounce',
]


class TestAnalyticsStoreLandingEvents:
    @pytest.fixture(scope='class')
    def store_id(self, landing_store):
        sid = landing_store.get('id')
        assert sid, 'seed landing has no id'
        return sid

    @pytest.mark.parametrize('event_type', STORE_LANDING_EVENTS)
    def test_post_store_landing_event(self, event_type, store_id):
        payload = {
            'event_type': event_type,
            'store_id': store_id,
            'vendor_id': '',
        }
        r = requests.post(f'{BASE_URL}/api/analytics', json=payload)
        # Endpoint is permissive — should always return 200
        assert r.status_code == 200, f'{event_type}: {r.status_code} {r.text}'
        d = r.json()
        # Must NOT be an "ignored" response
        assert 'ignored' not in (d.get('message', '').lower()), \
            f'{event_type} was ignored: {d}'


# ── 5. GET /api/analytics/store-landings (admin) ──────────────────────────
class TestStoreLandingsAnalyticsEndpoint:
    def test_returns_funnel_structure(self, admin):
        # Give the previous test's POSTs a moment to land
        time.sleep(1.0)
        r = admin.get(f'{BASE_URL}/api/analytics/store-landings?period=7d')
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get('period') == '7d'
        assert 'totals' in d
        assert 'by_store' in d
        # totals structure
        t = d['totals']
        for k in ('views', 'cta_clicks', 'review_clicks', 'maps_clicks',
                  'social_clicks', 'form_views', 'bounces',
                  'conversion_rate', 'bounce_rate'):
            assert k in t, f'totals missing {k}'
        assert isinstance(d['by_store'], list)
        # by_store entries (if any) have the expected shape
        if d['by_store']:
            row = d['by_store'][0]
            for k in ('id', 'name', 'slug', 'enabled', 'cta_mode',
                      'views', 'cta_clicks', 'conversion_rate', 'bounce_rate'):
                assert k in row, f'by_store row missing {k}'

    def test_requires_auth(self):
        r = requests.get(f'{BASE_URL}/api/analytics/store-landings?period=7d')
        assert r.status_code in (401, 403), r.text
