from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Header, UploadFile, File, Form
from fastapi.responses import StreamingResponse, Response as FastAPIResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import html as html_lib
import os
import re
import logging
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict
from datetime import datetime, timezone, timedelta
from bson import ObjectId
import jwt
import bcrypt
import qrcode
from io import BytesIO
import aiofiles
import uuid
import httpx
import ipaddress
from user_agents import parse as parse_ua
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.enums import TA_CENTER, TA_LEFT
import cloudinary
import cloudinary.uploader
import cloudinary.api

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Create uploads directory
UPLOAD_DIR = ROOT_DIR / 'uploads'
UPLOAD_DIR.mkdir(exist_ok=True)

# Logging — initialised early so any module importing from `server` can use logger.
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

# Serve uploaded files
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-change-this')
JWT_ALGORITHM = 'HS256'
# GDPR M4: enforce minimum entropy of the JWT secret. HS256 best practice ≥ 32 bytes.
if len(JWT_SECRET) < 32:
    if JWT_SECRET == 'your-secret-key-change-this' or len(JWT_SECRET) < 16:
        # In production this MUST fail loud. We don't raise here to keep dev ergonomic,
        # but we log a critical warning that's hard to miss.
        logging.getLogger('server').warning(
            'SECURITY: JWT_SECRET is using a default/short value (%d bytes). '
            'Rotate from Super Admin → Deploy → Secrets to a value ≥ 32 bytes ASAP.',
            len(JWT_SECRET)
        )
# Legacy ADMIN_EMAIL / ADMIN_PASSWORD seed removed (Feb 2026): org-admins are
# now created exclusively from the in-app "Modifica utenti" panel. The platform
# only bootstraps the SUPERADMIN account on startup.

# Cookie settings — set to "none"/True in production (cross-site Vercel <-> Fly.io)
COOKIE_SAMESITE = os.environ.get('COOKIE_SAMESITE', 'lax').lower()
COOKIE_SECURE = os.environ.get('COOKIE_SECURE', 'false').lower() == 'true'

# Cloudinary config — supports BOTH formats:
#   A) Single env: CLOUDINARY_URL=cloudinary://<key>:<secret>@<cloud_name>   (preferred, official)
#   B) Three envs: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
# Falls back to local storage if neither is configured.
CLOUDINARY_URL = os.environ.get('CLOUDINARY_URL', '').strip()
CLOUDINARY_CLOUD_NAME = os.environ.get('CLOUDINARY_CLOUD_NAME', '')
CLOUDINARY_API_KEY = os.environ.get('CLOUDINARY_API_KEY', '')
CLOUDINARY_API_SECRET = os.environ.get('CLOUDINARY_API_SECRET', '')

if CLOUDINARY_URL.startswith('cloudinary://'):
    # Parse manually because cloudinary SDK auto-detects only on import, before load_dotenv
    try:
        from urllib.parse import urlparse
        _u = urlparse(CLOUDINARY_URL)
        CLOUDINARY_API_KEY = _u.username or CLOUDINARY_API_KEY
        CLOUDINARY_API_SECRET = _u.password or CLOUDINARY_API_SECRET
        CLOUDINARY_CLOUD_NAME = _u.hostname or CLOUDINARY_CLOUD_NAME
    except Exception:
        pass
    CLOUDINARY_ENABLED = bool(CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET)
    if CLOUDINARY_ENABLED:
        cloudinary.config(
            cloud_name=CLOUDINARY_CLOUD_NAME,
            api_key=CLOUDINARY_API_KEY,
            api_secret=CLOUDINARY_API_SECRET,
            secure=True
        )
elif CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET:
    cloudinary.config(
        cloud_name=CLOUDINARY_CLOUD_NAME,
        api_key=CLOUDINARY_API_KEY,
        api_secret=CLOUDINARY_API_SECRET,
        secure=True
    )
    CLOUDINARY_ENABLED = True
else:
    CLOUDINARY_ENABLED = False

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def _redact_email(email: str) -> str:
    """GDPR M8 — Reduce email PII surface in logs while keeping debuggability.
    Returns e.g. 'a***@example.com' for 'admin@example.com'."""
    if not email or '@' not in email:
        return '<email>'
    local, _, domain = email.partition('@')
    if len(local) <= 2:
        masked = local[0] + '***'
    else:
        masked = local[0] + '***' + local[-1]
    return f'{masked}@{domain}'


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))


# ──────────────────────────────────────────────────────────────────
# Brute-force / rate limiting on login endpoints (GDPR art. 32)
# ──────────────────────────────────────────────────────────────────
LOGIN_MAX_ATTEMPTS = int(os.environ.get('LOGIN_MAX_ATTEMPTS', '5'))
LOGIN_WINDOW_SEC = int(os.environ.get('LOGIN_WINDOW_SEC', '900'))  # 15 minutes


def _client_ip(request: Request) -> str:
    fwd = request.headers.get('x-forwarded-for', '')
    if fwd:
        return fwd.split(',')[0].strip()
    return request.client.host if request.client else ''


async def _enforce_login_rate_limit(scope: str, email: str, request: Request):
    """Check that (scope, email|ip) has fewer than LOGIN_MAX_ATTEMPTS recent failures.
    scope = 'admin' | 'vendor'. Raises 429 if exceeded."""
    now = datetime.now(timezone.utc)
    window_start = (now - timedelta(seconds=LOGIN_WINDOW_SEC)).isoformat()
    ip = _client_ip(request)
    key = f"{scope}:{email.lower()}"
    failures = await db.login_attempts.count_documents({
        '$or': [{'key': key}, {'ip': ip, 'scope': scope}],
        'ts': {'$gte': window_start},
        'success': False,
    })
    if failures >= LOGIN_MAX_ATTEMPTS:
        retry_after = LOGIN_WINDOW_SEC
        raise HTTPException(
            status_code=429,
            detail=f'Troppi tentativi falliti. Riprova tra {retry_after // 60} minuti.',
            headers={'Retry-After': str(retry_after)},
        )


async def _record_login_attempt(scope: str, email: str, request: Request, success: bool):
    ip = _client_ip(request)
    now = datetime.now(timezone.utc)
    await db.login_attempts.insert_one({
        'scope': scope,
        'key': f"{scope}:{email.lower()}",
        'email': email.lower(),
        'ip': ip,
        'ts': now.isoformat(),
        'success': success,
    })
    # Opportunistic cleanup: keep collection bounded (only old failed records).
    cutoff = (now - timedelta(seconds=LOGIN_WINDOW_SEC * 4)).isoformat()
    await db.login_attempts.delete_many({'ts': {'$lt': cutoff}})

def create_access_token(user_id: str, email: str, token_version: int = 1) -> str:
    payload = {
        'sub': user_id,
        'email': email,
        'exp': datetime.now(timezone.utc) + timedelta(hours=24),
        'type': 'access',
        'tv': token_version,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def create_vendor_token(vendor_id: str, email: str, token_version: int = 1) -> str:
    payload = {
        'vendor_id': vendor_id,
        'email': email,
        'exp': datetime.now(timezone.utc) + timedelta(hours=24),
        'type': 'vendor_access',
        'tv': token_version,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get('access_token')
    if not token:
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail='Not authenticated')
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get('type') != 'access':
            raise HTTPException(status_code=401, detail='Invalid token type')
        user = await db.users.find_one({'_id': ObjectId(payload['sub'])})
        if not user:
            raise HTTPException(status_code=401, detail='User not found')
        # Session revoke: stored token_version must match the one in the JWT.
        # Pre-revoke tokens have no 'tv' claim → treated as version 1 (back-compat).
        token_tv = payload.get('tv', 1)
        user_tv = user.get('token_version', 1)
        if token_tv != user_tv:
            raise HTTPException(status_code=401, detail='Sessione invalidata, accedi di nuovo')
        user['_id'] = str(user['_id'])
        user.pop('password_hash', None)
        user.setdefault('role', 'org_admin')
        user.setdefault('organization_id', None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail='Token expired')
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail='Invalid token')


def _is_super_admin(user: dict) -> bool:
    return user.get('role') == 'super_admin'


def _tenant_filter(user: dict, extra: Optional[dict] = None) -> dict:
    """Return mongo filter dict scoping by user's organization. Empty for super admin."""
    base = dict(extra or {})
    if not _is_super_admin(user):
        base['organization_id'] = user.get('organization_id')
    return base


async def require_super_admin(user: dict = Depends(get_current_user)) -> dict:
    if not _is_super_admin(user):
        raise HTTPException(status_code=403, detail='Super admin required')
    return user

async def get_current_vendor(request: Request) -> dict:
    token = request.cookies.get('vendor_token')
    if not token:
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail='Not authenticated')
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get('type') != 'vendor_access':
            raise HTTPException(status_code=401, detail='Invalid token type')
        vendor = await db.vendors.find_one({'id': payload['vendor_id']}, {'_id': 0})
        if not vendor:
            raise HTTPException(status_code=401, detail='Vendor not found')
        # Session revoke: token_version match (default 1 for legacy tokens)
        token_tv = payload.get('tv', 1)
        vendor_tv = vendor.get('token_version', 1)
        if token_tv != vendor_tv:
            raise HTTPException(status_code=401, detail='Sessione invalidata, accedi di nuovo')
        vendor.pop('password_hash', None)
        return vendor
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail='Token expired')
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail='Invalid token')

async def get_current_user_or_vendor(request: Request) -> dict:
    """Auth dependency that accepts EITHER an admin/user `access_token` OR a vendor
    `vendor_token` cookie. Used by endpoints shared between dashboards (e.g. /api/upload).

    Returns a dict normalised to include:
      - `_principal`: 'user' | 'vendor'
      - `organization_id`: tenant scope (same field name in both)
      - `role`: original role for users; 'vendor' for vendors
      - other vendor fields are preserved (id, name, email, ...)
    """
    # Try user (admin) first — same flow as get_current_user
    user_token = request.cookies.get('access_token')
    if not user_token:
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            user_token = auth_header[7:]
    if user_token:
        try:
            payload = jwt.decode(user_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            if payload.get('type') == 'access':
                user = await db.users.find_one({'_id': ObjectId(payload['sub'])})
                if user and payload.get('tv', 1) == user.get('token_version', 1):
                    user['_id'] = str(user['_id'])
                    user.pop('password_hash', None)
                    user.setdefault('role', 'org_admin')
                    user.setdefault('organization_id', None)
                    user['_principal'] = 'user'
                    return user
        except jwt.InvalidTokenError:
            pass

    # Fall back to vendor token
    vtoken = request.cookies.get('vendor_token')
    if vtoken:
        try:
            payload = jwt.decode(vtoken, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            if payload.get('type') == 'vendor_access':
                vendor = await db.vendors.find_one({'id': payload['vendor_id']}, {'_id': 0})
                if vendor and payload.get('tv', 1) == vendor.get('token_version', 1):
                    vendor.pop('password_hash', None)
                    vendor['role'] = 'vendor'
                    vendor['_principal'] = 'vendor'
                    return vendor
        except jwt.InvalidTokenError:
            pass

    raise HTTPException(status_code=401, detail='Not authenticated')


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=200)

class VendorCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    bio: Optional[str] = Field('', max_length=2000)
    store_id: str = Field(..., max_length=64)
    slug: Optional[str] = Field('', max_length=64,
                                description='URL-friendly slug; falls back to the vendor id when empty')

class VendorUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    bio: Optional[str] = Field('', max_length=2000)
    store_id: str = Field(..., max_length=64)
    slug: Optional[str] = Field(None, max_length=64)


_SLUG_RE = re.compile(r'^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$')

def _normalize_vendor_slug(raw: str) -> str:
    """Sanitise a vendor slug. Returns '' if input is empty/invalid."""
    s = (raw or '').strip().lower()
    if not s:
        return ''
    # Replace any non a-z0-9- with hyphens, collapse repeats, trim hyphens
    s = re.sub(r'[^a-z0-9-]+', '-', s)
    s = re.sub(r'-+', '-', s).strip('-')
    if not s:
        return ''
    # Block any reserved single tokens that would collide with our routes
    if s in ('privacy', 'admin', 'api', 'login', 'logout', 'me'):
        return ''
    return s[:64]


async def _vendor_slug_taken(slug: str, except_vendor_id: str = '') -> bool:
    if not slug:
        return False
    q: dict = {'slug': slug}
    if except_vendor_id:
        q['id'] = {'$ne': except_vendor_id}
    return await db.vendors.find_one(q, {'_id': 0, 'id': 1}) is not None


async def _resolve_vendor_doc(vendor_key: str) -> Optional[dict]:
    """Resolve a vendor by either its long UUID id or its custom slug.
    Public landing endpoint uses this so /v/gizwindtre and /v/<uuid> both work.
    """
    if not vendor_key:
        return None
    # ObjectId-style ids are 24 hex chars; check id first to avoid stealth
    # collisions with slugs that look numeric.
    doc = await db.vendors.find_one({'id': vendor_key}, {'_id': 0})
    if doc:
        return doc
    doc = await db.vendors.find_one({'slug': vendor_key.lower()}, {'_id': 0})
    return doc


class VendorProfileUpdate(BaseModel):
    """Self-update from the vendor's own dashboard."""
    name: str = Field(..., min_length=1, max_length=200)
    bio: Optional[str] = Field('', max_length=2000)
    profile_image_url: Optional[str] = Field('', max_length=600)
    profile_image_enabled: Optional[bool] = False

class StoreHoursDay(BaseModel):
    """Opening hours for a single day, Google-Business style.
    `closed=True` means the shop is closed on this day (open/close are ignored).
    `open` and `close` are 24h "HH:MM" strings; `break_start`/`break_end` are
    optional and let us model a midday closure (e.g. Italian lunchtime)."""
    closed: bool = False
    open: Optional[str] = Field('', max_length=5)
    close: Optional[str] = Field('', max_length=5)
    break_start: Optional[str] = Field('', max_length=5)
    break_end: Optional[str] = Field('', max_length=5)


class StoreCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    whatsapp: Optional[str] = Field('', max_length=400)  # WA URL or wa.me link
    whatsapp_message: Optional[str] = Field('', max_length=1000)
    instagram: Optional[str] = Field('', max_length=400)
    facebook: Optional[str] = Field('', max_length=400)
    tiktok: Optional[str] = Field('', max_length=400)
    google_review: Optional[str] = Field('', max_length=400)
    google_maps_url: Optional[str] = Field('', max_length=400)
    hours_text: Optional[str] = Field('', max_length=500)
    hours: Optional[Dict[str, StoreHoursDay]] = None
    address: Optional[str] = Field('', max_length=300)
    phone: Optional[str] = Field('', max_length=40)
    post_title: Optional[str] = Field('', max_length=200)
    post_text: Optional[str] = Field('', max_length=4000)
    post_media_url: Optional[str] = Field('', max_length=600)
    post_cta_text: Optional[str] = Field('', max_length=60)
    post_whatsapp_message: Optional[str] = Field('', max_length=1000)

class StoreResponse(BaseModel):
    id: str
    name: str
    whatsapp: str = ''
    whatsapp_message: str = ''
    instagram: str = ''
    facebook: str = ''
    tiktok: str = ''
    google_review: str = ''
    google_maps_url: str = ''
    hours_text: str = ''
    hours: Optional[Dict[str, StoreHoursDay]] = None
    address: str = ''
    phone: str = ''
    post_title: str = ''
    post_text: str = ''
    post_media_url: str = ''
    post_cta_text: str = ''
    post_whatsapp_message: str = ''
    created_at: str

class VendorCredentials(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=200)


class OrganizationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    slug: Optional[str] = Field('', max_length=64)
    brand_name: Optional[str] = Field('', max_length=200)
    primary_color: Optional[str] = Field('#F96815', max_length=20)
    logo_url: Optional[str] = Field('', max_length=600)
    logo_public_id: Optional[str] = Field('', max_length=300)
    allowed_domains: Optional[List[str]] = []


class OrganizationUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    slug: Optional[str] = Field(None, max_length=64)
    brand_name: Optional[str] = Field(None, max_length=200)
    primary_color: Optional[str] = Field(None, max_length=20)
    logo_url: Optional[str] = Field(None, max_length=600)
    logo_public_id: Optional[str] = Field(None, max_length=300)
    allowed_domains: Optional[List[str]] = None
    cookie_banner_enabled: Optional[bool] = None
    cookie_banner_text: Optional[str] = Field(None, max_length=2000)
    cookie_banner_link: Optional[str] = Field(None, max_length=400)
    # Landing page customization
    landing_headline: Optional[str] = Field(None, max_length=140)
    # GDPR — controller (titolare del trattamento) info shown on /v/:vendorId/privacy
    legal_name: Optional[str] = Field(None, max_length=200)
    vat_number: Optional[str] = Field(None, max_length=40)
    legal_address: Optional[str] = Field(None, max_length=400)
    privacy_contact_email: Optional[str] = Field(None, max_length=200)
    privacy_policy_url: Optional[str] = Field(None, max_length=500)
    # Logo of the legal entity (controller) — used on the public privacy/terms
    # page in place of the franchising brand logo (`logo_url`). Lets users
    # distinguish "WindTre store branding" from "VDN SRL the data controller".
    legal_logo_url: Optional[str] = Field(None, max_length=600)
    legal_logo_public_id: Optional[str] = Field(None, max_length=300)
    # PWA icon (512×512 recommended) shown when a visitor saves the vendor
    # landing as an app on their phone home screen. Falls back to logo_url if
    # not set so the org doesn't have to upload twice.
    pwa_icon_url: Optional[str] = Field(None, max_length=600)
    pwa_icon_public_id: Optional[str] = Field(None, max_length=300)
    # Data profiling notice — editable per-org statement describing which third
    # parties may profile visitors after they tap on social/WhatsApp/Maps links
    # on the landing. Defaults to a reasonable Italian text that mentions Meta
    # (WhatsApp/Instagram/Facebook), Google (Maps/Reviews) and TikTok.
    data_profiling_text: Optional[str] = Field(None, max_length=4000)
    # Generic terms-of-use editable by the org; rendered on the public privacy page.
    terms_text: Optional[str] = Field(None, max_length=8000)


class OrgUserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=200)
    name: Optional[str] = Field('', max_length=200)
    organization_id: str = Field(..., max_length=64)

class VendorResponse(BaseModel):
    id: str
    slug: Optional[str] = ''
    name: str
    bio: str
    store_id: str
    whatsapp: str
    instagram: str
    facebook: str
    tiktok: str
    google_review: str
    google_maps_url: str
    qr_url: str
    landing_url: Optional[str] = ''  # effective public URL (custom domain if available)
    created_at: str
    total_views: int = 0
    email: Optional[str] = ''
    has_credentials: bool = False

class AnalyticsEvent(BaseModel):
    vendor_id: str
    event_type: str
    timestamp: Optional[str] = None

class DeployConfig(BaseModel):
    # Fly.io
    flyio_api_key: Optional[str] = ''
    flyio_app_name: Optional[str] = ''
    flyio_region: Optional[str] = 'fra'
    flyio_app_url: Optional[str] = ''  # https://<app>.fly.dev (computed/manual)
    # Vercel
    vercel_token: Optional[str] = ''
    vercel_project_id: Optional[str] = ''
    vercel_org_id: Optional[str] = ''
    vercel_app_url: Optional[str] = ''  # https://<project>.vercel.app
    vercel_deploy_hook: Optional[str] = ''  # https://api.vercel.com/v1/integrations/deploy/...
    # GitHub (optional, for redeploy automation)
    github_repo: Optional[str] = ''  # e.g. owner/repo
    github_token: Optional[str] = ''
    # Backend production secrets (forwarded to fly secrets set)
    prod_mongo_url: Optional[str] = ''
    prod_db_name: Optional[str] = 'qrhub_db'
    prod_jwt_secret: Optional[str] = ''
    prod_superadmin_email: Optional[str] = ''
    prod_superadmin_password: Optional[str] = ''
    prod_frontend_url: Optional[str] = ''
    prod_cors_origins: Optional[str] = ''
    # Cloudinary (used at runtime). Set EITHER cloudinary_url (preferred) OR the 3 separate vars
    cloudinary_url: Optional[str] = ''
    cloudinary_cloud_name: Optional[str] = ''
    cloudinary_api_key: Optional[str] = ''
    cloudinary_api_secret: Optional[str] = ''
    # Aruba (info)
    aruba_dns_zone: Optional[str] = ''  # e.g. tuodominio.it
    aruba_notes: Optional[str] = ''
    # Uptime monitoring
    uptime_enabled: Optional[bool] = True
    uptime_health_path: Optional[str] = '/api/auth/me'  # 401 = alive
    uptime_interval_sec: Optional[int] = 60


CLICK_TYPES = ['whatsapp_click', 'instagram_click', 'facebook_click', 'review_click', 'tiktok_click', 'maps_click', 'post_cta_click']


# ──────────────────────────────────────────────────────────────────
# GDPR — DPA (Data Processing Agreement) acceptance flow
# ──────────────────────────────────────────────────────────────────
CURRENT_DPA_VERSION = '1.0'


def _dpa_status(user: dict) -> dict:
    """Return whether the user has accepted the latest DPA version.
    Super admins are platform owners (not data subjects of a controller↔processor
    relationship) and therefore do not need to accept a DPA."""
    if _is_super_admin(user):
        return {'required': False, 'accepted': True, 'current_version': CURRENT_DPA_VERSION,
                'accepted_version': None, 'accepted_at': None}
    accepted_version = user.get('accepted_dpa_version')
    return {
        'required': True,
        'accepted': accepted_version == CURRENT_DPA_VERSION,
        'current_version': CURRENT_DPA_VERSION,
        'accepted_version': accepted_version,
        'accepted_at': user.get('accepted_dpa_at'),
    }


@api_router.get('/me/dpa-status')
async def get_dpa_status(user: dict = Depends(get_current_user)):
    return _dpa_status(user)


@api_router.post('/me/accept-dpa')
async def accept_dpa(request: Request, user: dict = Depends(get_current_user)):
    if _is_super_admin(user):
        raise HTTPException(status_code=400, detail='Il super admin non firma un DPA con se stesso')
    await db.users.update_one(
        {'_id': ObjectId(user['_id'])},
        {'$set': {
            'accepted_dpa_version': CURRENT_DPA_VERSION,
            'accepted_dpa_at': datetime.now(timezone.utc).isoformat(),
            'accepted_dpa_ip': _client_ip(request),
        }}
    )
    return {'message': 'DPA accettato', 'version': CURRENT_DPA_VERSION}


# ──────────────────────────────────────────────────────────────────
# GDPR — Right to access (art. 15), portability (art. 20), erasure (art. 17),
# revoke all sessions
# ──────────────────────────────────────────────────────────────────
@api_router.get('/me/data-export')
async def export_my_data(user: dict = Depends(get_current_user)):
    """Right to data portability (art. 20 GDPR) for the logged-in admin/org_admin user.
    Returns the user's own personal data + a summary of the org they belong to
    (since an org_admin manages but does NOT 'own' the org's data subjects)."""
    user_doc = {
        'id': user['_id'],
        'email': user.get('email', ''),
        'name': user.get('name', ''),
        'role': user.get('role', ''),
        'organization_id': user.get('organization_id'),
        'created_at': user.get('created_at', ''),
        'accepted_dpa_version': user.get('accepted_dpa_version'),
        'accepted_dpa_at': user.get('accepted_dpa_at'),
        'token_version': user.get('token_version', 1),
    }
    login_history = await db.login_attempts.find(
        {'email': user.get('email', '').lower(), 'scope': 'admin'},
        {'_id': 0, 'ts': 1, 'ip': 1, 'success': 1}
    ).sort('ts', -1).to_list(100)
    org_summary = None
    if not _is_super_admin(user) and user.get('organization_id'):
        org = await db.organizations.find_one({'id': user['organization_id']}, {'_id': 0})
        if org:
            org_summary = {
                'id': org['id'],
                'name': org.get('name', ''),
                'brand_name': org.get('brand_name', ''),
                'stores_count': await db.stores.count_documents({'organization_id': org['id']}),
                'vendors_count': await db.vendors.count_documents({'organization_id': org['id']}),
                'posts_count': await db.posts.count_documents({'organization_id': org['id']}),
                'files_count': await db.files.count_documents({'organization_id': org['id']}),
            }
    files_uploaded = await db.files.find(
        {'uploaded_by': user.get('email', '')},
        {'_id': 0, 'public_id': 1, 'url': 1, 'created_at': 1, 'original_filename': 1}
    ).to_list(1000)
    return {
        'exported_at': datetime.now(timezone.utc).isoformat(),
        'exported_for': user.get('email', ''),
        'format_version': '1.0',
        'user': user_doc,
        'login_history_last_100': login_history,
        'organization_summary': org_summary,
        'files_uploaded_by_me': files_uploaded,
        'notes': [
            'Questo export contiene solo i TUOI dati personali (art. 15 GDPR).',
            'I dati aggregati di analytics non sono inclusi perché non riconducibili a te individualmente.',
            'Se sei un org_admin e vuoi esportare i dati della tua organizzazione (titolare), '
            'usa il pannello Organizzazione → Esporta dati org.',
        ],
    }


@api_router.delete('/me')
async def delete_my_account(response: Response, user: dict = Depends(get_current_user)):
    """Right to erasure (art. 17 GDPR). Deletes the logged-in user account.
    - Super admin: forbidden (would lock everyone out of the platform).
    - Org admin: deletes only the user record; the organization and its data
      are NOT cascaded — the controller (org) might still have other admins, or
      the super_admin will need to reassign / delete it from his panel.
    """
    if _is_super_admin(user):
        raise HTTPException(status_code=400, detail='Impossibile auto-eliminare il super admin')
    await db.users.delete_one({'_id': ObjectId(user['_id'])})
    await db.login_attempts.delete_many({'email': user.get('email', '').lower(), 'scope': 'admin'})
    response.delete_cookie('access_token', path='/')
    return {'message': 'Account eliminato', 'email': user.get('email', '')}


@api_router.post('/me/revoke-all-sessions')
async def revoke_all_sessions(response: Response, user: dict = Depends(get_current_user)):
    """Invalidate every existing JWT for this user (incl. other devices/browsers)
    by bumping token_version. The current cookie is refreshed in-place so the
    user is not kicked out of the active tab."""
    new_tv = int(user.get('token_version', 1)) + 1
    await db.users.update_one(
        {'_id': ObjectId(user['_id'])},
        {'$set': {'token_version': new_tv}}
    )
    new_token = create_access_token(user['_id'], user.get('email', ''), new_tv)
    response.set_cookie(
        key='access_token', value=new_token,
        httponly=True, secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE,
        max_age=86400, path='/'
    )
    return {'message': 'Tutte le altre sessioni sono state invalidate', 'token_version': new_tv}


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=200)
    new_password: str = Field(..., min_length=8, max_length=200)


@api_router.post('/me/password')
async def change_my_password(payload: PasswordChangeRequest, response: Response,
                              user: dict = Depends(get_current_user)):
    """Change the logged-in user's password. Verifies the current password,
    bumps token_version so every other session is invalidated, refreshes the
    cookie of the active tab."""
    # get_current_user strips password_hash from the dict — re-fetch it for the verify check.
    full_user = await db.users.find_one({'_id': ObjectId(user['_id'])})
    if not full_user:
        raise HTTPException(status_code=401, detail='Not authenticated')
    if not verify_password(payload.current_password, full_user.get('password_hash', '')):
        # Don't leak whether current_password format was wrong vs mismatch.
        raise HTTPException(status_code=401, detail='Password attuale non corretta')
    if payload.new_password == payload.current_password:
        raise HTTPException(status_code=400, detail='La nuova password deve essere diversa da quella attuale')

    new_tv = int(user.get('token_version', 1)) + 1
    await db.users.update_one(
        {'_id': ObjectId(user['_id'])},
        {'$set': {
            'password_hash': hash_password(payload.new_password),
            'token_version': new_tv,
            'password_changed_at': datetime.now(timezone.utc).isoformat(),
        }}
    )
    # Audit log (no PII apart from hashed email shown via _redact_email)
    logger.info(f'Password changed for user {_redact_email(user.get("email", ""))}')

    # Refresh the cookie so the active session stays alive after token_version bump.
    new_token = create_access_token(user['_id'], user.get('email', ''), new_tv)
    response.set_cookie(
        key='access_token', value=new_token,
        httponly=True, secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE,
        max_age=86400, path='/'
    )
    return {'message': 'Password aggiornata. Le altre sessioni sono state disconnesse.'}


# Vendor-side counterparts -------------------------------------------------------
@api_router.get('/vendor/me/data-export')
async def vendor_export_my_data(vendor: dict = Depends(get_current_vendor)):
    vid = vendor['id']
    vendor_doc = {k: v for k, v in vendor.items() if k != 'password_hash'}
    analytics = await db.analytics.find(
        {'vendor_id': vid},
        {'_id': 0, 'event_type': 1, 'timestamp': 1, 'device': 1, 'city': 1, 'country': 1}
    ).sort('timestamp', -1).to_list(5000)
    login_history = await db.login_attempts.find(
        {'email': vendor.get('email', '').lower(), 'scope': 'vendor'},
        {'_id': 0, 'ts': 1, 'ip': 1, 'success': 1}
    ).sort('ts', -1).to_list(100)
    return {
        'exported_at': datetime.now(timezone.utc).isoformat(),
        'exported_for': vendor.get('email', ''),
        'format_version': '1.0',
        'vendor': vendor_doc,
        'analytics_events_aggregated': analytics,
        'login_history_last_100': login_history,
    }


@api_router.delete('/vendor/me')
async def vendor_delete_my_account(response: Response, vendor: dict = Depends(get_current_vendor)):
    vid = vendor['id']
    await db.vendors.delete_one({'id': vid})
    await db.analytics.delete_many({'vendor_id': vid})
    await db.login_attempts.delete_many({'email': vendor.get('email', '').lower(), 'scope': 'vendor'})
    response.delete_cookie('vendor_token', path='/')
    return {'message': 'Profilo venditore eliminato'}


@api_router.post('/vendor/me/revoke-all-sessions')
async def vendor_revoke_all_sessions(response: Response, vendor: dict = Depends(get_current_vendor)):
    new_tv = int(vendor.get('token_version', 1)) + 1
    await db.vendors.update_one(
        {'id': vendor['id']},
        {'$set': {'token_version': new_tv}}
    )
    new_token = create_vendor_token(vendor['id'], vendor.get('email', ''), new_tv)
    response.set_cookie(
        key='vendor_token', value=new_token,
        httponly=True, secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE,
        max_age=86400, path='/'
    )
    return {'message': 'Tutte le altre sessioni sono state invalidate', 'token_version': new_tv}


@api_router.post('/auth/login')
async def login(req: LoginRequest, request: Request, response: Response):
    await _enforce_login_rate_limit('admin', req.email, request)
    user = await db.users.find_one({'email': req.email.lower()})
    if not user or not verify_password(req.password, user['password_hash']):
        await _record_login_attempt('admin', req.email, request, success=False)
        raise HTTPException(status_code=401, detail='Credenziali non valide')
    await _record_login_attempt('admin', req.email, request, success=True)

    token = create_access_token(str(user['_id']), user['email'], user.get('token_version', 1))
    response.set_cookie(
        key='access_token',
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=86400,
        path='/'
    )
    
    return {
        'id': str(user['_id']),
        'email': user['email'],
        'name': user.get('name', 'Admin')
    }

@api_router.post('/auth/logout')
async def logout(response: Response):
    response.delete_cookie('access_token', path='/')
    return {'message': 'Logged out'}

@api_router.get('/auth/me')
async def get_me(user: dict = Depends(get_current_user)):
    return {
        'id': user.get('_id'),
        'email': user.get('email'),
        'name': user.get('name', ''),
        'role': user.get('role', 'org_admin'),
        'organization_id': user.get('organization_id')
    }

@api_router.get('/stores', response_model=List[StoreResponse])
async def get_stores(user: dict = Depends(get_current_user)):
    stores = await db.stores.find(_tenant_filter(user), {'_id': 0}).to_list(1000)
    for store in stores:
        store.setdefault('whatsapp_message', '')
        store.setdefault('tiktok', '')
        store.setdefault('google_maps_url', '')
        store.setdefault('post_title', '')
        store.setdefault('post_text', '')
        store.setdefault('post_media_url', '')
        store.setdefault('post_cta_text', '')
        store.setdefault('post_whatsapp_message', '')
    return stores

@api_router.post('/stores', response_model=StoreResponse)
async def create_store(store: StoreCreate, user: dict = Depends(get_current_user)):
    if not _is_super_admin(user) and not user.get('organization_id'):
        raise HTTPException(status_code=403, detail='Nessuna organizzazione assegnata')
    store_id = str(ObjectId())
    # Pydantic StoreHoursDay → plain dict for Mongo
    hours_payload = None
    if store.hours:
        hours_payload = {k: (v.model_dump() if hasattr(v, 'model_dump') else dict(v)) for k, v in store.hours.items()}
    store_doc = {
        'id': store_id,
        'organization_id': user.get('organization_id'),
        'name': store.name,
        'whatsapp': store.whatsapp or '',
        'whatsapp_message': store.whatsapp_message or '',
        'instagram': store.instagram or '',
        'facebook': store.facebook or '',
        'tiktok': store.tiktok or '',
        'google_review': store.google_review or '',
        'google_maps_url': store.google_maps_url or '',
        'hours_text': store.hours_text or '',
        'hours': hours_payload,
        'address': store.address or '',
        'phone': store.phone or '',
        'post_title': store.post_title or '',
        'post_text': store.post_text or '',
        'post_media_url': store.post_media_url or '',
        'post_cta_text': store.post_cta_text or '',
        'post_whatsapp_message': store.post_whatsapp_message or '',
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.stores.insert_one(store_doc)
    store_doc.pop('_id', None)
    store_doc.pop('organization_id', None)
    return StoreResponse(**store_doc)

@api_router.put('/stores/{store_id}', response_model=StoreResponse)
async def update_store(store_id: str, store: StoreCreate, user: dict = Depends(get_current_user)):
    existing = await db.stores.find_one(_tenant_filter(user, {'id': store_id}), {'_id': 0})
    if not existing:
        raise HTTPException(status_code=404, detail='Store not found')

    hours_payload = None
    if store.hours:
        hours_payload = {k: (v.model_dump() if hasattr(v, 'model_dump') else dict(v)) for k, v in store.hours.items()}

    update_doc = {
        'name': store.name,
        'whatsapp': store.whatsapp or '',
        'whatsapp_message': store.whatsapp_message or '',
        'instagram': store.instagram or '',
        'facebook': store.facebook or '',
        'tiktok': store.tiktok or '',
        'google_review': store.google_review or '',
        'google_maps_url': store.google_maps_url or '',
        'hours_text': store.hours_text or '',
        'hours': hours_payload,
        'address': store.address or '',
        'phone': store.phone or '',
        'post_title': store.post_title or '',
        'post_text': store.post_text or '',
        'post_media_url': store.post_media_url or '',
        'post_cta_text': store.post_cta_text or '',
        'post_whatsapp_message': store.post_whatsapp_message or ''
    }
    
    await db.stores.update_one({'id': store_id}, {'$set': update_doc})
    
    # Update all vendors linked to this store
    await db.vendors.update_many(
        {'store_id': store_id},
        {'$set': {
            'whatsapp': update_doc['whatsapp'],
            'whatsapp_message': update_doc['whatsapp_message'],
            'instagram': update_doc['instagram'],
            'facebook': update_doc['facebook'],
            'tiktok': update_doc['tiktok'],
            'google_review': update_doc['google_review'],
            'google_maps_url': update_doc['google_maps_url'],
            'post_title': update_doc['post_title'],
            'post_text': update_doc['post_text'],
            'post_media_url': update_doc['post_media_url'],
            'post_cta_text': update_doc['post_cta_text'],
            'post_whatsapp_message': update_doc['post_whatsapp_message']
        }}
    )
    
    updated = await db.stores.find_one({'id': store_id}, {'_id': 0})
    return StoreResponse(**updated)

@api_router.delete('/stores/{store_id}')
async def delete_store(store_id: str, user: dict = Depends(get_current_user)):
    qf = _tenant_filter(user, {'id': store_id})
    store = await db.stores.find_one(qf, {'_id': 0, 'id': 1})
    if not store:
        raise HTTPException(status_code=404, detail='Store not found')
    
    vendors_count = await db.vendors.count_documents({'store_id': store_id})
    if vendors_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f'Impossibile eliminare: {vendors_count} venditori collegati a questo negozio'
        )
    
    await db.stores.delete_one({'id': store_id})
    await db.posts.delete_many({'store_id': store_id})
    return {'message': 'Store deleted'}


# ──────────────────────────────────────────────────────────────────
# Organizations (multi-tenancy - super admin only)
# ──────────────────────────────────────────────────────────────────
def _slugify(s: str) -> str:
    out = ''.join(c.lower() if c.isalnum() else '-' for c in s.strip())
    while '--' in out:
        out = out.replace('--', '-')
    return out.strip('-') or str(uuid.uuid4())[:8]


def _org_to_response(o: dict) -> dict:
    return {
        'id': o.get('id', ''),
        'name': o.get('name', ''),
        'slug': o.get('slug', ''),
        'brand_name': o.get('brand_name', '') or o.get('name', ''),
        'primary_color': o.get('primary_color', '#F96815'),
        'logo_url': o.get('logo_url', ''),
        'logo_public_id': o.get('logo_public_id', ''),
        'allowed_domains': o.get('allowed_domains', []) or [],
        'cookie_banner_enabled': bool(o.get('cookie_banner_enabled', True)),  # default ON post-GDPR audit
        'cookie_banner_text': o.get('cookie_banner_text', '') or '',
        'cookie_banner_link': o.get('cookie_banner_link', '') or '',
        # Landing customization
        'landing_headline': o.get('landing_headline', '') or '',
        # GDPR controller info
        'legal_name': o.get('legal_name', '') or '',
        'vat_number': o.get('vat_number', '') or '',
        'legal_address': o.get('legal_address', '') or '',
        'privacy_contact_email': o.get('privacy_contact_email', '') or '',
        'privacy_policy_url': o.get('privacy_policy_url', '') or '',
        'legal_logo_url': o.get('legal_logo_url', '') or '',
        'legal_logo_public_id': o.get('legal_logo_public_id', '') or '',
        'pwa_icon_url': o.get('pwa_icon_url', '') or '',
        'pwa_icon_public_id': o.get('pwa_icon_public_id', '') or '',
        'data_profiling_text': o.get('data_profiling_text', '') or '',
        'terms_text': o.get('terms_text', '') or '',
        'created_at': o.get('created_at', '')
    }


@api_router.get('/organizations')
async def list_organizations(user: dict = Depends(require_super_admin)):
    orgs = await db.organizations.find({}, {'_id': 0}).sort('created_at', -1).to_list(1000)
    enriched = []
    required_fields = ('legal_name', 'vat_number', 'legal_address', 'privacy_contact_email')
    for o in orgs:
        users_count = await db.users.count_documents({'organization_id': o['id']})
        stores_count = await db.stores.count_documents({'organization_id': o['id']})
        vendors_count = await db.vendors.count_documents({'organization_id': o['id']})
        # GDPR status per org (super admin view).
        # The DPA is a legal contract between QRHub (processor) and the controller
        # (the organization, not each individual admin). It is therefore considered
        # "accepted" for the whole org as soon as AT LEAST ONE org_admin has signed.
        admin_users = await db.users.find(
            {'organization_id': o['id'], 'role': 'org_admin'},
            {'_id': 0, 'email': 1, 'accepted_dpa_version': 1, 'accepted_dpa_at': 1}
        ).to_list(200)
        admins_total = len(admin_users)
        admins_accepted = sum(1 for u in admin_users if u.get('accepted_dpa_version') == CURRENT_DPA_VERSION)
        last_accept = max((u.get('accepted_dpa_at') or '' for u in admin_users), default='') or None
        filled_required = sum(1 for k in required_fields if (o.get(k) or '').strip())
        controller_complete = filled_required == len(required_fields)
        r = _org_to_response(o)
        r['users_count'] = users_count
        r['stores_count'] = stores_count
        r['vendors_count'] = vendors_count
        r['gdpr'] = {
            'dpa_required_version': CURRENT_DPA_VERSION,
            'dpa_admins_total': admins_total,
            'dpa_admins_accepted': admins_accepted,
            'dpa_status': 'accepted' if admins_accepted >= 1 else 'pending',
            'dpa_last_accept_at': last_accept,
            'controller_fields_filled': filled_required,
            'controller_fields_required': len(required_fields),
            'controller_complete': controller_complete,
        }
        enriched.append(r)
    return enriched


@api_router.get('/organizations/{org_id}/dpa-status')
async def org_dpa_status(org_id: str, user: dict = Depends(require_super_admin)):
    """Super-admin view: who in this org has accepted the DPA and when."""
    if not await db.organizations.find_one({'id': org_id}, {'_id': 1}):
        raise HTTPException(status_code=404, detail='Organizzazione non trovata')
    admins = await db.users.find(
        {'organization_id': org_id, 'role': 'org_admin'},
        {'_id': 0, 'email': 1, 'name': 1, 'accepted_dpa_version': 1, 'accepted_dpa_at': 1, 'accepted_dpa_ip': 1}
    ).to_list(500)
    return {
        'organization_id': org_id,
        'required_version': CURRENT_DPA_VERSION,
        'admins': [
            {
                'email': a.get('email', ''),
                'name': a.get('name', ''),
                'accepted_version': a.get('accepted_dpa_version'),
                'accepted_at': a.get('accepted_dpa_at'),
                'accepted_ip': a.get('accepted_dpa_ip'),
                'status': 'accepted' if a.get('accepted_dpa_version') == CURRENT_DPA_VERSION else 'pending',
            }
            for a in admins
        ],
    }


DEFAULT_PROFILING_TEXT_IT = """Quando interagisci con i pulsanti presenti su questa landing (chiamata WhatsApp, recensione Google, apertura Google Maps, social Instagram/Facebook/TikTok) lasci la nostra pagina ed entri in servizi gestiti da soggetti terzi che operano in autonomia come titolari del trattamento, ciascuno secondo la propria informativa privacy:

• Meta Platforms Ireland (WhatsApp, Instagram, Facebook): contatto, messaggi e profilazione pubblicitaria sulle proprie piattaforme. Privacy: https://www.facebook.com/privacy/policy/
• Google Ireland (Google Maps, Recensioni, Profilo aziendale): geolocalizzazione, contributi recensioni, profilazione search/maps. Privacy: https://policies.google.com/privacy
• TikTok Technology (TikTok): visualizzazione contenuti, raccomandazione e profilazione pubblicitaria. Privacy: https://www.tiktok.com/legal/privacy-policy

I dati che condividi con questi servizi non sono visibili né conservati da noi: viaggiano direttamente dal tuo dispositivo verso le piattaforme citate. Ti consigliamo di leggere le rispettive informative prima di interagire."""

DEFAULT_TERMS_TEXT_IT = """L'utilizzo di questa landing presuppone l'accettazione delle seguenti condizioni:

• I contenuti pubblicati sono curati dal venditore e dalla nostra organizzazione, che ne è responsabile a tutti gli effetti.
• Le informazioni di contatto (numero WhatsApp, social, indirizzo) sono fornite per agevolare la comunicazione commerciale: non sostituiscono i canali ufficiali di assistenza clienti.
• Eventuali promozioni, prezzi e disponibilità sono indicativi e possono variare senza preavviso.
• La piattaforma tecnica QRHub fornisce solo il software che ospita la landing: non risponde dei contenuti, della loro accuratezza o della disponibilità del venditore.

Per segnalazioni, esercizio dei diritti GDPR o richieste relative ai contenuti scrivere al contatto privacy indicato nell'informativa."""


@api_router.post('/organizations')
async def create_organization(payload: OrganizationCreate, user: dict = Depends(require_super_admin)):
    slug = payload.slug or _slugify(payload.name)
    existing = await db.organizations.find_one({'slug': slug}, {'_id': 0})
    if existing:
        raise HTTPException(status_code=400, detail='Slug già in uso')

    org_id = str(ObjectId())
    doc = {
        'id': org_id,
        'name': payload.name,
        'slug': slug,
        'brand_name': payload.brand_name or payload.name,
        'primary_color': payload.primary_color or '#F96815',
        'logo_url': payload.logo_url or '',
        'logo_public_id': payload.logo_public_id or '',
        'allowed_domains': payload.allowed_domains or [],
        # Seed the GDPR-required editable copy with the default Italian text so
        # new orgs always have a working privacy page on day one. They can edit
        # it later from OrgSettings → tab Pubblico.
        'data_profiling_text': DEFAULT_PROFILING_TEXT_IT,
        'terms_text': DEFAULT_TERMS_TEXT_IT,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.organizations.insert_one(doc.copy())
    return _org_to_response(doc)


@api_router.put('/organizations/{org_id}')
async def update_organization(org_id: str, payload: OrganizationUpdate, user: dict = Depends(get_current_user)):
    if not _is_super_admin(user) and user.get('organization_id') != org_id:
        raise HTTPException(status_code=403, detail='Non autorizzato')
    
    org = await db.organizations.find_one({'id': org_id}, {'_id': 0})
    if not org:
        raise HTTPException(status_code=404, detail='Organizzazione non trovata')
    
    update = {}
    if payload.name is not None:
        update['name'] = (payload.name or '').strip()[:200]
    if payload.slug is not None:
        # Slug edit reserved to super admins (changes public URLs / domain mapping)
        if not _is_super_admin(user):
            raise HTTPException(status_code=403, detail='Solo il super admin può cambiare lo slug')
        new_slug = re.sub(r'[^a-z0-9-]+', '-', (payload.slug or '').strip().lower()).strip('-')
        if not new_slug:
            raise HTTPException(status_code=400, detail='Slug non valido')
        if new_slug != org.get('slug'):
            clash = await db.organizations.find_one({'slug': new_slug, 'id': {'$ne': org_id}}, {'_id': 1})
            if clash:
                raise HTTPException(status_code=400, detail='Slug già in uso da un\'altra organizzazione')
            update['slug'] = new_slug
    if payload.brand_name is not None:
        update['brand_name'] = payload.brand_name
    if payload.primary_color is not None:
        update['primary_color'] = payload.primary_color
    if payload.logo_url is not None:
        update['logo_url'] = payload.logo_url
    if payload.logo_public_id is not None:
        update['logo_public_id'] = payload.logo_public_id
    if payload.allowed_domains is not None:
        # Sanitize
        update['allowed_domains'] = [d.strip().lower().replace('https://', '').replace('http://', '').rstrip('/')
                                       for d in payload.allowed_domains if d and d.strip()]
    if payload.cookie_banner_enabled is not None:
        update['cookie_banner_enabled'] = bool(payload.cookie_banner_enabled)
    if payload.cookie_banner_text is not None:
        update['cookie_banner_text'] = (payload.cookie_banner_text or '').strip()[:1000]
    if payload.cookie_banner_link is not None:
        link = (payload.cookie_banner_link or '').strip()
        if link and not link.startswith(('http://', 'https://', '/')):
            link = 'https://' + link
        update['cookie_banner_link'] = link[:500]
    # GDPR controller fields
    if payload.legal_name is not None:
        update['legal_name'] = (payload.legal_name or '').strip()[:200]
    if payload.vat_number is not None:
        update['vat_number'] = (payload.vat_number or '').strip()[:50]
    if payload.legal_address is not None:
        update['legal_address'] = (payload.legal_address or '').strip()[:500]
    if payload.privacy_contact_email is not None:
        update['privacy_contact_email'] = (payload.privacy_contact_email or '').strip().lower()[:200]
    if payload.privacy_policy_url is not None:
        purl = (payload.privacy_policy_url or '').strip()
        if purl and not purl.startswith(('http://', 'https://', '/')):
            purl = 'https://' + purl
        update['privacy_policy_url'] = purl[:500]
    if payload.legal_logo_url is not None:
        update['legal_logo_url'] = (payload.legal_logo_url or '').strip()[:600]
    if payload.legal_logo_public_id is not None:
        update['legal_logo_public_id'] = (payload.legal_logo_public_id or '').strip()[:300]
    if payload.pwa_icon_url is not None:
        update['pwa_icon_url'] = (payload.pwa_icon_url or '').strip()[:600]
    if payload.pwa_icon_public_id is not None:
        update['pwa_icon_public_id'] = (payload.pwa_icon_public_id or '').strip()[:300]
    if payload.data_profiling_text is not None:
        update['data_profiling_text'] = (payload.data_profiling_text or '').strip()[:4000]
    if payload.terms_text is not None:
        update['terms_text'] = (payload.terms_text or '').strip()[:8000]
    if payload.landing_headline is not None:
        update['landing_headline'] = (payload.landing_headline or '').strip()[:140]

    await db.organizations.update_one({'id': org_id}, {'$set': update})
    updated = await db.organizations.find_one({'id': org_id}, {'_id': 0})
    return _org_to_response(updated)


@api_router.delete('/organizations/{org_id}')
async def delete_organization(org_id: str, user: dict = Depends(require_super_admin)):
    # Cascade delete
    await db.users.delete_many({'organization_id': org_id, 'role': {'$ne': 'super_admin'}})
    await db.stores.delete_many({'organization_id': org_id})
    await db.vendors.delete_many({'organization_id': org_id})
    await db.posts.delete_many({'organization_id': org_id})
    await db.files.delete_many({'organization_id': org_id})
    await db.analytics.delete_many({'organization_id': org_id})
    await db.organizations.delete_one({'id': org_id})
    return {'message': 'Organizzazione e tutti i suoi dati eliminati'}


@api_router.post('/organizations/{org_id}/users')
async def create_org_user(org_id: str, payload: OrgUserCreate, user: dict = Depends(require_super_admin)):
    org = await db.organizations.find_one({'id': org_id}, {'_id': 0})
    if not org:
        raise HTTPException(status_code=404, detail='Organizzazione non trovata')
    
    email = payload.email.lower()
    existing = await db.users.find_one({'email': email})
    if existing:
        raise HTTPException(status_code=400, detail='Email già registrata')
    
    await db.users.insert_one({
        'email': email,
        'password_hash': hash_password(payload.password),
        'name': payload.name or '',
        'role': 'org_admin',
        'organization_id': org_id,
        'created_at': datetime.now(timezone.utc).isoformat()
    })
    return {'message': 'Utente creato', 'email': email}


@api_router.get('/organizations/{org_id}/users')
async def list_org_users(org_id: str, user: dict = Depends(get_current_user)):
    if not _is_super_admin(user) and user.get('organization_id') != org_id:
        raise HTTPException(status_code=403, detail='Non autorizzato')
    users = await db.users.find({'organization_id': org_id}, {'_id': 0, 'password_hash': 0}).to_list(1000)
    return users


@api_router.delete('/organizations/users/{user_email}')
async def delete_org_user(user_email: str, user: dict = Depends(require_super_admin)):
    if user_email.lower() == user.get('email', '').lower():
        raise HTTPException(status_code=400, detail='Non puoi eliminare te stesso')
    result = await db.users.delete_one({'email': user_email.lower(), 'role': {'$ne': 'super_admin'}})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Utente non trovato')
    return {'message': 'Utente eliminato'}


class OrgUserPasswordReset(BaseModel):
    password: str


@api_router.put('/organizations/users/{user_email}/password')
async def reset_org_user_password(user_email: str, payload: OrgUserPasswordReset,
                                   user: dict = Depends(require_super_admin)):
    """Reset the password of an org admin user. Super admin only.
    Does NOT allow resetting another super_admin from here."""
    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail='La password deve avere almeno 6 caratteri')
    target = await db.users.find_one({'email': user_email.lower()})
    if not target:
        raise HTTPException(status_code=404, detail='Utente non trovato')
    if target.get('role') == 'super_admin':
        raise HTTPException(status_code=403, detail='Usa "Ruota credenziali" per resettare un super admin')
    await db.users.update_one(
        {'email': user_email.lower()},
        {'$set': {'password_hash': hash_password(payload.password),
                  'password_reset_at': datetime.now(timezone.utc).isoformat(),
                  'password_reset_by': user.get('email')}}
    )
    return {'message': f'Password aggiornata per {user_email}'}


@api_router.get('/my-organization')
async def get_my_organization(user: dict = Depends(get_current_user)):
    if _is_super_admin(user):
        return {'id': None, 'name': 'QRHub Platform', 'brand_name': 'QRHub',
                'primary_color': '#F96815', 'logo_url': '', 'allowed_domains': [],
                'is_super_admin': True}
    if not user.get('organization_id'):
        raise HTTPException(status_code=404, detail='Nessuna organizzazione associata')
    org = await db.organizations.find_one({'id': user['organization_id']}, {'_id': 0})
    if not org:
        raise HTTPException(status_code=404, detail='Organizzazione non trovata')
    r = _org_to_response(org)
    r['is_super_admin'] = False
    return r


# ──────────────────────────────────────────────────────────────────
# Vercel custom domains (managed by org_admin from their panel, using
# super_admin's saved Vercel token — org admins never see Vercel)
# ──────────────────────────────────────────────────────────────────
VERCEL_API = 'https://api.vercel.com'


def _can_manage_org(user: dict, org_id: str) -> bool:
    return _is_super_admin(user) or (user.get('organization_id') == org_id)


def _normalize_domain(d: str) -> str:
    return (d or '').strip().lower().replace('https://', '').replace('http://', '').rstrip('/')


async def _vercel_credentials() -> dict:
    cfg = await db.config.find_one({'type': 'deployment'}, {'_id': 0}) or {}
    token = (cfg.get('vercel_token') or '').strip()
    project = (cfg.get('vercel_project_id') or '').strip()
    org = (cfg.get('vercel_org_id') or '').strip()
    if not token or not project:
        raise HTTPException(
            status_code=503,
            detail='Vercel non è ancora configurato dal super admin. Riprova più tardi.'
        )
    return {'token': token, 'project_id': project, 'team_id': org}


async def _vercel_call(method: str, path: str, *, json=None, expect_404_ok: bool = False):
    creds = await _vercel_credentials()
    url = f"{VERCEL_API}{path}"
    if creds['team_id']:
        sep = '&' if '?' in url else '?'
        url = f"{url}{sep}teamId={creds['team_id']}"
    headers = {'Authorization': f"Bearer {creds['token']}", 'Content-Type': 'application/json'}
    async with httpx.AsyncClient(timeout=20.0) as c:
        r = await c.request(method, url, json=json, headers=headers)
    # Try parse json regardless
    try:
        payload = r.json()
    except Exception:
        payload = {'raw': r.text[:300]}
    if expect_404_ok and r.status_code == 404:
        return None
    if r.status_code >= 400:
        # Surface user-friendly message
        msg = ''
        if isinstance(payload, dict):
            err = payload.get('error') or {}
            msg = err.get('message') or payload.get('message') or ''
        if not msg:
            msg = f'Vercel error {r.status_code}'
        raise HTTPException(status_code=502, detail=f'Vercel: {msg}')
    return payload


class DomainAddRequest(BaseModel):
    domain: str


async def _vercel_domain_config(domain: str) -> dict:
    """Fetch live DNS configuration status from Vercel for a domain. Returns
    the recommended records + whether DNS currently points to Vercel."""
    try:
        cfg = await _vercel_call('GET', f'/v6/domains/{domain}/config') or {}
    except HTTPException:
        cfg = {}
    rec_cname = (cfg.get('recommendedCNAME') or [{}])
    rec_a = (cfg.get('recommendedIPv4') or [{}])
    # Pick the highest-rank (rank=1) recommendation; fall back to the generic ones.
    cname_primary = ''
    if rec_cname and isinstance(rec_cname[0], dict):
        cname_primary = rec_cname[0].get('value', '') or ''
    a_primary = []
    if rec_a and isinstance(rec_a[0], dict):
        a_primary = rec_a[0].get('value', []) or []
    return {
        'misconfigured': bool(cfg.get('misconfigured', True)),
        'service_type': cfg.get('serviceType', ''),
        'current_cnames': cfg.get('cnames', []) or [],
        'current_a_values': cfg.get('aValues', []) or [],
        'current_nameservers': cfg.get('nameservers', []) or [],
        'conflicts': cfg.get('conflicts', []) or [],
        'recommended_cname': cname_primary.rstrip('.'),
        'recommended_cname_fallback': 'cname.vercel-dns.com',
        'recommended_a_values': a_primary,
        'recommended_a_fallback': ['76.76.21.21'],
    }


def _format_domain_record(vercel_resp: dict, organization_id: str, fallback_name: str = '') -> dict:
    """Normalize Vercel domain response into a compact record for the UI."""
    name = vercel_resp.get('name') or fallback_name
    apex = vercel_resp.get('apexName') or name
    is_subdomain = name != apex
    host = name.split('.')[0] if is_subdomain else '@'
    return {
        'organization_id': organization_id,
        'domain': name,
        'apex': apex,
        'is_subdomain': is_subdomain,
        # NOTE: Vercel's "verified" is OWNERSHIP only — it does NOT mean DNS is pointing.
        # Use dns.misconfigured to check if the actual records are correctly set.
        'verified': bool(vercel_resp.get('verified', False)),
        'verification': vercel_resp.get('verification') or [],
        'created_at': vercel_resp.get('createdAt'),
        'dns_instructions': {
            # Static guidance — overridden by live `dns` block below when present.
            'type': 'CNAME' if is_subdomain else 'A',
            'host': host,
            'value': 'cname.vercel-dns.com' if is_subdomain else '76.76.21.21',
            'ttl': 3600
        }
    }


async def _sync_org_allowed_domains(org_id: str):
    """Recompute allowed_domains from vercel_domains so backend security filter stays consistent."""
    domains = await db.vercel_domains.find({'organization_id': org_id}, {'_id': 0, 'domain': 1}).to_list(500)
    names = sorted({d['domain'] for d in domains})
    await db.organizations.update_one({'id': org_id}, {'$set': {'allowed_domains': names}})


@api_router.get('/organizations/{org_id}/domains')
async def list_org_domains(org_id: str, user: dict = Depends(get_current_user)):
    if not _can_manage_org(user, org_id):
        raise HTTPException(status_code=403, detail='Non autorizzato')
    docs = await db.vercel_domains.find({'organization_id': org_id}, {'_id': 0}).sort('domain', 1).to_list(500)
    # Enrich with live DNS status (cached implicitly by Vercel's edge)
    for d in docs:
        try:
            d['dns'] = await _vercel_domain_config(d['domain'])
        except Exception as e:
            d['dns'] = {'misconfigured': True, 'error': str(e)[:200]}
    return docs


@api_router.post('/organizations/{org_id}/domains')
async def add_org_domain(org_id: str, payload: DomainAddRequest, user: dict = Depends(get_current_user)):
    if not _can_manage_org(user, org_id):
        raise HTTPException(status_code=403, detail='Non autorizzato')
    domain = _normalize_domain(payload.domain)
    if not domain or '.' not in domain:
        raise HTTPException(status_code=400, detail='Dominio non valido')

    org = await db.organizations.find_one({'id': org_id}, {'_id': 0, 'id': 1})
    if not org:
        raise HTTPException(status_code=404, detail='Organizzazione non trovata')

    # Prevent same domain on multiple orgs
    other = await db.vercel_domains.find_one({'domain': domain, 'organization_id': {'$ne': org_id}}, {'_id': 0})
    if other:
        raise HTTPException(status_code=400, detail='Questo dominio è già usato da un\'altra organizzazione')

    creds = await _vercel_credentials()
    # Add to Vercel project
    resp = await _vercel_call('POST', f"/v10/projects/{creds['project_id']}/domains", json={'name': domain})

    record = _format_domain_record(resp, org_id, domain)
    record['created_at_local'] = datetime.now(timezone.utc).isoformat()
    record['added_by'] = user.get('email', '')
    record['dns'] = await _vercel_domain_config(domain)
    await db.vercel_domains.update_one(
        {'organization_id': org_id, 'domain': domain},
        {'$set': {k: v for k, v in record.items() if k != 'dns'}},
        upsert=True
    )
    await _sync_org_allowed_domains(org_id)
    return record


@api_router.get('/organizations/{org_id}/domains/{domain}/status')
async def domain_status(org_id: str, domain: str, user: dict = Depends(get_current_user)):
    if not _can_manage_org(user, org_id):
        raise HTTPException(status_code=403, detail='Non autorizzato')
    domain = _normalize_domain(domain)
    existing = await db.vercel_domains.find_one({'organization_id': org_id, 'domain': domain}, {'_id': 0})
    if not existing:
        raise HTTPException(status_code=404, detail='Dominio non trovato')

    creds = await _vercel_credentials()
    resp = await _vercel_call('GET', f"/v9/projects/{creds['project_id']}/domains/{domain}",
                                  expect_404_ok=True)
    if not resp:
        # Domain was removed from Vercel externally → clean up local
        await db.vercel_domains.delete_one({'organization_id': org_id, 'domain': domain})
        await _sync_org_allowed_domains(org_id)
        raise HTTPException(status_code=404, detail='Dominio non più presente su Vercel — rimosso')

    record = _format_domain_record(resp, org_id, domain)
    record['created_at_local'] = existing.get('created_at_local')
    record['added_by'] = existing.get('added_by', '')
    record['dns'] = await _vercel_domain_config(domain)
    await db.vercel_domains.update_one(
        {'organization_id': org_id, 'domain': domain},
        {'$set': {'verified': record['verified'], 'verification': record['verification']}}
    )
    return record


@api_router.post('/organizations/{org_id}/domains/{domain}/verify')
async def verify_domain(org_id: str, domain: str, user: dict = Depends(get_current_user)):
    if not _can_manage_org(user, org_id):
        raise HTTPException(status_code=403, detail='Non autorizzato')
    domain = _normalize_domain(domain)
    existing = await db.vercel_domains.find_one({'organization_id': org_id, 'domain': domain}, {'_id': 0})
    if not existing:
        raise HTTPException(status_code=404, detail='Dominio non trovato')

    creds = await _vercel_credentials()
    resp = await _vercel_call('POST', f"/v9/projects/{creds['project_id']}/domains/{domain}/verify")
    record = _format_domain_record(resp, org_id, domain)
    await db.vercel_domains.update_one(
        {'organization_id': org_id, 'domain': domain},
        {'$set': {'verified': record['verified'], 'verification': record['verification']}}
    )
    return record


@api_router.delete('/organizations/{org_id}/domains/{domain}')
async def remove_org_domain(org_id: str, domain: str, user: dict = Depends(get_current_user)):
    if not _can_manage_org(user, org_id):
        raise HTTPException(status_code=403, detail='Non autorizzato')
    domain = _normalize_domain(domain)
    existing = await db.vercel_domains.find_one({'organization_id': org_id, 'domain': domain}, {'_id': 0})
    if not existing:
        raise HTTPException(status_code=404, detail='Dominio non trovato')

    creds = await _vercel_credentials()
    # Best-effort delete from Vercel; ignore 404 (already gone)
    await _vercel_call('DELETE', f"/v9/projects/{creds['project_id']}/domains/{domain}",
                          expect_404_ok=True)

    await db.vercel_domains.delete_one({'organization_id': org_id, 'domain': domain})
    await _sync_org_allowed_domains(org_id)
    return {'message': 'Dominio rimosso', 'domain': domain}


# ──────────────────────────────────────────────────────────────────
# Platform primary domain (e.g. qrhub.it) — set by super admin.
# This is the canonical hostname where the admin login + dashboard live.
# Custom-domain tenants (e.g. app.vdn.srl) serve ONLY public landing pages;
# any attempt to reach /login or /dashboard there is redirected here.
#
# Stored as a single doc in db.platform_settings keyed by `_id='platform_domain'`.
# Same Vercel-API integration as org domains, just without an organization_id.
# ──────────────────────────────────────────────────────────────────

class PlatformDomainSet(BaseModel):
    domain: str = Field(..., min_length=3, max_length=253)


def _platform_domain_record(vercel_resp: dict, fallback_name: str = '') -> dict:
    """Same shape as _format_domain_record but without organization_id."""
    return {
        'domain': (vercel_resp.get('name') or fallback_name).lower(),
        'apex': vercel_resp.get('apexName') or '',
        'verified': bool(vercel_resp.get('verified')),
        'verification': vercel_resp.get('verification') or [],
        'created_at_vercel': vercel_resp.get('createdAt'),
        'created_at_local': datetime.now(timezone.utc).isoformat(),
    }


@api_router.get('/platform/primary-domain')
async def get_platform_primary_domain(user: dict = Depends(require_super_admin)):
    """Return the configured platform primary domain doc + live DNS status."""
    doc = await db.platform_settings.find_one({'_id': 'platform_domain'}, {'_id': 0})
    if not doc:
        return {'domain': None}
    # Always refresh DNS state on read so the UI shows current truth.
    try:
        doc['dns'] = await _vercel_domain_config(doc['domain'])
    except Exception as e:
        logger.warning(f"platform_domain dns refresh failed: {e}")
        doc.setdefault('dns', {'misconfigured': True})
    return doc


@api_router.put('/platform/primary-domain')
async def set_platform_primary_domain(payload: PlatformDomainSet, user: dict = Depends(require_super_admin)):
    """Configure (or replace) the platform's primary domain.
    Registers it on Vercel via API — same flow used for tenant org domains."""
    new_domain = _normalize_domain(payload.domain)
    if not new_domain or '.' not in new_domain:
        raise HTTPException(status_code=400, detail='Dominio non valido')

    # If a previous platform domain exists and is different, remove it from Vercel
    # so we don't leave stale aliases. The new one takes its place.
    creds = await _vercel_credentials()
    old = await db.platform_settings.find_one({'_id': 'platform_domain'}, {'_id': 0})
    if old and old.get('domain') and old['domain'] != new_domain:
        try:
            await _vercel_call(
                'DELETE',
                f"/v9/projects/{creds['project_id']}/domains/{old['domain']}",
                expect_404_ok=True,
            )
        except Exception as e:
            logger.warning(f'best-effort cleanup of old platform domain failed: {e}')

    # Register on Vercel (idempotent — if it already exists Vercel returns 409
    # which _vercel_call converts to a clean dict response or HTTPException).
    try:
        resp = await _vercel_call(
            'POST',
            f"/v10/projects/{creds['project_id']}/domains",
            json={'name': new_domain},
        )
    except HTTPException as he:
        # 409 = already attached to this project — re-fetch it as a GET so we
        # don't fail when reconfiguring an existing platform domain.
        if he.status_code == 409:
            resp = await _vercel_call(
                'GET',
                f"/v9/projects/{creds['project_id']}/domains/{new_domain}",
            )
        else:
            raise

    record = _platform_domain_record(resp, new_domain)
    record['added_by'] = user.get('email', '')
    record['dns'] = await _vercel_domain_config(new_domain)

    await db.platform_settings.update_one(
        {'_id': 'platform_domain'},
        {'$set': record},
        upsert=True,
    )
    logger.info(f'Platform primary domain set to {new_domain} by {_redact_email(user.get("email", ""))}')
    return record


@api_router.post('/platform/primary-domain/verify')
async def verify_platform_primary_domain(user: dict = Depends(require_super_admin)):
    """Re-check verification + DNS state from Vercel API."""
    doc = await db.platform_settings.find_one({'_id': 'platform_domain'}, {'_id': 0})
    if not doc or not doc.get('domain'):
        raise HTTPException(status_code=404, detail='Nessun dominio piattaforma configurato')
    domain = doc['domain']
    creds = await _vercel_credentials()
    resp = await _vercel_call('POST', f"/v9/projects/{creds['project_id']}/domains/{domain}/verify")
    record = _platform_domain_record(resp, domain)
    record['dns'] = await _vercel_domain_config(domain)
    await db.platform_settings.update_one(
        {'_id': 'platform_domain'},
        {'$set': {'verified': record['verified'], 'verification': record['verification'], 'dns': record['dns']}},
    )
    return record


@api_router.delete('/platform/primary-domain')
async def remove_platform_primary_domain(user: dict = Depends(require_super_admin)):
    """Unset the platform primary domain. Vercel alias is removed best-effort."""
    doc = await db.platform_settings.find_one({'_id': 'platform_domain'}, {'_id': 0})
    if not doc or not doc.get('domain'):
        return {'message': 'Nessun dominio da rimuovere'}
    domain = doc['domain']
    try:
        creds = await _vercel_credentials()
        await _vercel_call(
            'DELETE',
            f"/v9/projects/{creds['project_id']}/domains/{domain}",
            expect_404_ok=True,
        )
    except Exception as e:
        logger.warning(f'platform domain delete: vercel call failed: {e}')
    await db.platform_settings.delete_one({'_id': 'platform_domain'})
    return {'message': 'Dominio piattaforma rimosso', 'domain': domain}


# Public endpoint consumed by the frontend DomainGuard to decide whether the
# current hostname is the canonical admin domain or a tenant landing domain.
@api_router.get('/platform/config')
async def get_platform_config():
    """No-auth helper for the frontend SPA to know the canonical admin hostname."""
    doc = await db.platform_settings.find_one(
        {'_id': 'platform_domain'},
        {'_id': 0, 'domain': 1, 'verified': 1},
    )
    primary = (doc.get('domain') if doc else None) or ''
    return {
        'primary_domain': primary,
        'primary_verified': bool(doc.get('verified')) if doc else False,
        # Hosts where the admin login is also allowed (Vercel default + localhost dev).
        'admin_hosts_allowlist': [
            'qrhub-app.vercel.app',
            'localhost',
            '127.0.0.1',
        ],
        # Hostname suffix patterns also treated as admin hosts. Useful for the
        # Emergent preview environment (*.preview.emergentagent.com) and any
        # *.vercel.app deploy preview created by Vercel for branch builds.
        'admin_host_suffixes': [
            '.preview.emergentagent.com',
            '.vercel.app',
            '.emergent.host',
        ],
    }


# ──────────────────────────────────────────────────────────────────
# Posts (Multi-announcement Carousel) — multiple posts per store
# ──────────────────────────────────────────────────────────────────
class PostCreate(BaseModel):
    title: Optional[str] = ''
    text: Optional[str] = ''
    media_url: Optional[str] = ''
    media_public_id: Optional[str] = ''
    media_resource_type: Optional[str] = ''  # image | video
    aspect_ratio: Optional[float] = None
    cta_text: Optional[str] = ''
    cta_whatsapp_message: Optional[str] = ''
    position: Optional[int] = None
    start_at: Optional[str] = None  # ISO datetime; if null = active immediately
    end_at: Optional[str] = None    # ISO datetime; if null = no expiry


class PostUpdate(PostCreate):
    pass


def _post_doc_to_response(p: dict) -> dict:
    return {
        'id': p.get('id', ''),
        'store_id': p.get('store_id', ''),
        'title': p.get('title', '') or '',
        'text': p.get('text', '') or '',
        'media_url': p.get('media_url', '') or '',
        'media_public_id': p.get('media_public_id', '') or '',
        'media_resource_type': p.get('media_resource_type', '') or '',
        'aspect_ratio': p.get('aspect_ratio'),
        'cta_text': p.get('cta_text', '') or '',
        'cta_whatsapp_message': p.get('cta_whatsapp_message', '') or '',
        'position': p.get('position', 0),
        'start_at': p.get('start_at'),
        'end_at': p.get('end_at'),
        'status': _post_status(p),
        'created_at': p.get('created_at', '')
    }


def _post_status(p: dict) -> str:
    """Return 'scheduled' | 'active' | 'expired'."""
    now = datetime.now(timezone.utc)
    start = _parse_iso(p.get('start_at'))
    end = _parse_iso(p.get('end_at'))
    if start and now < start:
        return 'scheduled'
    if end and now > end:
        return 'expired'
    return 'active'


def _parse_iso(s) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace('Z', '+00:00'))
    except Exception:
        return None


def _is_post_currently_active(p: dict) -> bool:
    return _post_status(p) == 'active'


@api_router.get('/stores/{store_id}/posts')
async def list_store_posts(store_id: str, user: dict = Depends(get_current_user)):
    # Verify store belongs to user's organization
    store = await db.stores.find_one(_tenant_filter(user, {'id': store_id}), {'_id': 0, 'id': 1})
    if not store:
        raise HTTPException(status_code=404, detail='Negozio non trovato')
    posts = await db.posts.find({'store_id': store_id}, {'_id': 0}).sort('position', 1).to_list(1000)
    return [_post_doc_to_response(p) for p in posts]


@api_router.post('/stores/{store_id}/posts')
async def create_post(store_id: str, post: PostCreate, user: dict = Depends(get_current_user)):
    store = await db.stores.find_one(_tenant_filter(user, {'id': store_id}), {'_id': 0})
    if not store:
        raise HTTPException(status_code=404, detail='Negozio non trovato')
    
    # Auto-position at end if not provided
    pos = post.position
    if pos is None or pos < 0:
        existing_count = await db.posts.count_documents({'store_id': store_id})
        pos = existing_count
    
    post_id = str(ObjectId())
    doc = {
        'id': post_id,
        'store_id': store_id,
        'organization_id': user.get('organization_id'),
        'title': post.title or '',
        'text': post.text or '',
        'media_url': post.media_url or '',
        'media_public_id': post.media_public_id or '',
        'media_resource_type': post.media_resource_type or '',
        'aspect_ratio': post.aspect_ratio,
        'cta_text': post.cta_text or '',
        'cta_whatsapp_message': post.cta_whatsapp_message or '',
        'position': pos,
        'start_at': post.start_at or None,
        'end_at': post.end_at or None,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.posts.insert_one(doc.copy())
    doc.pop('_id', None)
    return _post_doc_to_response(doc)


@api_router.put('/posts/{post_id}')
async def update_post(post_id: str, post: PostUpdate, user: dict = Depends(get_current_user)):
    existing = await db.posts.find_one(_tenant_filter(user, {'id': post_id}), {'_id': 0})
    if not existing:
        raise HTTPException(status_code=404, detail='Post non trovato')
    
    update_doc = {
        'title': post.title or '',
        'text': post.text or '',
        'media_url': post.media_url or '',
        'media_public_id': post.media_public_id or '',
        'media_resource_type': post.media_resource_type or '',
        'aspect_ratio': post.aspect_ratio,
        'cta_text': post.cta_text or '',
        'cta_whatsapp_message': post.cta_whatsapp_message or '',
        'start_at': post.start_at or None,
        'end_at': post.end_at or None,
    }
    if post.position is not None and post.position >= 0:
        update_doc['position'] = post.position
    
    await db.posts.update_one({'id': post_id}, {'$set': update_doc})
    updated = await db.posts.find_one({'id': post_id}, {'_id': 0})
    return _post_doc_to_response(updated)


class ReorderRequest(BaseModel):
    post_ids: List[str]


@api_router.post('/stores/{store_id}/posts/reorder')
async def reorder_posts(store_id: str, req: ReorderRequest, user: dict = Depends(get_current_user)):
    store = await db.stores.find_one(_tenant_filter(user, {'id': store_id}), {'_id': 0, 'id': 1})
    if not store:
        raise HTTPException(status_code=404, detail='Negozio non trovato')
    for idx, pid in enumerate(req.post_ids):
        await db.posts.update_one({'id': pid, 'store_id': store_id}, {'$set': {'position': idx}})
    return {'message': 'Ordine aggiornato'}


@api_router.delete('/posts/{post_id}')
async def delete_post(post_id: str, user: dict = Depends(get_current_user)):
    result = await db.posts.delete_one(_tenant_filter(user, {'id': post_id}))
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Post non trovato')
    return {'message': 'Post eliminato'}



@api_router.get('/vendors', response_model=List[VendorResponse])
async def get_vendors(user: dict = Depends(get_current_user)):
    vendors = await db.vendors.find(_tenant_filter(user), {'_id': 0}).to_list(1000)
    if not vendors:
        return vendors

    # ── Batch analytics: a single $group instead of N count_documents queries.
    vendor_ids = [v['id'] for v in vendors]
    counts_cursor = db.analytics.aggregate([
        {'$match': {'vendor_id': {'$in': vendor_ids}, 'event_type': 'page_view'}},
        {'$group': {'_id': '$vendor_id', 'n': {'$sum': 1}}},
    ])
    counts_map = {c['_id']: c['n'] async for c in counts_cursor}

    # ── Batch verified custom domains: one find() per *distinct* org_id, then
    # keep only the oldest (most stable) so the landing_url stays deterministic.
    org_ids = list({v.get('organization_id') for v in vendors if v.get('organization_id')})
    domain_map = {}
    if org_ids:
        async for cd in db.vercel_domains.find(
            {'organization_id': {'$in': org_ids}, 'verified': True},
            {'_id': 0, 'organization_id': 1, 'domain': 1, 'created_at_local': 1}
        ).sort('created_at_local', 1):
            org_id = cd.get('organization_id')
            if org_id and org_id not in domain_map and cd.get('domain'):
                domain_map[org_id] = cd['domain']

    for v in vendors:
        v['total_views'] = counts_map.get(v['id'], 0)
        v.setdefault('tiktok', '')
        v.setdefault('google_maps_url', '')
        v['has_credentials'] = bool(v.get('password_hash'))
        org_id = v.get('organization_id')
        domain = domain_map.get(org_id) if org_id else None
        if domain:
            landing_key = (v.get('slug') or '').strip() or v.get('id', '')
            v['landing_url'] = f"https://{domain}/v/{landing_key}"
        else:
            v['landing_url'] = v.get('qr_url') or ''
        # Don't leak the hash via response (Pydantic VendorResponse ignores it anyway, but be explicit)
        v.pop('password_hash', None)
    return vendors

@api_router.post('/vendors', response_model=VendorResponse)
async def create_vendor(vendor: VendorCreate, user: dict = Depends(get_current_user)):
    if not _is_super_admin(user) and not user.get('organization_id'):
        raise HTTPException(status_code=403, detail='Nessuna organizzazione assegnata')
    store = await db.stores.find_one(_tenant_filter(user, {'id': vendor.store_id}), {'_id': 0})
    if not store:
        raise HTTPException(status_code=404, detail='Negozio non trovato')
    
    vendor_id = str(ObjectId())
    frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:3000')

    # Optional custom slug — must be unique tenant-wide (and globally to avoid /v/:key collisions)
    slug = _normalize_vendor_slug(vendor.slug or '')
    if slug:
        if await _vendor_slug_taken(slug):
            raise HTTPException(status_code=409, detail=f'Slug "{slug}" già in uso da un altro venditore')

    landing_key = slug or vendor_id
    qr_url = f"{frontend_url}/v/{landing_key}"

    vendor_doc = {
        'id': vendor_id,
        'slug': slug,
        'organization_id': user.get('organization_id'),
        'name': vendor.name,
        'bio': vendor.bio or '',
        'store_id': vendor.store_id,
        'whatsapp': store['whatsapp'],
        'whatsapp_message': store.get('whatsapp_message', ''),
        'instagram': store['instagram'],
        'facebook': store['facebook'],
        'tiktok': store.get('tiktok', ''),
        'google_review': store['google_review'],
        'google_maps_url': store.get('google_maps_url', ''),
        'post_title': store.get('post_title', ''),
        'post_text': store.get('post_text', ''),
        'post_media_url': store.get('post_media_url', ''),
        'post_cta_text': store.get('post_cta_text', ''),
        'post_whatsapp_message': store.get('post_whatsapp_message', ''),
        'qr_url': qr_url,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'total_views': 0
    }
    
    await db.vendors.insert_one(vendor_doc)
    vendor_doc.pop('_id', None)
    vendor_doc['landing_url'] = await _effective_landing_url(vendor_doc)
    vendor_doc.pop('organization_id', None)
    return VendorResponse(**vendor_doc)

@api_router.get('/vendors/{vendor_id}/privacy-info')
async def get_vendor_privacy_info(vendor_id: str):
    """Public endpoint serving the data needed by the per-tenant privacy page
    (/v/{vendor_id}/privacy). Exposes only the controller info already published
    in the org's public profile + a fixed list of QRHub sub-processors. Does NOT
    expose any personal data nor any internal tenant configuration."""
    vendor = await db.vendors.find_one({'id': vendor_id}, {'_id': 0, 'id': 1, 'name': 1, 'organization_id': 1})
    if not vendor:
        raise HTTPException(status_code=404, detail='Vendor not found')
    org = await db.organizations.find_one(
        {'id': vendor.get('organization_id')},
        {'_id': 0, 'name': 1, 'brand_name': 1, 'primary_color': 1, 'logo_url': 1,
         'legal_name': 1, 'vat_number': 1, 'legal_address': 1,
         'privacy_contact_email': 1, 'privacy_policy_url': 1,
         'legal_logo_url': 1,
         'data_profiling_text': 1, 'terms_text': 1}
    ) or {}
    # GDPR M-bonus — completeness flag for public "trust badge".
    required_fields = ('legal_name', 'vat_number', 'legal_address', 'privacy_contact_email')
    has_all_required = all((org.get(k) or '').strip() for k in required_fields)
    has_optional = bool((org.get('privacy_policy_url') or '').strip())
    # Editable per-org statements rendered on the privacy page. If empty we
    # don't fall back to a default here — the OrgSettings UI already shows the
    # default text on the form so the org can save it explicitly.
    profiling_text = (org.get('data_profiling_text') or '').strip()
    terms_text = (org.get('terms_text') or '').strip()
    return {
        'vendor': {'id': vendor['id'], 'name': vendor.get('name', '')},
        'organization': {
            'brand_name': org.get('brand_name', '') or org.get('name', ''),
            'primary_color': org.get('primary_color', '#F96815'),
            'logo_url': org.get('logo_url', ''),
            # Logo of the legal entity (controller). When set, the privacy/
            # terms page shows this instead of the franchising brand logo so
            # visitors see the actual data controller (es. "VDN SRL") and
            # not the franchise (es. "WindTre").
            'legal_logo_url': org.get('legal_logo_url', '') or org.get('logo_url', ''),
        },
        'gdpr_status': {
            'controller_verified': has_all_required,
            'completeness': 'complete' if has_all_required and has_optional
                              else ('verified' if has_all_required else 'incomplete'),
        },
        'controller': {
            'legal_name': org.get('legal_name', '') or org.get('name', '') or org.get('brand_name', ''),
            'vat_number': org.get('vat_number', ''),
            'legal_address': org.get('legal_address', ''),
            'privacy_contact_email': org.get('privacy_contact_email', ''),
            'privacy_policy_url': org.get('privacy_policy_url', ''),
        },
        # Editable org-owned sections. Frontend handles defaults visually.
        'data_profiling_text': profiling_text,
        'terms_text': terms_text,
        # QRHub acts as data processor on behalf of the controller above.
        'processor': {
            'name': 'QRHub',
            'role': 'data_processor',
            'github_url': 'https://github.com/vdndeploy/qrhub_deploy',
            'license': 'MIT',
        },
        'sub_processors': [
            {'name': 'Fly.io', 'role': 'Backend hosting', 'region': 'EU (Frankfurt)',
             'website': 'https://fly.io', 'transfers': 'EU-only (region fra)'},
            {'name': 'Vercel', 'role': 'Frontend hosting / CDN', 'region': 'Global edge',
             'website': 'https://vercel.com', 'transfers': 'Trasferimento extra-UE coperto da SCC (Vercel DPA)'},
            {'name': 'MongoDB Atlas', 'role': 'Database', 'region': 'See MongoDB Atlas console',
             'website': 'https://www.mongodb.com/atlas', 'transfers': 'SCC + DPA disponibile'},
            {'name': 'Cloudinary', 'role': 'CDN immagini/video', 'region': 'US (default)',
             'website': 'https://cloudinary.com', 'transfers': 'EU-US Data Privacy Framework + SCC'},
            {'name': 'ipapi.co', 'role': 'Geo-lookup (city level)', 'region': 'EU',
             'website': 'https://ipapi.co', 'transfers': 'IP individuale mai memorizzato lato QRHub; solo subnet anonimizzata in cache 7gg'},
        ],
        'data_collected': {
            'aggregate_metrics': ['page_view', 'click count per canale', 'città (livello macro)',
                                    'regione', 'paese', 'device category (mobile/tablet/desktop)',
                                    'OS family + version', 'browser family + version'],
            'cookies_technical': [
                {'name': 'access_token', 'purpose': 'Sessione admin', 'duration': '24h'},
                {'name': 'vendor_token', 'purpose': 'Sessione venditore', 'duration': '24h'},
                {'name': 'qrhub_cookie_ack_*', 'purpose': 'Memorizza chiusura cookie banner', 'duration': 'localStorage (persistente fino a clear browser)'},
            ],
            'never_stored': ['Indirizzi IP individuali', 'User agent grezzi',
                              'Cookie di profilazione', 'Identificatori di marketing',
                              'Dati identificativi degli utenti finali'],
        },
        'legal_basis': {
            'page_view': 'Esecuzione di servizio richiesto (art. 6(1)(b) GDPR)',
            'aggregate_analytics': 'Legittimo interesse del titolare al miglioramento del servizio, '
                                      'con dati pseudonimizzati e non riconducibili al singolo utente (art. 6(1)(f) GDPR)',
            'technical_cookies': 'Necessari per la fornitura del servizio (art. 122 Codice Privacy IT)',
        },
        'retention': {
            'geo_cache_subnet': '7 giorni (poi cancellati automaticamente)',
            'aggregate_analytics': 'Indefinita (dati non riconducibili a persona fisica)',
            'admin_session_cookie': '24 ore',
            'login_attempts_log': '60 minuti (rolling)',
        },
        'rights': [
            {'art': 'Art. 15', 'name': 'Accesso ai propri dati'},
            {'art': 'Art. 16', 'name': 'Rettifica'},
            {'art': 'Art. 17', 'name': 'Cancellazione (oblio)'},
            {'art': 'Art. 18', 'name': 'Limitazione del trattamento'},
            {'art': 'Art. 20', 'name': 'Portabilità'},
            {'art': 'Art. 21', 'name': 'Opposizione'},
            {'art': 'Art. 77', 'name': 'Reclamo al Garante (https://www.garanteprivacy.it)'},
        ],
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }


async def _effective_landing_url(vendor: dict) -> str:
    """Return the canonical public URL for a vendor's landing page.
    Prefers a verified custom domain on the vendor's org (so QR codes printed
    today keep working when the user finishes DNS setup). Falls back to the
    stored qr_url (typically the Vercel default URL)."""
    org_id = vendor.get('organization_id')
    landing_key = (vendor.get('slug') or '').strip() or vendor.get('id', '')
    if org_id:
        cd = await db.vercel_domains.find_one(
            {'organization_id': org_id, 'verified': True},
            {'_id': 0, 'domain': 1},
            sort=[('created_at_local', 1)]  # oldest first → most stable
        )
        if cd and cd.get('domain'):
            return f"https://{cd['domain']}/v/{landing_key}"
    return vendor.get('qr_url') or ''


@api_router.get('/vendors/{vendor_id}')
async def get_vendor_public(vendor_id: str):
    # vendor_id can be either the canonical UUID or a custom slug like "gizwindtre"
    vendor = await _resolve_vendor_doc(vendor_id)
    if not vendor:
        raise HTTPException(status_code=404, detail='Vendor not found')
    vendor.setdefault('tiktok', '')
    vendor.setdefault('google_maps_url', '')
    vendor.setdefault('post_title', '')
    vendor.setdefault('post_text', '')
    vendor.setdefault('post_media_url', '')
    vendor.setdefault('post_cta_text', '')
    vendor.setdefault('post_whatsapp_message', '')
    # Only expose profile image publicly if the vendor enabled the toggle
    if not vendor.get('profile_image_enabled'):
        vendor['profile_image_url'] = ''
    vendor.setdefault('profile_image_url', '')
    # Include carousel posts from store (only currently-active ones)
    posts = []
    if vendor.get('store_id'):
        raw = await db.posts.find({'store_id': vendor['store_id']}, {'_id': 0}).sort('position', 1).to_list(1000)
        posts = [_post_doc_to_response(p) for p in raw if _is_post_currently_active(p)]
    vendor['posts'] = posts

    # Attach lightweight store info (used by the Store/info button on the landing).
    if vendor.get('store_id'):
        store_doc = await db.stores.find_one(
            {'id': vendor['store_id']},
            {'_id': 0, 'name': 1, 'hours_text': 1, 'hours': 1, 'address': 1, 'phone': 1, 'google_maps_url': 1}
        )
        if store_doc:
            vendor['store'] = {
                'name': store_doc.get('name', ''),
                'hours_text': (store_doc.get('hours_text') or '').strip(),
                'hours': store_doc.get('hours') or None,
                'address': (store_doc.get('address') or '').strip(),
                'phone': (store_doc.get('phone') or '').strip(),
                'google_maps_url': store_doc.get('google_maps_url', ''),
            }
    # Attach the *canonical* hostname this landing should be served from.
    # This is the first verified custom-domain the vendor's org owns. The frontend
    # uses it to enforce: "landings only render on the org's own domain — not on
    # the platform admin domain (qrhub.it) or random hosts."
    canonical_host = ''
    real_vendor = await db.vendors.find_one({'id': vendor['id']}, {'_id': 0, 'organization_id': 1})
    if real_vendor and real_vendor.get('organization_id'):
        cd = await db.vercel_domains.find_one(
            {'organization_id': real_vendor['organization_id'], 'verified': True},
            {'_id': 0, 'domain': 1},
            sort=[('created_at_local', 1)]
        )
        if cd and cd.get('domain'):
            canonical_host = cd['domain']
    vendor['canonical_host'] = canonical_host
    # Strip multi-tenant internal field
    vendor.pop('organization_id', None)
    # Include organization branding (lightweight) — we already have the doc resolved above.
    # Lookup is via the resolved vendor doc rather than re-querying by vendor_id (which
    # might be a slug). Read the org from the same doc we already loaded.
    real_vendor = await db.vendors.find_one({'id': vendor['id']}, {'_id': 0, 'organization_id': 1})
    if real_vendor and real_vendor.get('organization_id'):
        org = await db.organizations.find_one(
            {'id': real_vendor['organization_id']},
            {'_id': 0, 'brand_name': 1, 'primary_color': 1, 'logo_url': 1, 'pwa_icon_url': 1,
              'cookie_banner_enabled': 1, 'cookie_banner_text': 1, 'cookie_banner_link': 1,
              'landing_headline': 1, 'name': 1,
              'legal_name': 1, 'vat_number': 1, 'legal_address': 1,
              'privacy_contact_email': 1, 'privacy_policy_url': 1,
              'data_profiling_text': 1, 'terms_text': 1}
        )
        if org:
            required_fields = ('legal_name', 'vat_number', 'legal_address', 'privacy_contact_email')
            has_all_required = all((org.get(k) or '').strip() for k in required_fields)
            has_optional = bool((org.get('privacy_policy_url') or '').strip())
            vendor['organization'] = {
                'name': org.get('name', ''),
                'brand_name': org.get('brand_name', ''),
                'primary_color': org.get('primary_color', '#F96815'),
                'logo_url': org.get('logo_url', ''),
                # PWA icon (512×512). Falls back to logo_url so existing orgs
                # keep working without re-uploading.
                'pwa_icon_url': (org.get('pwa_icon_url') or '').strip() or org.get('logo_url', ''),
                'landing_headline': (org.get('landing_headline') or '').strip(),
                'cookie_banner': {
                    'enabled': True,
                    'use_custom_text': bool(org.get('cookie_banner_enabled', False)),
                    'text': org.get('cookie_banner_text', '') or '',
                    'link': org.get('cookie_banner_link', '') or ''
                },
                # Lightweight footer block — only the fields the landing renders.
                'legal_name': (org.get('legal_name') or '').strip(),
                'vat_number': (org.get('vat_number') or '').strip(),
                'legal_address': (org.get('legal_address') or '').strip(),
                'privacy_contact_email': (org.get('privacy_contact_email') or '').strip(),
                'privacy_policy_url': (org.get('privacy_policy_url') or '').strip(),
                'has_privacy_info': bool(
                    org.get('legal_name') or org.get('vat_number') or org.get('privacy_contact_email')
                ),
                'gdpr_status': {
                    'controller_verified': has_all_required,
                    'completeness': 'complete' if has_all_required and has_optional
                                      else ('verified' if has_all_required else 'incomplete'),
                },
            }
            # DPA gating: a vendor's landing is "active" only after at least one
            # org_admin of the controller organization has signed the latest DPA.
            # Until then the public endpoint still answers (so admin previews keep
            # working) but the frontend renders a "Servizio non ancora attivo"
            # screen instead of the real landing.
            accepted_count = await db.users.count_documents({
                'organization_id': real_vendor['organization_id'],
                'role': 'org_admin',
                'accepted_dpa_version': CURRENT_DPA_VERSION,
            })
            if accepted_count == 0:
                vendor['inactive_reason'] = 'dpa_pending'
    return vendor

@api_router.put('/vendors/{vendor_id}', response_model=VendorResponse)
async def update_vendor(vendor_id: str, vendor: VendorUpdate, user: dict = Depends(get_current_user)):
    existing = await db.vendors.find_one(_tenant_filter(user, {'id': vendor_id}), {'_id': 0})
    if not existing:
        raise HTTPException(status_code=404, detail='Vendor not found')
    
    store = await db.stores.find_one(_tenant_filter(user, {'id': vendor.store_id}), {'_id': 0})
    if not store:
        raise HTTPException(status_code=404, detail='Negozio non trovato')
    
    update_doc = {
        'name': vendor.name,
        'bio': vendor.bio or '',
        'store_id': vendor.store_id,
        'whatsapp': store['whatsapp'],
        'whatsapp_message': store.get('whatsapp_message', ''),
        'instagram': store['instagram'],
        'facebook': store['facebook'],
        'tiktok': store.get('tiktok', ''),
        'google_review': store['google_review'],
        'google_maps_url': store.get('google_maps_url', ''),
        'post_title': store.get('post_title', ''),
        'post_text': store.get('post_text', ''),
        'post_media_url': store.get('post_media_url', ''),
        'post_cta_text': store.get('post_cta_text', ''),
        'post_whatsapp_message': store.get('post_whatsapp_message', '')
    }

    # Slug change is optional. Empty string explicitly clears it (back to UUID-only URL).
    if vendor.slug is not None:
        new_slug = _normalize_vendor_slug(vendor.slug or '')
        if new_slug != (existing.get('slug') or ''):
            if new_slug and await _vendor_slug_taken(new_slug, except_vendor_id=vendor_id):
                raise HTTPException(status_code=409, detail=f'Slug "{new_slug}" già in uso da un altro venditore')
            update_doc['slug'] = new_slug
            # Refresh qr_url so newly-printed QRs use the friendly URL (existing
            # printed QRs still resolve because /v/<uuid> is always supported).
            frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
            update_doc['qr_url'] = f"{frontend_url}/v/{new_slug or vendor_id}"

    await db.vendors.update_one({'id': vendor_id}, {'$set': update_doc})
    updated = await db.vendors.find_one({'id': vendor_id}, {'_id': 0})
    analytics = await db.analytics.count_documents({'vendor_id': vendor_id, 'event_type': 'page_view'})
    updated['total_views'] = analytics
    updated['landing_url'] = await _effective_landing_url(updated)
    return VendorResponse(**updated)

@api_router.delete('/vendors/{vendor_id}')
async def delete_vendor(vendor_id: str, user: dict = Depends(get_current_user)):
    result = await db.vendors.delete_one(_tenant_filter(user, {'id': vendor_id}))
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Vendor not found')
    await db.analytics.delete_many({'vendor_id': vendor_id})
    return {'message': 'Vendor deleted'}

@api_router.post('/vendors/{vendor_id}/analytics/reset')
async def reset_vendor_analytics(vendor_id: str, user: dict = Depends(get_current_user)):
    """Wipe every analytics event for this vendor without touching the vendor itself.
    Use when the QR is being handed over to a new person and the previous owner's
    stats should not bleed into the new operator's dashboard."""
    vendor = await db.vendors.find_one(_tenant_filter(user, {'id': vendor_id}), {'_id': 0, 'id': 1, 'name': 1, 'organization_id': 1})
    if not vendor:
        raise HTTPException(status_code=404, detail='Vendor not found')
    result = await db.analytics.delete_many({'vendor_id': vendor_id})
    deleted = int(result.deleted_count or 0)
    # Audit trail — keep a tamper-evident record of who reset which vendor and how
    # many events were wiped. Useful in case of disputes about "missing" data.
    await db.audit_log.insert_one({
        'id': str(uuid.uuid4()),
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'action': 'vendor_analytics_reset',
        'actor_email': user.get('email', ''),
        'actor_role': user.get('role', ''),
        'organization_id': vendor.get('organization_id', '') or user.get('organization_id', ''),
        'target_type': 'vendor',
        'target_id': vendor_id,
        'target_label': vendor.get('name', ''),
        'metadata': {'deleted_count': deleted},
    })
    return {
        'message': 'Statistiche azzerate',
        'vendor_id': vendor_id,
        'vendor_name': vendor.get('name', ''),
        'deleted_count': deleted,
    }


@api_router.post('/vendors/{vendor_id}/preview-token')
async def generate_vendor_preview_token(vendor_id: str, user: dict = Depends(get_current_user)):
    """Admin-only: produce a short-lived signed token that lets the holder load
    the vendor landing on any host (qrhub.it, vercel default, etc.) bypassing
    the canonical-host enforcement. The token avoids the cross-domain cookie
    headache that affects /api/auth/me when called from qrhub.it to qrhub.fly.dev."""
    vendor = await db.vendors.find_one(
        _tenant_filter(user, {'id': vendor_id}),
        {'_id': 0, 'id': 1, 'name': 1, 'organization_id': 1}
    )
    if not vendor:
        raise HTTPException(status_code=404, detail='Vendor not found')
    payload = {
        'scope': 'vendor_preview',
        'vendor_id': vendor_id,
        'admin_email': user.get('email', ''),
        'exp': datetime.now(timezone.utc) + timedelta(minutes=30),
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return {'token': token, 'expires_in': 1800}


@api_router.get('/preview/check')
async def check_preview_token(token: str, vendor_id: str):
    """Public endpoint used by the landing to verify a preview token signature
    and expiry. Returns 200 if valid for the given vendor_id, 401 otherwise.

    Both sides are resolved through `_resolve_vendor_doc` so that a token
    minted for the canonical UUID still validates when the URL uses the
    friendly slug (e.g. /v/giz vs /v/<uuid>)."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail='Preview token scaduto')
    except Exception:
        raise HTTPException(status_code=401, detail='Preview token non valido')
    if payload.get('scope') != 'vendor_preview':
        raise HTTPException(status_code=401, detail='Preview token non valido')
    token_vendor_key = payload.get('vendor_id') or ''
    url_doc = await _resolve_vendor_doc(vendor_id)
    token_doc = await _resolve_vendor_doc(token_vendor_key)
    if not url_doc or not token_doc or url_doc.get('id') != token_doc.get('id'):
        raise HTTPException(status_code=401, detail='Preview token non valido per questo venditore')
    return {'valid': True, 'admin_email': payload.get('admin_email', '')}


@api_router.get('/audit')
async def list_audit_log(skip: int = 0, limit: int = 50, action: Optional[str] = None,
                         user: dict = Depends(get_current_user)):
    """Tenant-scoped audit log. Super admins see everything, org admins see only
    entries for their organization."""
    q: dict = {}
    if action:
        q['action'] = action
    if not _is_super_admin(user):
        org_id = (user.get('organization_id') or '').strip()
        if not org_id:
            return {'items': [], 'total': 0, 'skip': skip, 'limit': limit}
        q['organization_id'] = org_id
    limit = max(1, min(int(limit or 50), 200))
    skip = max(0, int(skip or 0))
    total = await db.audit_log.count_documents(q)
    items = await db.audit_log.find(q, {'_id': 0}).sort('timestamp', -1).skip(skip).limit(limit).to_list(limit)
    return {'items': items, 'total': total, 'skip': skip, 'limit': limit}

@api_router.post('/vendors/{vendor_id}/credentials')
async def create_vendor_credentials(vendor_id: str, creds: VendorCredentials, user: dict = Depends(get_current_user)):
    vendor = await db.vendors.find_one(_tenant_filter(user, {'id': vendor_id}), {'_id': 0})
    if not vendor:
        raise HTTPException(status_code=404, detail='Vendor not found')
    
    hashed = hash_password(creds.password)
    await db.vendors.update_one(
        {'id': vendor_id},
        {'$set': {'email': creds.email.lower(), 'password_hash': hashed}}
    )
    
    return {'message': 'Credentials created', 'email': creds.email}

@api_router.get('/vendors/{vendor_id}/qr')
async def generate_qr(vendor_id: str, user: dict = Depends(get_current_user)):
    vendor = await db.vendors.find_one({'id': vendor_id}, {'_id': 0})
    if not vendor:
        raise HTTPException(status_code=404, detail='Vendor not found')
    
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=4
    )
    landing = await _effective_landing_url(vendor)
    qr.add_data(landing or vendor['qr_url'])
    qr.make(fit=True)
    
    img = qr.make_image(fill_color='black', back_color='white')
    img = img.resize((800, 800))
    
    buf = BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type='image/png',
        headers={'Content-Disposition': f'attachment; filename=qr_{vendor_id}.png'}
    )

@api_router.post('/vendor-auth/login')
async def vendor_login(req: LoginRequest, request: Request, response: Response):
    await _enforce_login_rate_limit('vendor', req.email, request)
    vendor = await db.vendors.find_one({'email': req.email.lower()}, {'_id': 0})
    if not vendor or 'password_hash' not in vendor or not verify_password(req.password, vendor['password_hash']):
        await _record_login_attempt('vendor', req.email, request, success=False)
        raise HTTPException(status_code=401, detail='Credenziali non valide')
    await _record_login_attempt('vendor', req.email, request, success=True)

    token = create_vendor_token(vendor['id'], vendor['email'], vendor.get('token_version', 1))
    response.set_cookie(
        key='vendor_token',
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=86400,
        path='/'
    )
    
    vendor.pop('password_hash', None)
    # Enrich with the effective public landing URL so the vendor dashboard can
    # link "Vedi Pagina" to the org's custom domain (e.g. https://app.vdn.srl/v/giz)
    # instead of forging an URL on the platform admin host.
    vendor['landing_url'] = await _effective_landing_url(vendor)
    return vendor

@api_router.post('/vendor-auth/logout')
async def vendor_logout(response: Response):
    response.delete_cookie('vendor_token', path='/')
    return {'message': 'Logged out'}

@api_router.get('/vendor-auth/me')
async def get_vendor_me(vendor: dict = Depends(get_current_vendor)):
    vendor['landing_url'] = await _effective_landing_url(vendor)
    return vendor

@api_router.get('/vendor/stats')
async def get_vendor_stats(vendor: dict = Depends(get_current_vendor)):
    vendor_id = vendor['id']
    views = await db.analytics.count_documents({'vendor_id': vendor_id, 'event_type': 'page_view'})
    clicks = await db.analytics.count_documents({
        'vendor_id': vendor_id,
        'event_type': {'$in': CLICK_TYPES}
    })
    
    click_breakdown = {}
    for click_type in CLICK_TYPES:
        count = await db.analytics.count_documents({'vendor_id': vendor_id, 'event_type': click_type})
        click_breakdown[click_type] = count
    
    return {
        'views': views,
        'total_clicks': clicks,
        'click_breakdown': click_breakdown
    }

@api_router.put('/vendor/profile')
async def update_vendor_profile(vendor_update: VendorProfileUpdate, vendor: dict = Depends(get_current_vendor)):
    vendor_id = vendor['id']
    update_doc = {
        'name': vendor_update.name,
        'bio': vendor_update.bio or '',
        'profile_image_url': (vendor_update.profile_image_url or '').strip(),
        'profile_image_enabled': bool(vendor_update.profile_image_enabled),
    }
    await db.vendors.update_one({'id': vendor_id}, {'$set': update_doc})
    updated = await db.vendors.find_one({'id': vendor_id}, {'_id': 0})
    updated.pop('password_hash', None)
    return updated


@api_router.get('/config')
async def get_config(user: dict = Depends(require_super_admin)):
    config = await db.config.find_one({'type': 'deployment'}, {'_id': 0})
    defaults = DeployConfig().model_dump()
    if not config:
        return defaults
    # Ensure missing keys (for old docs) come back as defaults
    for k, v in defaults.items():
        config.setdefault(k, v)
    config.pop('type', None)
    return config

@api_router.put('/config')
async def update_config(config: DeployConfig, user: dict = Depends(require_super_admin)):
    # Use exclude_unset to only update fields explicitly provided by the client
    # (avoids overwriting tokens/secrets with empty defaults from the model)
    config_doc = config.model_dump(exclude_unset=True)
    config_doc['type'] = 'deployment'
    config_doc['updated_at'] = datetime.now(timezone.utc).isoformat()
    config_doc['updated_by'] = user.get('email', '')
    await db.config.update_one(
        {'type': 'deployment'},
        {'$set': config_doc},
        upsert=True
    )
    return {'message': 'Configuration updated'}


# ──────────────────────────────────────────────────────────────────
# Deploy operations (Fly.io + Vercel) — fully driven from dashboard
# ──────────────────────────────────────────────────────────────────
FLY_GQL_URL = 'https://api.fly.io/graphql'
FLY_MACHINES_API = 'https://api.machines.dev/v1'

async def _load_deploy_config() -> dict:
    cfg = await db.config.find_one({'type': 'deployment'}, {'_id': 0})
    return cfg or {}


async def _fly_graphql(token: str, query: str, variables: dict) -> dict:
    if not token:
        raise HTTPException(status_code=400, detail='Fly API Token mancante in Configurazione Deploy')
    async with httpx.AsyncClient(timeout=30.0) as c:
        r = await c.post(FLY_GQL_URL, headers={
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }, json={'query': query, 'variables': variables})
        try:
            data = r.json()
        except Exception:
            raise HTTPException(status_code=502, detail=f'Fly: risposta non valida ({r.status_code})')
        if r.status_code >= 400 or data.get('errors'):
            msg = data.get('errors', [{'message': r.text}])[0].get('message', 'errore Fly')
            raise HTTPException(status_code=502, detail=f'Fly: {msg}')
        return data.get('data', {})


def _collect_fly_secrets(cfg: dict) -> List[dict]:
    mapping = {
        'MONGO_URL': cfg.get('prod_mongo_url') or '',
        'DB_NAME': cfg.get('prod_db_name') or 'qrhub_db',
        'JWT_SECRET': cfg.get('prod_jwt_secret') or '',
        'SUPERADMIN_EMAIL': cfg.get('prod_superadmin_email') or '',
        'SUPERADMIN_PASSWORD': cfg.get('prod_superadmin_password') or '',
        'FRONTEND_URL': cfg.get('prod_frontend_url') or cfg.get('vercel_app_url') or '',
        'CORS_ORIGINS': cfg.get('prod_cors_origins') or cfg.get('vercel_app_url') or '*',
    }
    # Prefer single CLOUDINARY_URL if set, else fall back to 3 separate vars
    if (cfg.get('cloudinary_url') or '').startswith('cloudinary://'):
        mapping['CLOUDINARY_URL'] = cfg['cloudinary_url']
    else:
        mapping['CLOUDINARY_CLOUD_NAME'] = cfg.get('cloudinary_cloud_name') or ''
        mapping['CLOUDINARY_API_KEY'] = cfg.get('cloudinary_api_key') or ''
        mapping['CLOUDINARY_API_SECRET'] = cfg.get('cloudinary_api_secret') or ''
    return [{'key': k, 'value': v} for k, v in mapping.items() if v]


class FlyRedeployRequest(BaseModel):
    image_ref: Optional[str] = None  # optional override (e.g. registry.fly.io/app:tag)


class RotateCredsRequest(BaseModel):
    rotate_jwt: bool = True
    rotate_superadmin_password: bool = False
    new_superadmin_password: Optional[str] = None
    apply_to_fly: bool = True


def _random_secret(length: int = 32) -> str:
    import secrets as _s
    return _s.token_hex(length)


def _random_password(length: int = 16) -> str:
    import secrets as _s
    alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%-_'
    return ''.join(_s.choice(alphabet) for _ in range(length))


async def _uptime_target_url(cfg: dict) -> Optional[str]:
    base = (cfg.get('flyio_app_url') or '').rstrip('/')
    if not base and cfg.get('flyio_app_name'):
        base = f"https://{cfg['flyio_app_name']}.fly.dev"
    if not base:
        return None
    path = cfg.get('uptime_health_path') or '/api/auth/me'
    if not path.startswith('/'):
        path = '/' + path
    return base + path


async def _run_uptime_check(cfg: dict) -> Optional[dict]:
    url = await _uptime_target_url(cfg)
    if not url:
        return None
    t0 = datetime.now(timezone.utc)
    record = {
        'url': url, 'timestamp': t0.isoformat(),
        'status_code': 0, 'latency_ms': 0, 'up': False, 'error': ''
    }
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as c:
            r = await c.get(url)
        record['latency_ms'] = int((datetime.now(timezone.utc) - t0).total_seconds() * 1000)
        record['status_code'] = r.status_code
        # 2xx, 3xx and 401/403 mean backend is alive (auth required)
        record['up'] = (200 <= r.status_code < 400) or r.status_code in (401, 403)
    except Exception as e:
        record['error'] = str(e)[:300]
    await db.uptime_checks.insert_one(record.copy())
    # Cleanup older than 48h
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat()
    await db.uptime_checks.delete_many({'timestamp': {'$lt': cutoff}})
    record.pop('_id', None)
    return record


async def _uptime_loop():
    """Background loop. Reads config every cycle so changes apply live."""
    await asyncio.sleep(15)  # small startup delay
    while True:
        interval = 60
        try:
            cfg = await db.config.find_one({'type': 'deployment'}, {'_id': 0}) or {}
            interval = max(30, int(cfg.get('uptime_interval_sec') or 60))
            if cfg.get('uptime_enabled', True):
                await _run_uptime_check(cfg)
        except Exception as e:
            logger.warning(f'uptime loop error: {e}')
        await asyncio.sleep(interval)




app.include_router(api_router)

# Modular sub-routers (Feb 2026 refactor).
# Imported at the BOTTOM after all helpers/db/models are defined to avoid
# circular imports: routers/* do `from server import ...` and need those
# symbols to already exist.
from routers.deploy import router as _deploy_router  # noqa: E402
from routers.media import router as _media_router  # noqa: E402
from routers.analytics import router as _analytics_router  # noqa: E402

# Attach with the same /api prefix used by api_router
app.include_router(_deploy_router, prefix='/api')
app.include_router(_media_router, prefix='/api')
app.include_router(_analytics_router, prefix='/api')

# ──────────────────────────────────────────────────────────────────
# Open Graph / Twitter card preview pages for vendor landings.
# Social crawlers (WhatsApp, Telegram, FB, Twitter, LinkedIn, Slack, Discord, ...)
# don't execute JavaScript so they can't read the SPA's <title>. We expose a
# server-rendered HTML page at /og/v/:vendorId that contains the proper meta tags
# and an immediate redirect to the real SPA so humans landing here still see the
# normal landing page.
# Vercel rewrites bot User-Agents from /v/:id to this URL (see frontend/vercel.json).
# ──────────────────────────────────────────────────────────────────

def _build_og_html(vendor: dict, org: dict, request_url_base: str) -> str:
    """Render a minimal HTML page with OG/Twitter meta tags + redirect-to-SPA."""
    brand = (org.get('brand_name') or org.get('name') or 'QRHub').strip()
    vname = (vendor.get('name') or 'Contattami').strip()
    title = f'{vname} · {brand}'
    bio = (vendor.get('bio') or '').strip()
    description = bio or f'Contatta {vname} di {brand}. WhatsApp, recensioni, social — un tap e ci sei.'
    image_url = ''
    if vendor.get('profile_image_enabled') and vendor.get('profile_image_url'):
        image_url = vendor['profile_image_url']
    elif org.get('logo_url'):
        image_url = org['logo_url']

    # For social link previews on WhatsApp/Telegram we want a SMALL, square
    # thumbnail (rendered as a circle next to the link snippet) instead of the
    # big banner card. Both messengers fall back to "small thumbnail mode" when
    # the og:image is square AND under ~500px on each side.
    # If the image lives on Cloudinary we can synthesize a 400×400 face-centered
    # crop on-the-fly; otherwise we just hand over the original URL and trust
    # the client's resize logic.
    image_url_thumb = image_url
    if image_url and 'res.cloudinary.com' in image_url and '/upload/' in image_url and '/upload/w_' not in image_url:
        # Insert transformation segment right after the `/upload/` marker.
        # c_fill   = keep the face fully visible by cropping
        # g_face   = bias the crop toward the detected face when present
        # q_auto   = optimal quality
        # f_auto   = serve modern format (webp/avif) when supported
        image_url_thumb = image_url.replace(
            '/upload/', '/upload/w_400,h_400,c_fill,g_face,q_auto,f_auto/', 1
        )
    primary_color = org.get('primary_color') or '#F96815'
    landing_key = (vendor.get('slug') or '').strip() or vendor['id']
    spa_url = f"{request_url_base}/v/{landing_key}"

    e = html_lib.escape
    tags = [
        f'<title>{e(title)}</title>',
        f'<meta name="description" content="{e(description)}" />',
        f'<meta name="theme-color" content="{e(primary_color)}" />',
        '<meta property="og:type" content="profile" />',
        f'<meta property="og:title" content="{e(title)}" />',
        f'<meta property="og:description" content="{e(description)}" />',
        f'<meta property="og:url" content="{e(spa_url)}" />',
        f'<meta property="og:site_name" content="{e(brand)}" />',
        '<meta property="og:locale" content="it_IT" />',
        # `summary` (not `summary_large_image`) opts Twitter/X and similar
        # crawlers into the small-thumbnail layout that looks nice next to the
        # link instead of a big banner pretending to be hero content.
        '<meta name="twitter:card" content="summary" />',
        f'<meta name="twitter:title" content="{e(title)}" />',
        f'<meta name="twitter:description" content="{e(description)}" />',
    ]
    if image_url_thumb:
        tags += [
            f'<meta property="og:image" content="{e(image_url_thumb)}" />',
            '<meta property="og:image:width" content="400" />',
            '<meta property="og:image:height" content="400" />',
            f'<meta property="og:image:alt" content="{e(vname)}" />',
            f'<meta name="twitter:image" content="{e(image_url_thumb)}" />',
            f'<meta name="twitter:image:alt" content="{e(vname)}" />',
        ]
    meta_block = '\n  '.join(tags)
    redirect_target = e(spa_url)
    return f'''<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  {meta_block}
  <link rel="canonical" href="{redirect_target}" />
  <meta http-equiv="refresh" content="0; url={redirect_target}" />
  <script>window.location.replace("{redirect_target}");</script>
</head>
<body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#fff;color:#111;padding:24px;text-align:center">
  <h1 style="margin:0 0 8px;font-size:20px">{e(title)}</h1>
  <p style="margin:0 0 16px;color:#555">{e(description)}</p>
  <p><a href="{redirect_target}" style="color:{e(primary_color)};font-weight:600;text-decoration:none">Apri la landing &rarr;</a></p>
</body>
</html>'''


def _cloudinary_resize(url: str, size: int) -> str:
    """Inject a Cloudinary `c_pad,b_white,w_X,h_X` transform into a delivery
    URL so the PWA icon is served at the exact pixel size the manifest
    declares. Falls back to the raw URL if it isn't a Cloudinary one."""
    if not url or '/upload/' not in url or 'res.cloudinary.com' not in url:
        return url
    transform = f"c_pad,b_white,w_{size},h_{size},f_png"
    return url.replace('/upload/', f"/upload/{transform}/", 1)


@app.get('/api/manifest/v/{vendor_id}')
async def vendor_manifest(vendor_id: str):
    """Per-vendor PWA manifest. Lets the org show its own icon when a visitor
    saves the landing as an app on their phone home screen (instead of the
    QRHub default favicon)."""
    vendor = await _resolve_vendor_doc(vendor_id)
    if not vendor:
        raise HTTPException(status_code=404, detail='Vendor not found')
    org = {}
    if vendor.get('organization_id'):
        org = await db.organizations.find_one(
            {'id': vendor['organization_id']},
            {'_id': 0, 'brand_name': 1, 'name': 1, 'primary_color': 1,
             'pwa_icon_url': 1, 'logo_url': 1}
        ) or {}
    icon_url = (org.get('pwa_icon_url') or '').strip() or (org.get('logo_url') or '').strip()
    brand = (org.get('brand_name') or '').strip() or (org.get('name') or '').strip() or 'QRHub'
    landing_key = (vendor.get('slug') or '').strip() or vendor['id']
    manifest = {
        'name': f"{brand} · {vendor.get('name', '')}".strip(' ·'),
        'short_name': vendor.get('name', '') or brand,
        'start_url': f"/v/{landing_key}",
        'scope': f"/v/{landing_key}",
        'display': 'standalone',
        'background_color': '#ffffff',
        'theme_color': org.get('primary_color') or '#F96815',
        'icons': [],
    }
    if icon_url:
        # Provide both 192 and 512 — Android requires at least these two sizes
        # to honour the icon (otherwise it falls back to a generated globe).
        manifest['icons'] = [
            {'src': _cloudinary_resize(icon_url, 192), 'sizes': '192x192',
             'type': 'image/png', 'purpose': 'any'},
            {'src': _cloudinary_resize(icon_url, 512), 'sizes': '512x512',
             'type': 'image/png', 'purpose': 'any'},
            {'src': _cloudinary_resize(icon_url, 512), 'sizes': '512x512',
             'type': 'image/png', 'purpose': 'maskable'},
        ]
    return JSONResponse(content=manifest, headers={'Cache-Control': 'public, max-age=300'})




# iOS Splash Screen sizes (portrait). These 8 cover ~99% of in-use iPhones
# (2019-2024). iOS picks the matching one via the apple-touch-startup-image
# media query at PWA launch time.
IOS_SPLASH_SIZES = [
    # (pixel_w, pixel_h, css_w, css_h, ratio, label)
    (640,  1136, 320, 568, 2, 'iPhone SE / 8'),
    (750,  1334, 375, 667, 2, 'iPhone 8 Plus'),
    (828,  1792, 414, 896, 2, 'iPhone XR / 11'),
    (1125, 2436, 375, 812, 3, 'iPhone X / XS / 11 Pro / 12 mini / 13 mini'),
    (1170, 2532, 390, 844, 3, 'iPhone 12 / 13 / 14'),
    (1179, 2556, 393, 852, 3, 'iPhone 14 Pro / 15 / 15 Pro'),
    (1242, 2688, 414, 896, 3, 'iPhone XS Max / 11 Pro Max'),
    (1290, 2796, 430, 932, 3, 'iPhone 14 Pro Max / 15 Pro Max / 16 Pro Max'),
]


async def _fetch_image_bytes(url: str) -> bytes | None:
    if not url:
        return None
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as c:
            r = await c.get(url)
            if r.status_code == 200 and r.content:
                return r.content
    except Exception:
        pass
    return None


def _render_splash_png(width: int, height: int, icon_bytes: bytes | None,
                       brand_hex: str, brand_name: str) -> bytes:
    """Build a single iOS splash PNG: solid brand-colored background with the
    org icon centered. Pure Pillow — no external service dependency."""
    from PIL import Image, ImageDraw
    # Background
    try:
        from PIL import ImageColor
        bg = ImageColor.getrgb(brand_hex or '#ffffff')
    except Exception:
        bg = (255, 255, 255)
    # Use white background for light bg, brand color stays as-is
    img = Image.new('RGB', (width, height), bg)
    # Center the icon at ~38% of the shorter side, with a soft rounded "card"
    if icon_bytes:
        try:
            icon = Image.open(BytesIO(icon_bytes)).convert('RGBA')
            short_side = min(width, height)
            target = int(short_side * 0.38)
            # Preserve square ratio for the icon canvas
            icon_ratio = icon.width / icon.height if icon.height else 1
            if icon_ratio >= 1:
                new_w = target
                new_h = int(target / icon_ratio)
            else:
                new_h = target
                new_w = int(target * icon_ratio)
            icon = icon.resize((new_w, new_h), Image.LANCZOS)
            # Paste centered using alpha channel
            paste_x = (width - new_w) // 2
            paste_y = (height - new_h) // 2
            img.paste(icon, (paste_x, paste_y), icon)
        except Exception:
            pass
    else:
        # Fallback: render the brand initial in white
        try:
            draw = ImageDraw.Draw(img)
            initial = (brand_name or 'Q').strip()[:1].upper()
            # System font fallback (Pillow doesn't ship custom fonts)
            from PIL import ImageFont
            font_size = max(40, min(width, height) // 4)
            try:
                font = ImageFont.truetype(
                    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
                    font_size,
                )
            except Exception:
                font = ImageFont.load_default()
            bbox = draw.textbbox((0, 0), initial, font=font)
            tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
            draw.text(((width - tw) / 2 - bbox[0],
                       (height - th) / 2 - bbox[1]),
                      initial, fill='white', font=font)
        except Exception:
            pass
    buf = BytesIO()
    img.save(buf, format='PNG', optimize=True)
    return buf.getvalue()


@app.get('/api/splash/v/{vendor_id}/{size}.png')
async def vendor_splash(vendor_id: str, size: str):
    """Per-vendor iOS PWA splash screen.

    `size` is `WxH` (e.g. `1170x2532`). Only sizes in IOS_SPLASH_SIZES are
    accepted so we can't be abused as a free image transformer.
    """
    try:
        w_str, h_str = size.lower().split('x', 1)
        width = int(w_str)
        height = int(h_str)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail='Invalid size')
    if not any(s[0] == width and s[1] == height for s in IOS_SPLASH_SIZES):
        raise HTTPException(status_code=400, detail='Unsupported splash size')

    vendor = await _resolve_vendor_doc(vendor_id)
    if not vendor:
        raise HTTPException(status_code=404, detail='Vendor not found')
    org = {}
    if vendor.get('organization_id'):
        org = await db.organizations.find_one(
            {'id': vendor['organization_id']},
            {'_id': 0, 'pwa_icon_url': 1, 'logo_url': 1,
             'primary_color': 1, 'brand_name': 1, 'name': 1}
        ) or {}
    icon_url = (org.get('pwa_icon_url') or '').strip() or (org.get('logo_url') or '').strip()
    brand_hex = (org.get('primary_color') or '#ffffff').strip() or '#ffffff'
    brand_name = (org.get('brand_name') or '').strip() or (org.get('name') or '').strip() or 'QRHub'

    # Pre-resize via Cloudinary to keep our render cheap (avoid downloading a
    # 4MB original when we only need it at ~38% splash size).
    if icon_url and 'res.cloudinary.com' in icon_url and '/upload/' in icon_url:
        target_side = int(min(width, height) * 0.5)
        icon_url = icon_url.replace(
            '/upload/',
            f"/upload/c_pad,b_white,w_{target_side},h_{target_side},f_png/",
            1,
        )
    icon_bytes = await _fetch_image_bytes(icon_url)

    png = await asyncio.to_thread(
        _render_splash_png, width, height, icon_bytes, brand_hex, brand_name,
    )
    return FastAPIResponse(
        content=png,
        media_type='image/png',
        headers={'Cache-Control': 'public, max-age=86400'},  # 24h
    )




@app.get('/og/v/{vendor_id}', response_class=HTMLResponse)
async def og_vendor_preview(vendor_id: str, request: Request):
    """Server-rendered preview page consumed by social-media crawlers."""
    frontend_url = os.environ.get('FRONTEND_URL', 'https://qrhub-app.vercel.app').rstrip('/')
    vendor = await _resolve_vendor_doc(vendor_id)
    if not vendor:
        empty_vendor = {'id': vendor_id, 'name': 'Contattami', 'bio': '', 'profile_image_enabled': False}
        empty_org = {'brand_name': 'QRHub', 'primary_color': '#F96815'}
        return HTMLResponse(_build_og_html(empty_vendor, empty_org, frontend_url), status_code=200)
    org = {}
    if vendor.get('organization_id'):
        org = await db.organizations.find_one(
            {'id': vendor['organization_id']},
            {'_id': 0, 'name': 1, 'brand_name': 1, 'primary_color': 1, 'logo_url': 1}
        ) or {}
    html = _build_og_html(vendor, org, frontend_url)
    return HTMLResponse(
        content=html,
        status_code=200,
        headers={
            'Cache-Control': 'public, max-age=300, s-maxage=3600',
            'X-Robots-Tag': 'noindex',
        },
    )


cors_origins = os.environ.get('CORS_ORIGINS', '*')
if cors_origins == '*':
    cors_origins = [os.environ.get('FRONTEND_URL', 'http://localhost:3000')]
else:
    cors_origins = cors_origins.split(',')

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins,
    allow_methods=['*'],
    allow_headers=['*']
)


# ──────────────────────────────────────────────────────────────────
# GDPR M2 — Security headers middleware (HSTS, CSP, anti-clickjack, anti-MIME-sniff)
# ──────────────────────────────────────────────────────────────────
@app.middleware('http')
async def _security_headers(request: Request, call_next):
    response = await call_next(request)
    # HTTPS Strict Transport Security — only emit when behind HTTPS (Fly/Vercel always are)
    response.headers.setdefault('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    # Block iframing entirely → eliminates clickjacking
    response.headers.setdefault('X-Frame-Options', 'DENY')
    # Disable MIME sniffing
    response.headers.setdefault('X-Content-Type-Options', 'nosniff')
    # Strict referrer leakage policy
    response.headers.setdefault('Referrer-Policy', 'strict-origin-when-cross-origin')
    # Restrict legacy browser features we don't use
    response.headers.setdefault(
        'Permissions-Policy',
        'geolocation=(), microphone=(), camera=(), payment=(), usb=(), interest-cohort=()'
    )
    # Baseline CSP — frame-ancestors is the modern replacement of X-Frame-Options.
    # API responses are JSON so script-src is irrelevant; we keep it permissive enough
    # to not block static asset paths under /uploads.
    response.headers.setdefault(
        'Content-Security-Policy',
        "default-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    )
    return response

@app.on_event('startup')
async def seed_admin():
    # 1. Create super_admin if not exists.
    # IMPORTANT: no hardcoded default password — server will skip the seed if
    # SUPERADMIN_PASSWORD is not set in the environment. Forces an explicit
    # secret on first boot.
    SUPERADMIN_EMAIL = os.environ.get('SUPERADMIN_EMAIL', 'superadmin@qrhub.it')
    SUPERADMIN_PASSWORD = os.environ.get('SUPERADMIN_PASSWORD', '')

    super_admin = await db.users.find_one({'role': 'super_admin'})
    if not super_admin:
        if not SUPERADMIN_PASSWORD:
            logger.warning(
                'SECURITY: SUPERADMIN_PASSWORD not set — skipping super-admin seed. '
                'Set SUPERADMIN_PASSWORD in the environment and restart to bootstrap.'
            )
        else:
            await db.users.insert_one({
                'email': SUPERADMIN_EMAIL,
                'password_hash': hash_password(SUPERADMIN_PASSWORD),
                'name': 'Super Admin',
                'role': 'super_admin',
                'organization_id': None,
                'created_at': datetime.now(timezone.utc).isoformat()
            })
            logger.info(f'Super admin created: {_redact_email(SUPERADMIN_EMAIL)}')
    
    # 2. Auto-migrate: create default org if none exists, attach legacy data to it
    org_count = await db.organizations.count_documents({})
    if org_count == 0:
        default_org_id = str(ObjectId())
        await db.organizations.insert_one({
            'id': default_org_id,
            'name': 'Organizzazione Demo',
            'slug': 'demo',
            'brand_name': 'Demo',
            'primary_color': '#F96815',
            'logo_url': '',
            'logo_public_id': '',
            'allowed_domains': [],
            'created_at': datetime.now(timezone.utc).isoformat()
        })
        # Migrate all legacy data to default org
        await db.users.update_many(
            {'role': {'$ne': 'super_admin'}, 'organization_id': {'$in': [None, '']}},
            {'$set': {'organization_id': default_org_id, 'role': 'org_admin'}}
        )
        await db.stores.update_many({'organization_id': {'$exists': False}}, {'$set': {'organization_id': default_org_id}})
        await db.vendors.update_many({'organization_id': {'$exists': False}}, {'$set': {'organization_id': default_org_id}})
        await db.posts.update_many({'organization_id': {'$exists': False}}, {'$set': {'organization_id': default_org_id}})
        await db.files.update_many({'organization_id': {'$exists': False}}, {'$set': {'organization_id': default_org_id}})
        logger.info(f'Default organization created and legacy data migrated: {default_org_id}')

    # 2c. Idempotent backfill: ensure every org has the default GDPR copy. We
    # only touch orgs where the field is missing or empty, so manually-edited
    # texts are preserved.
    try:
        backfill = await db.organizations.update_many(
            {'$or': [{'data_profiling_text': {'$exists': False}}, {'data_profiling_text': ''}]},
            {'$set': {'data_profiling_text': DEFAULT_PROFILING_TEXT_IT}}
        )
        backfill2 = await db.organizations.update_many(
            {'$or': [{'terms_text': {'$exists': False}}, {'terms_text': ''}]},
            {'$set': {'terms_text': DEFAULT_TERMS_TEXT_IT}}
        )
        if backfill.modified_count or backfill2.modified_count:
            logger.info(
                f'GDPR copy backfill: profiling={backfill.modified_count}, terms={backfill2.modified_count}'
            )
    except Exception as e:
        logger.warning(f'GDPR copy backfill skipped: {e}')

    # 2b. One-time anonymization: rename any legacy "VDN" / "vdn" / "WindTre" branded org to generic "Demo"
    try:
        await db.organizations.update_many(
            {'$or': [
                {'name': {'$in': ['VDN', 'VDN SRL', 'WindTre', 'WINDTRE']}},
                {'slug': 'vdn'},
                {'brand_name': {'$in': ['VDN', 'WindTre', 'WINDTRE']}}
            ]},
            {'$set': {'name': 'Organizzazione Demo', 'slug': 'demo', 'brand_name': 'Demo'}}
        )
    except Exception as _e:
        logger.warning(f'Org anonymization skipped: {_e}')

    # 3. Legacy ADMIN_EMAIL seed removed (Feb 2026). Org-admins are now provisioned
    # exclusively from the in-app "Modifica utenti" panel — no env-driven seed.

    # Anonymize legacy user display name "Admin VDN"
    try:
        await db.users.update_many(
            {'name': {'$in': ['Admin VDN', 'Admin VDN SRL']}},
            {'$set': {'name': 'Org Admin'}}
        )
    except Exception:
        pass

    # Local-only credential reminder file (gitignored). DOES NOT contain real passwords:
    # only the env-var names where the operator stored them. This keeps test_credentials.md
    # useful for testing agents while never persisting plaintext secrets on disk.
    Path('/app/memory').mkdir(exist_ok=True)
    try:
        with open('/app/memory/test_credentials.md', 'w') as f:
            f.write(
                '# Test Credentials (env-driven — passwords NOT stored here)\n\n'
                '## Super Admin (QRHub Platform)\n'
                f'- Email: {SUPERADMIN_EMAIL}\n'
                '- Password: see env var `SUPERADMIN_PASSWORD` (in `backend/.env`)\n'
                '- Role: super_admin\n\n'
                '_Note: org-admins are provisioned from the in-app "Modifica utenti" panel — no env-driven seed._\n\n'
                '## API Endpoints\n'
                '- POST /api/auth/login\n'
                '- GET /api/auth/me\n'
                '- POST /api/auth/logout\n'
                '- GET /api/organizations (super admin)\n'
                '- GET /api/my-organization (any logged-in user)\n'
            )
    except Exception as _e:
        logger.warning(f'Could not refresh /app/memory/test_credentials.md: {_e}')

    # Media library backfill — older db.files rows are missing `kind` (added Feb 2026).
    # Derive it from the Cloudinary folder path so existing uploads show up in the picker.
    try:
        legacy = db.files.find({'kind': {'$exists': False}}, {'_id': 1, 'folder': 1})
        async for f in legacy:
            folder = (f.get('folder') or '')
            kind = 'posts' if '/posts' in folder else 'uploads'
            await db.files.update_one({'_id': f['_id']}, {'$set': {'kind': kind}})
    except Exception as _e:
        logger.warning(f'media library backfill skipped: {_e}')

    # Vendor custom slug index — unique only for non-empty values. Allows multiple
    # vendors with no slug (backward compat) while preventing slug collisions.
    try:
        await db.vendors.create_index(
            'slug',
            unique=True,
            partialFilterExpression={'slug': {'$type': 'string', '$gt': ''}},
            name='vendors_slug_unique_nonempty',
        )
    except Exception as _e:
        logger.warning(f'vendors.slug index skipped: {_e}')
    
    # One-shot migration: legacy single-post on Store -> posts collection entry
    try:
        legacy_stores = await db.stores.find(
            {'$or': [
                {'post_title': {'$nin': ['', None]}},
                {'post_text': {'$nin': ['', None]}},
                {'post_media_url': {'$nin': ['', None]}}
            ]},
            {'_id': 0}
        ).to_list(1000)
        for s in legacy_stores:
            existing = await db.posts.count_documents({'store_id': s['id']})
            if existing > 0:
                continue  # already migrated/has posts
            if s.get('post_title') or s.get('post_text') or s.get('post_media_url'):
                migrated = {
                    'id': str(ObjectId()),
                    'store_id': s['id'],
                    'title': s.get('post_title', '') or '',
                    'text': s.get('post_text', '') or '',
                    'media_url': s.get('post_media_url', '') or '',
                    'media_public_id': s.get('post_media_public_id', '') or '',
                    'media_resource_type': '',
                    'aspect_ratio': None,
                    'cta_text': s.get('post_cta_text', '') or '',
                    'cta_whatsapp_message': s.get('post_whatsapp_message', '') or '',
                    'position': 0,
                    'created_at': s.get('created_at', datetime.now(timezone.utc).isoformat())
                }
                await db.posts.insert_one(migrated)
                logger.info(f"Migrated legacy post for store {s['id']}")
    except Exception as e:
        logger.warning(f'Legacy post migration skipped: {e}')

    # Privacy scrub: remove any IP/user_agent from old analytics events
    try:
        scrub = await db.analytics.update_many(
            {'$or': [{'ip': {'$exists': True}}, {'user_agent': {'$exists': True}}]},
            {'$unset': {'ip': '', 'user_agent': ''}}
        )
        if scrub.modified_count:
            logger.info(f'Privacy: scrubbed IP/UA from {scrub.modified_count} legacy analytics events')
        # geo_cache GDPR migration: drop all legacy rows that still hold the raw IP as key.
        # New rows are keyed by anonymized subnet (/24 IPv4, /48 IPv6) and rebuilt lazily.
        legacy_geo = await db.geo_cache.delete_many({'ip': {'$exists': True}})
        if legacy_geo.deleted_count:
            logger.info(f'Privacy: dropped {legacy_geo.deleted_count} legacy geo_cache rows with raw IP')
        # Time-based rotation for new (anonymized) cache rows: keep max 7 days
        cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        await db.geo_cache.delete_many({'cached_at': {'$lt': cutoff}})
        # GDPR M3 — Retention cap on analytics events: 365 days (well past any business need).
        ANALYTICS_RETENTION_DAYS = int(os.environ.get('ANALYTICS_RETENTION_DAYS', '365'))
        old_cutoff = (datetime.now(timezone.utc) - timedelta(days=ANALYTICS_RETENTION_DAYS)).isoformat()
        purged = await db.analytics.delete_many({'timestamp': {'$lt': old_cutoff}})
        if purged.deleted_count:
            logger.info(f'Retention: purged {purged.deleted_count} analytics events older than {ANALYTICS_RETENTION_DAYS}d')
        # GDPR M3 — Bound login_attempts so it never grows: drop anything older than 4× window.
        la_cutoff = (datetime.now(timezone.utc) - timedelta(seconds=LOGIN_WINDOW_SEC * 4)).isoformat()
        await db.login_attempts.delete_many({'ts': {'$lt': la_cutoff}})
    except Exception as e:
        logger.warning(f'Privacy scrub skipped: {e}')

    # Spawn uptime monitoring background task
    asyncio.create_task(_uptime_loop())
    logger.info('Uptime monitor started')

@app.on_event('shutdown')
async def shutdown_db_client():
    client.close()