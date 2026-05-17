from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Header, UploadFile, File, Form
from fastapi.responses import StreamingResponse, Response as FastAPIResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
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
ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'admin@example.com')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'admin123')

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

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class VendorCreate(BaseModel):
    name: str
    bio: Optional[str] = ''
    store_id: str

class VendorUpdate(BaseModel):
    name: str
    bio: Optional[str] = ''
    store_id: str


class VendorProfileUpdate(BaseModel):
    """Self-update from the vendor's own dashboard."""
    name: str
    bio: Optional[str] = ''
    profile_image_url: Optional[str] = ''
    profile_image_enabled: Optional[bool] = False

class StoreCreate(BaseModel):
    name: str
    whatsapp: Optional[str] = ''
    whatsapp_message: Optional[str] = ''
    instagram: Optional[str] = ''
    facebook: Optional[str] = ''
    tiktok: Optional[str] = ''
    google_review: Optional[str] = ''
    google_maps_url: Optional[str] = ''
    post_title: Optional[str] = ''
    post_text: Optional[str] = ''
    post_media_url: Optional[str] = ''
    post_cta_text: Optional[str] = ''
    post_whatsapp_message: Optional[str] = ''

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
    post_title: str = ''
    post_text: str = ''
    post_media_url: str = ''
    post_cta_text: str = ''
    post_whatsapp_message: str = ''
    created_at: str

class VendorCredentials(BaseModel):
    email: EmailStr
    password: str


class OrganizationCreate(BaseModel):
    name: str
    slug: Optional[str] = ''  # URL-safe id
    brand_name: Optional[str] = ''
    primary_color: Optional[str] = '#F96815'
    logo_url: Optional[str] = ''
    logo_public_id: Optional[str] = ''
    allowed_domains: Optional[List[str]] = []


class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    brand_name: Optional[str] = None
    primary_color: Optional[str] = None
    logo_url: Optional[str] = None
    logo_public_id: Optional[str] = None
    allowed_domains: Optional[List[str]] = None
    cookie_banner_enabled: Optional[bool] = None
    cookie_banner_text: Optional[str] = None
    cookie_banner_link: Optional[str] = None
    # GDPR — controller (titolare del trattamento) info shown on /v/:vendorId/privacy
    legal_name: Optional[str] = None
    vat_number: Optional[str] = None
    legal_address: Optional[str] = None
    privacy_contact_email: Optional[str] = None
    privacy_policy_url: Optional[str] = None


class OrgUserCreate(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = ''
    organization_id: str

class VendorResponse(BaseModel):
    id: str
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
    prod_admin_email: Optional[str] = ''
    prod_admin_password: Optional[str] = ''
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
    
    update_doc = {
        'name': store.name,
        'whatsapp': store.whatsapp or '',
        'whatsapp_message': store.whatsapp_message or '',
        'instagram': store.instagram or '',
        'facebook': store.facebook or '',
        'tiktok': store.tiktok or '',
        'google_review': store.google_review or '',
        'google_maps_url': store.google_maps_url or '',
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
        # GDPR controller info
        'legal_name': o.get('legal_name', '') or '',
        'vat_number': o.get('vat_number', '') or '',
        'legal_address': o.get('legal_address', '') or '',
        'privacy_contact_email': o.get('privacy_contact_email', '') or '',
        'privacy_policy_url': o.get('privacy_policy_url', '') or '',
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
        # GDPR status per org (super admin view)
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
            'dpa_status': ('accepted' if admins_total > 0 and admins_accepted == admins_total
                            else ('partial' if admins_accepted > 0 else 'pending')),
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
        update['name'] = payload.name
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


def _format_domain_record(vercel_resp: dict, organization_id: str, fallback_name: str = '') -> dict:
    """Normalize Vercel domain response into a compact record for the UI."""
    name = vercel_resp.get('name') or fallback_name
    apex = vercel_resp.get('apexName') or name
    is_subdomain = name != apex
    return {
        'organization_id': organization_id,
        'domain': name,
        'apex': apex,
        'verified': bool(vercel_resp.get('verified', False)),
        'verification': vercel_resp.get('verification') or [],
        'created_at': vercel_resp.get('createdAt'),
        'dns_instructions': {
            'type': 'CNAME' if is_subdomain else 'A',
            'host': name.split('.')[0] if is_subdomain else '@',
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
    await db.vercel_domains.update_one(
        {'organization_id': org_id, 'domain': domain},
        {'$set': record},
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

@api_router.post('/upload')
async def upload_file(file: UploadFile = File(...), folder: str = Form('uploads'), user: dict = Depends(get_current_user)):
    allowed_types = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail='Tipo file non supportato')
    
    if folder not in ('uploads', 'posts'):
        folder = 'uploads'

    # GDPR M1 — tenant isolation: prefix Cloudinary folder with org id so different
    # tenants land in disjoint namespaces. Super admin uploads (no organization_id)
    # go to a shared 'platform' folder. The Cloudinary public_id itself remains a
    # long UUID-based string so direct guessing is not feasible either way.
    org_id = (user.get('organization_id') or '').strip() if not _is_super_admin(user) else ''
    cl_folder = f'org_{org_id}/{folder}' if org_id else f'platform/{folder}'

    content = await file.read()

    if CLOUDINARY_ENABLED:
        # Upload to Cloudinary
        is_video = file.content_type.startswith('video/')
        try:
            result = cloudinary.uploader.upload(
                content,
                resource_type='video' if is_video else 'image',
                folder=cl_folder,
                use_filename=True,
                unique_filename=True,
                overwrite=False
            )
            # Probe basic dimensions for aspect-ratio hints
            doc = {
                'public_id': result.get('public_id', ''),
                'url': result.get('secure_url', ''),
                'resource_type': result.get('resource_type', 'image'),
                'format': result.get('format', ''),
                'width': result.get('width'),
                'height': result.get('height'),
                'bytes': result.get('bytes', 0),
                'folder': cl_folder,
                'organization_id': user.get('organization_id'),
                'original_filename': file.filename,
                'created_at': datetime.now(timezone.utc).isoformat(),
                'uploaded_by': user.get('email', '')
            }
            await db.files.insert_one(doc.copy())
            doc.pop('_id', None)
            return {'url': doc['url'], 'public_id': doc['public_id'],
                    'width': doc.get('width'), 'height': doc.get('height'),
                    'resource_type': doc['resource_type']}
        except Exception as e:
            logger.error(f'Cloudinary upload failed: {e}')
            raise HTTPException(status_code=500, detail=f'Errore Cloudinary: {str(e)}')
    
    # Fallback: local storage
    ext = file.filename.split('.')[-1] if '.' in file.filename else 'bin'
    filename = f"{uuid.uuid4()}.{ext}"
    file_path = UPLOAD_DIR / filename
    async with aiofiles.open(file_path, 'wb') as f:
        await f.write(content)
    frontend_url = os.environ.get('FRONTEND_URL', os.environ.get('REACT_APP_BACKEND_URL', 'http://localhost:8001'))
    file_url = f"{frontend_url}/uploads/{filename}"
    return {'url': file_url, 'filename': filename, 'public_id': filename}


@api_router.get('/files')
async def list_files(skip: int = 0, limit: int = 24, folder: Optional[str] = None,
                     orphans_only: bool = False, user: dict = Depends(get_current_user)):
    """List uploaded files (admin file manager). Marks orphans = files not referenced by any post."""
    q = _tenant_filter(user)
    if folder:
        q['folder'] = folder
    
    total = await db.files.count_documents(q)
    files = await db.files.find(q, {'_id': 0}).sort('created_at', -1).skip(skip).limit(limit).to_list(limit)
    
    # Determine in-use public_ids from posts
    in_use_set = set()
    async for p in db.posts.find({}, {'_id': 0, 'media_public_id': 1}):
        if p.get('media_public_id'):
            in_use_set.add(p['media_public_id'])
    # Also include legacy store post media
    async for s in db.stores.find({'post_media_url': {'$ne': ''}}, {'_id': 0, 'post_media_url': 1, 'post_media_public_id': 1}):
        if s.get('post_media_public_id'):
            in_use_set.add(s['post_media_public_id'])
    
    enriched = []
    for f in files:
        f['in_use'] = f.get('public_id', '') in in_use_set
        enriched.append(f)
    
    if orphans_only:
        enriched = [f for f in enriched if not f['in_use']]
    
    return {'files': enriched, 'total': total, 'skip': skip, 'limit': limit}


@api_router.delete('/files/{public_id:path}')
async def delete_file(public_id: str, user: dict = Depends(get_current_user)):
    f = await db.files.find_one(_tenant_filter(user, {'public_id': public_id}), {'_id': 0})
    if not f:
        raise HTTPException(status_code=404, detail='File non trovato')
    
    if CLOUDINARY_ENABLED:
        try:
            cloudinary.uploader.destroy(public_id, resource_type=f.get('resource_type', 'image'), invalidate=True)
        except Exception as e:
            logger.warning(f'Cloudinary destroy failed for {public_id}: {e}')
    else:
        # Local file
        try:
            (UPLOAD_DIR / public_id).unlink(missing_ok=True)
        except Exception:
            pass
    
    await db.files.delete_one({'public_id': public_id})
    # Detach from any posts that referenced this
    await db.posts.update_many(
        {'media_public_id': public_id},
        {'$set': {'media_url': '', 'media_public_id': '', 'media_resource_type': '', 'aspect_ratio': None}}
    )
    return {'message': 'File eliminato', 'public_id': public_id}


class BulkDeleteRequest(BaseModel):
    public_ids: List[str]


@api_router.post('/files/bulk-delete')
async def bulk_delete_files(req: BulkDeleteRequest, user: dict = Depends(get_current_user)):
    deleted = 0
    failed = []
    for pid in req.public_ids:
        try:
            f = await db.files.find_one(_tenant_filter(user, {'public_id': pid}), {'_id': 0})
            if not f:
                failed.append({'public_id': pid, 'reason': 'not_found'})
                continue
            if CLOUDINARY_ENABLED:
                try:
                    cloudinary.uploader.destroy(pid, resource_type=f.get('resource_type', 'image'), invalidate=True)
                except Exception as e:
                    logger.warning(f'Cloudinary destroy failed for {pid}: {e}')
            await db.files.delete_one({'public_id': pid})
            await db.posts.update_many(
                {'media_public_id': pid},
                {'$set': {'media_url': '', 'media_public_id': '', 'media_resource_type': '', 'aspect_ratio': None}}
            )
            deleted += 1
        except Exception as e:
            failed.append({'public_id': pid, 'reason': str(e)})
    return {'deleted': deleted, 'failed': failed}

@api_router.get('/vendors', response_model=List[VendorResponse])
async def get_vendors(user: dict = Depends(get_current_user)):
    vendors = await db.vendors.find(_tenant_filter(user), {'_id': 0}).to_list(1000)
    for v in vendors:
        analytics = await db.analytics.count_documents({'vendor_id': v['id'], 'event_type': 'page_view'})
        v['total_views'] = analytics
        v.setdefault('tiktok', '')
        v.setdefault('google_maps_url', '')
        v['has_credentials'] = bool(v.get('password_hash'))
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
    qr_url = f"{frontend_url}/v/{vendor_id}"
    
    vendor_doc = {
        'id': vendor_id,
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
         'privacy_contact_email': 1, 'privacy_policy_url': 1}
    ) or {}
    # GDPR M-bonus — completeness flag for public "trust badge".
    required_fields = ('legal_name', 'vat_number', 'legal_address', 'privacy_contact_email')
    has_all_required = all((org.get(k) or '').strip() for k in required_fields)
    has_optional = bool((org.get('privacy_policy_url') or '').strip())
    return {
        'vendor': {'id': vendor['id'], 'name': vendor.get('name', '')},
        'organization': {
            'brand_name': org.get('brand_name', '') or org.get('name', ''),
            'primary_color': org.get('primary_color', '#F96815'),
            'logo_url': org.get('logo_url', ''),
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


@api_router.get('/vendors/{vendor_id}')
async def get_vendor_public(vendor_id: str):
    vendor = await db.vendors.find_one({'id': vendor_id}, {'_id': 0})
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
    # Strip multi-tenant internal field
    vendor.pop('organization_id', None)
    # Include organization branding (lightweight)
    org_id = await db.vendors.find_one({'id': vendor_id}, {'_id': 0, 'organization_id': 1})
    if org_id and org_id.get('organization_id'):
        org = await db.organizations.find_one(
            {'id': org_id['organization_id']},
            {'_id': 0, 'brand_name': 1, 'primary_color': 1, 'logo_url': 1,
              'cookie_banner_enabled': 1, 'cookie_banner_text': 1, 'cookie_banner_link': 1,
              'legal_name': 1, 'vat_number': 1, 'legal_address': 1,
              'privacy_contact_email': 1, 'privacy_policy_url': 1}
        )
        if org:
            required_fields = ('legal_name', 'vat_number', 'legal_address', 'privacy_contact_email')
            has_all_required = all((org.get(k) or '').strip() for k in required_fields)
            has_optional = bool((org.get('privacy_policy_url') or '').strip())
            vendor['organization'] = {
                'brand_name': org.get('brand_name', ''),
                'primary_color': org.get('primary_color', '#F96815'),
                'logo_url': org.get('logo_url', ''),
                'cookie_banner': {
                    # Post-GDPR audit: banner is always-on for transparency (art. 13).
                    # The flag is kept for backwards compat but no longer hides the banner;
                    # it just toggles whether the org's custom text is used vs the default.
                    'enabled': True,
                    'use_custom_text': bool(org.get('cookie_banner_enabled', False)),
                    'text': org.get('cookie_banner_text', '') or '',
                    'link': org.get('cookie_banner_link', '') or ''
                },
                'has_privacy_info': bool(
                    org.get('legal_name') or org.get('vat_number') or org.get('privacy_contact_email')
                ),
                'gdpr_status': {
                    'controller_verified': has_all_required,
                    'completeness': 'complete' if has_all_required and has_optional
                                      else ('verified' if has_all_required else 'incomplete'),
                },
            }
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
    
    await db.vendors.update_one({'id': vendor_id}, {'$set': update_doc})
    updated = await db.vendors.find_one({'id': vendor_id}, {'_id': 0})
    analytics = await db.analytics.count_documents({'vendor_id': vendor_id, 'event_type': 'page_view'})
    updated['total_views'] = analytics
    return VendorResponse(**updated)

@api_router.delete('/vendors/{vendor_id}')
async def delete_vendor(vendor_id: str, user: dict = Depends(get_current_user)):
    result = await db.vendors.delete_one(_tenant_filter(user, {'id': vendor_id}))
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Vendor not found')
    await db.analytics.delete_many({'vendor_id': vendor_id})
    return {'message': 'Vendor deleted'}

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
    qr.add_data(vendor['qr_url'])
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
    return vendor

@api_router.post('/vendor-auth/logout')
async def vendor_logout(response: Response):
    response.delete_cookie('vendor_token', path='/')
    return {'message': 'Logged out'}

@api_router.get('/vendor-auth/me')
async def get_vendor_me(vendor: dict = Depends(get_current_vendor)):
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

@api_router.post('/analytics')
async def track_event(event: AnalyticsEvent, request: Request):
    # Extract client IP only for geo lookup — NEVER stored
    ip = request.headers.get('x-forwarded-for', '')
    if ip:
        ip = ip.split(',')[0].strip()
    else:
        ip = request.client.host if request.client else ''
    
    ua_string = request.headers.get('user-agent', '')
    device_type = 'unknown'
    os_name = ''
    browser_name = ''
    if ua_string:
        try:
            ua = parse_ua(ua_string)
            if ua.is_mobile:
                device_type = 'mobile'
            elif ua.is_tablet:
                device_type = 'tablet'
            elif ua.is_pc:
                device_type = 'desktop'
            elif ua.is_bot:
                device_type = 'bot'
            os_name = f"{ua.os.family} {ua.os.version_string}".strip()
            browser_name = f"{ua.browser.family} {ua.browser.version_string}".strip()
        except Exception:
            pass
    
    # Geo lookup at event-time; only aggregated city/country stored (no IP, no raw UA)
    geo = await _geo_lookup(ip) if ip else {'city': '', 'region': '', 'country': '', 'lat': None, 'lon': None}
    
    event_doc = {
        'vendor_id': event.vendor_id,
        'event_type': event.event_type,
        'timestamp': event.timestamp or datetime.now(timezone.utc).isoformat(),
        'device': device_type,
        'os': os_name,
        'browser': browser_name,
        'city': geo.get('city', ''),
        'region': geo.get('region', ''),
        'country': geo.get('country', '')
    }
    await db.analytics.insert_one(event_doc)
    return {'message': 'Event tracked'}


def _ip_to_subnet(ip: str) -> str:
    """Anonymize an IP address to a subnet network string so it can be used as a
    cache key without being personal data. IPv4 → /24, IPv6 → /48.
    Returns '' if the input is not a valid IP."""
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return ''
    if isinstance(addr, ipaddress.IPv4Address):
        return str(ipaddress.ip_network(f'{ip}/24', strict=False))
    return str(ipaddress.ip_network(f'{ip}/48', strict=False))


async def _geo_lookup(ip: str) -> dict:
    """Lookup IP geolocation with caching, GDPR-compliant.

    The full IP is used only transiently to call the geocoding provider (ipapi.co),
    then immediately discarded. The cache key is the IP truncated to a subnet
    (IPv4 /24, IPv6 /48) so no individual IP is ever persisted. Multiple users in
    the same subnet share the same cache row, which keeps geolocation precision
    at the city level (the only level we need) while making the stored value
    NOT personal data per art. 4(1) GDPR.
    """
    if not ip or ip in ('127.0.0.1', 'localhost', '::1') or ip.startswith('192.168.') or ip.startswith('10.'):
        return {'city': '', 'region': '', 'country': '', 'lat': None, 'lon': None}

    subnet = _ip_to_subnet(ip)
    if not subnet:
        return {'city': '', 'region': '', 'country': '', 'lat': None, 'lon': None}

    cached = await db.geo_cache.find_one({'subnet': subnet}, {'_id': 0})
    if cached:
        return {'city': cached.get('city', ''), 'region': cached.get('region', ''),
                'country': cached.get('country', ''), 'lat': cached.get('lat'), 'lon': cached.get('lon')}

    try:
        async with httpx.AsyncClient(timeout=3.0) as c:
            r = await c.get(f'https://ipapi.co/{ip}/json/')
            if r.status_code == 200:
                d = r.json()
                geo = {
                    'subnet': subnet,
                    'city': d.get('city', '') or '',
                    'region': d.get('region', '') or '',
                    'country': d.get('country_name', '') or '',
                    'lat': d.get('latitude'),
                    'lon': d.get('longitude'),
                    'cached_at': datetime.now(timezone.utc).isoformat()
                }
                await db.geo_cache.update_one({'subnet': subnet}, {'$set': geo}, upsert=True)
                return {k: geo[k] for k in ('city', 'region', 'country', 'lat', 'lon')}
    except Exception as e:
        logger.warning(f'Geo lookup failed for {ip}: {e}')
    return {'city': '', 'region': '', 'country': '', 'lat': None, 'lon': None}


def _period_to_dates(period: str):
    now = datetime.now(timezone.utc)
    if period == '7d':
        start = now - timedelta(days=7)
    elif period == 'month':
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    else:  # 30d default
        start = now - timedelta(days=30)
    return start.isoformat(), now.isoformat()


async def _build_detailed_analytics(query_filter: dict, period: str, limit_log: int = 200) -> dict:
    start_iso, end_iso = _period_to_dates(period)
    base = {**query_filter, 'timestamp': {'$gte': start_iso, '$lte': end_iso}}
    
    events = await db.analytics.find(base, {'_id': 0}).sort('timestamp', -1).to_list(5000)
    
    # Aggregations — geo data is now stored at event-time (no IP lookup needed)
    total_views = sum(1 for e in events if e['event_type'] == 'page_view')
    total_clicks = sum(1 for e in events if e['event_type'] in CLICK_TYPES)
    
    click_breakdown = {ct: 0 for ct in CLICK_TYPES}
    device_breakdown = {}
    city_breakdown = {}
    daily_timeline = {}
    hourly_pattern = [0] * 24
    
    for e in events:
        et = e['event_type']
        if et in click_breakdown:
            click_breakdown[et] += 1
        dev = e.get('device', 'unknown')
        device_breakdown[dev] = device_breakdown.get(dev, 0) + 1
        city = e.get('city') or 'Sconosciuta'
        if et in CLICK_TYPES or et == 'page_view':
            city_breakdown[city] = city_breakdown.get(city, 0) + 1
        ts = e.get('timestamp', '')
        if ts:
            try:
                dt = datetime.fromisoformat(ts.replace('Z', '+00:00'))
                day = dt.date().isoformat()
                daily_timeline[day] = daily_timeline.get(day, {'views': 0, 'clicks': 0})
                if et == 'page_view':
                    daily_timeline[day]['views'] += 1
                elif et in CLICK_TYPES:
                    daily_timeline[day]['clicks'] += 1
                hourly_pattern[dt.hour] += 1
            except Exception:
                pass
    
    timeline_list = sorted(
        [{'date': k, **v} for k, v in daily_timeline.items()],
        key=lambda x: x['date']
    )
    top_cities = sorted(
        [{'city': k, 'count': v} for k, v in city_breakdown.items()],
        key=lambda x: x['count'], reverse=True
    )[:10]
    
    # Recent event log (limited) — NO IP / user-agent stored or returned
    log = []
    for e in events[:limit_log]:
        log.append({
            'timestamp': e.get('timestamp', ''),
            'event_type': e.get('event_type', ''),
            'vendor_id': e.get('vendor_id', ''),
            'city': e.get('city', ''),
            'region': e.get('region', ''),
            'country': e.get('country', ''),
            'device': e.get('device', ''),
            'os': e.get('os', ''),
            'browser': e.get('browser', '')
        })
    
    return {
        'period': period,
        'start': start_iso,
        'end': end_iso,
        'total_events': len(events),
        'total_views': total_views,
        'total_clicks': total_clicks,
        'click_breakdown': click_breakdown,
        'device_breakdown': device_breakdown,
        'top_cities': top_cities,
        'timeline': timeline_list,
        'hourly_pattern': hourly_pattern,
        'event_log': log
    }


@api_router.get('/analytics/detailed')
async def get_detailed_analytics(period: str = '30d', vendor_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    qf = {'vendor_id': vendor_id} if vendor_id else {}
    if not _is_super_admin(user):
        # Restrict to vendors of user's organization
        org_vendor_ids = [v['id'] for v in await db.vendors.find(
            {'organization_id': user.get('organization_id')}, {'_id': 0, 'id': 1}
        ).to_list(10000)]
        if vendor_id and vendor_id not in org_vendor_ids:
            raise HTTPException(status_code=404, detail='Vendor non trovato')
        if not vendor_id:
            qf = {'vendor_id': {'$in': org_vendor_ids}}
    return await _build_detailed_analytics(qf, period)


@api_router.get('/vendor/analytics/detailed')
async def get_vendor_detailed_analytics(period: str = '30d', vendor: dict = Depends(get_current_vendor)):
    return await _build_detailed_analytics({'vendor_id': vendor['id']}, period)


def _click_label(et: str) -> str:
    return {
        'whatsapp_click': 'WhatsApp', 'instagram_click': 'Instagram',
        'facebook_click': 'Facebook', 'review_click': 'Recensione Google',
        'tiktok_click': 'TikTok', 'maps_click': 'Google Maps', 'post_cta_click': 'CTA Post'
    }.get(et, et)


def _generate_pdf_report(data: dict, title: str, subtitle: str = '') -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=1.5*cm, bottomMargin=1.5*cm,
                             leftMargin=1.5*cm, rightMargin=1.5*cm, title=title)
    styles = getSampleStyleSheet()
    story = []
    
    h1 = ParagraphStyle('h1', parent=styles['Heading1'], textColor=colors.HexColor('#F96815'),
                          fontSize=24, alignment=TA_CENTER, spaceAfter=6)
    h_sub = ParagraphStyle('hsub', parent=styles['Normal'], fontSize=11,
                            textColor=colors.HexColor('#666666'), alignment=TA_CENTER, spaceAfter=18)
    h2 = ParagraphStyle('h2', parent=styles['Heading2'], textColor=colors.HexColor('#1A1A1A'),
                          fontSize=14, spaceAfter=8, spaceBefore=12)
    
    story.append(Paragraph('Report Analytics', h1))
    story.append(Paragraph(title, h_sub))
    if subtitle:
        story.append(Paragraph(subtitle, h_sub))
    story.append(Paragraph(f"Periodo: {data['start'][:10]} → {data['end'][:10]}", styles['Normal']))
    story.append(Spacer(1, 0.4*cm))
    
    # KPI table
    kpi_data = [
        ['Metrica', 'Valore'],
        ['Visite Totali', str(data.get('total_views', 0))],
        ['Click Totali', str(data.get('total_clicks', 0))],
        ['Eventi Totali', str(data.get('total_events', 0))]
    ]
    t = Table(kpi_data, colWidths=[8*cm, 6*cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#F96815')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cccccc')),
        ('PADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(Paragraph('Riepilogo', h2))
    story.append(t)
    
    # Click breakdown
    cb = data.get('click_breakdown', {})
    if any(cb.values()):
        story.append(Paragraph('Dettaglio Click per Canale', h2))
        cb_rows = [['Canale', 'Click']]
        for et, n in cb.items():
            if n > 0:
                cb_rows.append([_click_label(et), str(n)])
        t2 = Table(cb_rows, colWidths=[8*cm, 6*cm])
        t2.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#4A2D8C')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cccccc')),
            ('PADDING', (0,0), (-1,-1), 6),
        ]))
        story.append(t2)
    
    # Device
    db_ = data.get('device_breakdown', {})
    if db_:
        story.append(Paragraph('Dispositivi', h2))
        rows = [['Tipo', 'Eventi']] + [[k.capitalize(), str(v)] for k, v in db_.items()]
        t3 = Table(rows, colWidths=[8*cm, 6*cm])
        t3.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1A1A1A')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cccccc')),
            ('PADDING', (0,0), (-1,-1), 6),
        ]))
        story.append(t3)
    
    # Top cities
    tc = data.get('top_cities', [])
    if tc:
        story.append(Paragraph('Top Città (Geolocalizzazione IP)', h2))
        rows = [['Città', 'Eventi']] + [[c['city'], str(c['count'])] for c in tc]
        t4 = Table(rows, colWidths=[8*cm, 6*cm])
        t4.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#F96815')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cccccc')),
            ('PADDING', (0,0), (-1,-1), 6),
        ]))
        story.append(t4)
    
    # Event log (last 30)
    log = data.get('event_log', [])[:30]
    if log:
        story.append(PageBreak())
        story.append(Paragraph('Log Eventi Recenti (max 30)', h2))
        rows = [['Data/Ora', 'Evento', 'Città', 'Dispositivo']]
        for e in log:
            ts = e.get('timestamp', '')[:16].replace('T', ' ')
            rows.append([ts, _click_label(e.get('event_type', '')),
                          e.get('city', '') or '-', (e.get('device', '') or '-').capitalize()])
        t5 = Table(rows, colWidths=[4*cm, 4.5*cm, 4*cm, 3*cm])
        t5.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#4A2D8C')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('FONTSIZE', (0,0), (-1,-1), 8),
            ('GRID', (0,0), (-1,-1), 0.3, colors.HexColor('#cccccc')),
            ('PADDING', (0,0), (-1,-1), 4),
        ]))
        story.append(t5)
    
    story.append(Spacer(1, 0.6*cm))
    footer = ParagraphStyle('foot', parent=styles['Normal'], fontSize=8, alignment=TA_CENTER, textColor=colors.HexColor('#999999'))
    story.append(Paragraph(f"Report generato il {datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M UTC')} — QRHub", footer))
    
    doc.build(story)
    return buf.getvalue()


@api_router.get('/analytics/export/pdf')
async def export_analytics_pdf(period: str = '30d', vendor_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    # Tenant scoping (defense-in-depth): a non-super-admin must NOT be able to
    # request analytics of a vendor outside their own organization, nor an
    # unscoped "all vendors" report. Mirrors the logic of /analytics/detailed.
    if not _is_super_admin(user):
        org_vendor_ids = [v['id'] for v in await db.vendors.find(
            {'organization_id': user.get('organization_id')}, {'_id': 0, 'id': 1}
        ).to_list(10000)]
        if vendor_id and vendor_id not in org_vendor_ids:
            raise HTTPException(status_code=404, detail='Vendor non trovato')
        if vendor_id:
            qf = {'vendor_id': vendor_id}
        else:
            qf = {'vendor_id': {'$in': org_vendor_ids}}
    else:
        qf = {'vendor_id': vendor_id} if vendor_id else {}

    data = await _build_detailed_analytics(qf, period)
    
    title = 'Report Analytics'
    subtitle = ''
    if vendor_id:
        v = await db.vendors.find_one({'id': vendor_id}, {'_id': 0, 'name': 1})
        if v:
            subtitle = f"Venditore: {v['name']}"
            title = f"Report Analytics - {v['name']}"
    else:
        subtitle = 'Tutti i venditori'
    
    pdf_bytes = _generate_pdf_report(data, title, subtitle)
    fname = f"analytics_{period}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.pdf"
    return FastAPIResponse(content=pdf_bytes, media_type='application/pdf',
                              headers={'Content-Disposition': f'attachment; filename={fname}'})


@api_router.get('/vendor/analytics/export/pdf')
async def export_vendor_analytics_pdf(period: str = '30d', vendor: dict = Depends(get_current_vendor)):
    data = await _build_detailed_analytics({'vendor_id': vendor['id']}, period)
    title = f"Report Analytics - {vendor['name']}"
    pdf_bytes = _generate_pdf_report(data, title, f"Venditore: {vendor['name']}")
    fname = f"analytics_{period}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.pdf"
    return FastAPIResponse(content=pdf_bytes, media_type='application/pdf',
                              headers={'Content-Disposition': f'attachment; filename={fname}'})

@api_router.get('/analytics/overview')
async def get_analytics_overview(user: dict = Depends(get_current_user)):
    qf = _tenant_filter(user)
    total_vendors = await db.vendors.count_documents(qf)
    
    org_vendor_ids = [v['id'] for v in await db.vendors.find(qf, {'_id': 0, 'id': 1}).to_list(10000)]
    analytics_qf = {} if _is_super_admin(user) else {'vendor_id': {'$in': org_vendor_ids}}
    
    total_views = await db.analytics.count_documents({**analytics_qf, 'event_type': 'page_view'})
    total_clicks = await db.analytics.count_documents({**analytics_qf, 'event_type': {'$in': CLICK_TYPES}})
    
    vendors = await db.vendors.find(qf, {'_id': 0, 'id': 1, 'name': 1}).to_list(1000)
    vendor_stats = []
    for v in vendors:
        views = await db.analytics.count_documents({'vendor_id': v['id'], 'event_type': 'page_view'})
        clicks = await db.analytics.count_documents({
            'vendor_id': v['id'],
            'event_type': {'$in': CLICK_TYPES}
        })
        vendor_stats.append({
            'id': v['id'],
            'name': v['name'],
            'views': views,
            'clicks': clicks
        })
    
    return {
        'total_vendors': total_vendors,
        'total_views': total_views,
        'total_clicks': total_clicks,
        'vendor_stats': vendor_stats
    }

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
        'ADMIN_EMAIL': cfg.get('prod_admin_email') or '',
        'ADMIN_PASSWORD': cfg.get('prod_admin_password') or '',
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


@api_router.post('/deploy/fly/apply-secrets')
async def fly_apply_secrets(user: dict = Depends(require_super_admin)):
    """Push all production secrets to Fly.io via GraphQL setSecrets mutation."""
    cfg = await _load_deploy_config()
    token = cfg.get('flyio_api_key', '')
    app_name = cfg.get('flyio_app_name', '')
    if not app_name:
        raise HTTPException(status_code=400, detail='Nome App Fly.io mancante')
    secrets = _collect_fly_secrets(cfg)
    if not secrets:
        raise HTTPException(status_code=400, detail='Nessun secret compilato nel tab "Secrets"')
    query = '''
    mutation($input: SetSecretsInput!) {
      setSecrets(input: $input) {
        release { id version reason description createdAt }
        app { name }
      }
    }'''
    data = await _fly_graphql(token, query, {
        'input': {'appId': app_name, 'secrets': secrets, 'replaceAll': False}
    })
    rel = (data.get('setSecrets') or {}).get('release') or {}
    return {
        'message': f'{len(secrets)} secrets applicati su Fly.io',
        'release_version': rel.get('version'),
        'release_description': rel.get('description'),
        'applied_keys': [s['key'] for s in secrets]
    }


@api_router.get('/deploy/fly/status')
async def fly_status(user: dict = Depends(require_super_admin)):
    """Return machines status + current release info for the configured Fly app."""
    cfg = await _load_deploy_config()
    token = cfg.get('flyio_api_key', '')
    app_name = cfg.get('flyio_app_name', '')
    if not token or not app_name:
        raise HTTPException(status_code=400, detail='Fly Token o Nome App mancante')

    # 1) Machines via Machines API
    machines = []
    async with httpx.AsyncClient(timeout=20.0) as c:
        try:
            r = await c.get(f'{FLY_MACHINES_API}/apps/{app_name}/machines',
                              headers={'Authorization': f'Bearer {token}'})
            if r.status_code == 200:
                ms = r.json() if isinstance(r.json(), list) else []
                for m in ms:
                    machines.append({
                        'id': m.get('id'),
                        'state': m.get('state'),
                        'region': m.get('region'),
                        'image': (m.get('config') or {}).get('image', ''),
                        'updated_at': m.get('updated_at')
                    })
            elif r.status_code == 404:
                return {'app': app_name, 'exists': False, 'machines': [], 'release': None}
            else:
                # Don't crash — let GQL try
                pass
        except Exception as e:
            logger.warning(f'Fly machines fetch failed: {e}')

    # 2) Current release via GraphQL
    query = '''
    query($name: String!) {
      app(name: $name) {
        name
        status
        deployed
        currentRelease { id version description status createdAt imageRef }
      }
    }'''
    data = await _fly_graphql(token, query, {'name': app_name})
    a = data.get('app') or {}
    return {
        'app': a.get('name', app_name),
        'exists': bool(a),
        'app_status': a.get('status'),
        'deployed': a.get('deployed'),
        'release': a.get('currentRelease'),
        'machines': machines
    }


class FlyRedeployRequest(BaseModel):
    image_ref: Optional[str] = None  # optional override (e.g. registry.fly.io/app:tag)


@api_router.post('/deploy/fly/redeploy')
async def fly_redeploy(req: FlyRedeployRequest, user: dict = Depends(require_super_admin)):
    """Re-release the current image (applies staged secrets). If image_ref provided, deploys that.
    Useful to apply secrets without rebuilding from source.

    Supports BOTH platforms:
    - Machines platform (new): restart each machine via REST API to pick up staged secrets
    - Nomad platform (legacy): GraphQL deployImage mutation

    Note: restart is scheduled in BACKGROUND so the HTTP response can return before the
    backend's own machine restarts (otherwise client gets a 502 "connection reset").
    """
    cfg = await _load_deploy_config()
    token = cfg.get('flyio_api_key', '')
    app_name = cfg.get('flyio_app_name', '')
    if not token or not app_name:
        raise HTTPException(status_code=400, detail='Fly Token o Nome App mancante')

    # 1) Detect platform: try Machines API first (works on new apps)
    async with httpx.AsyncClient(timeout=60.0) as c:
        r = await c.get(f'{FLY_MACHINES_API}/apps/{app_name}/machines',
                        headers={'Authorization': f'Bearer {token}'})
        if r.status_code == 200:
            machines = r.json() if isinstance(r.json(), list) else []
            if machines:
                machine_ids = [m.get('id') for m in machines if m.get('id')]
                current_image = (machines[0].get('config') or {}).get('image') if machines else None

                # Schedule redeploy in BACKGROUND so we can return 200 before our own machine dies.
                # Note: /machines/{id}/restart does NOT pick up staged secrets — it only restarts the
                # current instance. To force a fresh release that includes staged secrets we use
                # POST /machines/{id} with the existing config (or new image_ref): this creates a new
                # release and applies all staged secrets.
                async def _do_restart():
                    await asyncio.sleep(2)  # give time for client to receive response
                    async with httpx.AsyncClient(timeout=120.0) as cc:
                        for mid in machine_ids:
                            try:
                                m_orig = next((m for m in machines if m.get('id') == mid), {})
                                cfg_m = dict(m_orig.get('config') or {})
                                if req.image_ref:
                                    cfg_m['image'] = req.image_ref
                                await cc.post(f'{FLY_MACHINES_API}/apps/{app_name}/machines/{mid}',
                                                headers={'Authorization': f'Bearer {token}'},
                                                json={'config': cfg_m})
                            except Exception as e:
                                logger.error(f'Background redeploy machine {mid} failed: {e}')

                asyncio.create_task(_do_restart())

                return {
                    'message': f'Redeploy di {len(machine_ids)} machine(s) avviato in background '
                                '(attendi ~15-30s, i secret staged verranno applicati). Se sei superadmin '
                                'su questa stessa app, la prossima richiesta potrebbe fallire mentre il '
                                'backend riparte.',
                    'platform': 'machines',
                    'machines': machine_ids,
                    'image': req.image_ref or current_image,
                    'scheduled': True
                }

    # 2) Fallback: Nomad platform (legacy) — GraphQL deployImage mutation
    image = req.image_ref
    if not image:
        q = '''
        query($name: String!) {
          app(name: $name) { currentRelease { imageRef } }
        }'''
        d = await _fly_graphql(token, q, {'name': app_name})
        image = ((d.get('app') or {}).get('currentRelease') or {}).get('imageRef')
        if not image:
            raise HTTPException(status_code=400,
                                  detail='Nessuna release esistente su Fly. Fai prima un deploy iniziale '
                                          'da CLI (fly deploy) per creare la prima immagine.')

    mutation = '''
    mutation($input: DeployImageInput!) {
      deployImage(input: $input) {
        release { id version description status }
        app { name }
      }
    }'''
    data = await _fly_graphql(token, mutation, {
        'input': {'appId': app_name, 'image': image, 'strategy': 'ROLLING'}
    })
    rel = (data.get('deployImage') or {}).get('release') or {}
    return {
        'message': 'Redeploy avviato',
        'platform': 'nomad',
        'image': image,
        'release_version': rel.get('version'),
        'release_status': rel.get('status')
    }

    # 2) Fallback: Nomad platform (legacy) — GraphQL deployImage mutation
    image = req.image_ref
    if not image:
        q = '''
        query($name: String!) {
          app(name: $name) { currentRelease { imageRef } }
        }'''
        d = await _fly_graphql(token, q, {'name': app_name})
        image = ((d.get('app') or {}).get('currentRelease') or {}).get('imageRef')
        if not image:
            raise HTTPException(status_code=400,
                                  detail='Nessuna release esistente su Fly. Fai prima un deploy iniziale '
                                          'da CLI (fly deploy) per creare la prima immagine.')

    mutation = '''
    mutation($input: DeployImageInput!) {
      deployImage(input: $input) {
        release { id version description status }
        app { name }
      }
    }'''
    data = await _fly_graphql(token, mutation, {
        'input': {'appId': app_name, 'image': image, 'strategy': 'ROLLING'}
    })
    rel = (data.get('deployImage') or {}).get('release') or {}
    return {
        'message': 'Redeploy avviato',
        'platform': 'nomad',
        'image': image,
        'release_version': rel.get('version'),
        'release_status': rel.get('status')
    }


@api_router.post('/deploy/fly/update-image')
async def fly_update_image(req: FlyRedeployRequest, user: dict = Depends(require_super_admin)):
    """Update each machine with the latest image pushed to registry.fly.io.
    Useful after a CI build pushed a new image but machines haven't picked it up.

    Behaviour:
    - If `image_ref` is provided, uses it
    - Else fetches the latest release imageRef from Fly GraphQL
    - For each machine on the Machines platform: POSTs config.image = new_image
    """
    cfg = await _load_deploy_config()
    token = cfg.get('flyio_api_key', '')
    app_name = cfg.get('flyio_app_name', '')
    if not token or not app_name:
        raise HTTPException(status_code=400, detail='Fly Token o Nome App mancante')

    # 1) Resolve target image
    target_image = (req.image_ref or '').strip()
    if not target_image:
        q = '''
        query($name: String!) {
          app(name: $name) { currentRelease { imageRef } }
        }'''
        d = await _fly_graphql(token, q, {'name': app_name})
        target_image = ((d.get('app') or {}).get('currentRelease') or {}).get('imageRef') or ''
        if not target_image:
            raise HTTPException(status_code=400,
                                  detail='Nessuna release esistente. Fai prima `fly deploy` da CLI per pushare la prima image.')

    # 2) List machines
    async with httpx.AsyncClient(timeout=60.0) as c:
        r = await c.get(f'{FLY_MACHINES_API}/apps/{app_name}/machines',
                          headers={'Authorization': f'Bearer {token}'})
        if r.status_code >= 400:
            raise HTTPException(status_code=502, detail=f'Fly machines list: {r.status_code} {r.text[:200]}')
        machines = r.json() if isinstance(r.json(), list) else []
        if not machines:
            raise HTTPException(status_code=400, detail='Nessuna machine trovata. Fai prima `fly deploy` da CLI.')

        updated, skipped = [], []
        for m in machines:
            mid = m.get('id')
            current_image = ((m.get('config') or {}).get('image') or '').strip()
            if current_image == target_image:
                skipped.append({'id': mid, 'reason': 'already on target image'})
                continue
            # Update machine with new image (preserve full config)
            new_cfg = dict(m.get('config') or {})
            new_cfg['image'] = target_image
            rr = await c.post(f'{FLY_MACHINES_API}/apps/{app_name}/machines/{mid}',
                                headers={'Authorization': f'Bearer {token}'},
                                json={'config': new_cfg})
            if rr.status_code >= 400:
                raise HTTPException(status_code=502,
                                      detail=f'Fly machine {mid} update: {rr.status_code} {rr.text[:200]}')
            updated.append(mid)

    return {
        'message': f'{len(updated)} machine(s) aggiornata/e all\'ultima image' + (f' · {len(skipped)} già aggiornata/e' if skipped else ''),
        'platform': 'machines',
        'target_image': target_image,
        'updated': updated,
        'skipped': skipped
    }


@api_router.post('/deploy/vercel/trigger')
async def vercel_trigger(user: dict = Depends(require_super_admin)):
    """Trigger a Vercel deployment. Prefers Deploy Hook (no token); falls back to API + token."""
    cfg = await _load_deploy_config()
    hook = (cfg.get('vercel_deploy_hook') or '').strip()
    token = (cfg.get('vercel_token') or '').strip()
    project_id = (cfg.get('vercel_project_id') or '').strip()
    org_id = (cfg.get('vercel_org_id') or '').strip()

    async with httpx.AsyncClient(timeout=30.0) as c:
        if hook:
            r = await c.post(hook)
            if r.status_code >= 400:
                raise HTTPException(status_code=502, detail=f'Vercel hook: {r.status_code} {r.text[:300]}')
            try:
                payload = r.json()
            except Exception:
                payload = {'raw': r.text[:500]}
            return {'method': 'deploy_hook', 'status': r.status_code, **payload}

        if not token or not project_id:
            raise HTTPException(status_code=400,
                                  detail='Configura un Vercel Deploy Hook oppure Token + Project ID')

        # Try to find latest deployment, then re-deploy via API
        params = {'projectId': project_id, 'limit': '1'}
        if org_id:
            params['teamId'] = org_id
        headers = {'Authorization': f'Bearer {token}'}
        r = await c.get('https://api.vercel.com/v6/deployments', params=params, headers=headers)
        if r.status_code >= 400:
            raise HTTPException(status_code=502, detail=f'Vercel API: {r.status_code} {r.text[:300]}')
        deployments = (r.json() or {}).get('deployments') or []
        if not deployments:
            raise HTTPException(status_code=400,
                                  detail='Nessun deployment esistente da ridistribuire. Usa un Deploy Hook '
                                          'oppure crea un primo deploy manuale.')
        latest = deployments[0]
        meta = latest.get('meta') or {}
        body = {
            'name': latest.get('name') or project_id,
            'target': latest.get('target') or 'production',
            'projectSettings': {},
            'gitSource': {
                'type': meta.get('githubDeployment') and 'github' or latest.get('source') or 'github',
                'ref': meta.get('githubCommitRef') or 'main',
                'repoId': meta.get('githubRepoId'),
            }
        }
        # Filter empties to avoid 400s
        gs = {k: v for k, v in body['gitSource'].items() if v}
        if gs.get('repoId'):
            body['gitSource'] = gs
            url = 'https://api.vercel.com/v13/deployments'
            if org_id:
                url += f'?teamId={org_id}'
            r2 = await c.post(url, json=body, headers=headers)
            if r2.status_code >= 400:
                raise HTTPException(status_code=502, detail=f'Vercel deploy: {r2.status_code} {r2.text[:300]}')
            d = r2.json()
            return {'method': 'api', 'id': d.get('id'), 'url': d.get('url'), 'state': d.get('readyState')}
        raise HTTPException(status_code=400,
                              detail='Impossibile derivare gitSource. Configura un Deploy Hook su Vercel '
                                      '(Project → Settings → Git → Deploy Hooks) e incollalo nel pannello.')


class RotateCredsRequest(BaseModel):
    rotate_jwt: bool = True
    rotate_admin_password: bool = False
    rotate_superadmin_password: bool = False
    new_admin_password: Optional[str] = None  # if None and rotate=True → auto-generate
    new_superadmin_password: Optional[str] = None
    apply_to_fly: bool = True


def _random_secret(length: int = 32) -> str:
    import secrets as _s
    return _s.token_hex(length)


def _random_password(length: int = 16) -> str:
    import secrets as _s
    alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%-_'
    return ''.join(_s.choice(alphabet) for _ in range(length))


@api_router.post('/deploy/rotate-credentials')
async def rotate_credentials(req: RotateCredsRequest, user: dict = Depends(require_super_admin)):
    """Rotate JWT_SECRET and/or admin/superadmin passwords. Updates local DB users +
    saves new values in deployment config + (optionally) pushes them to Fly secrets."""
    cfg = await _load_deploy_config()

    updates = {}
    rotated = {'jwt': False, 'admin_password': False, 'superadmin_password': False}
    new_admin_pwd = None
    new_super_pwd = None

    if req.rotate_jwt:
        updates['prod_jwt_secret'] = _random_secret(32)
        rotated['jwt'] = True

    if req.rotate_admin_password:
        new_admin_pwd = (req.new_admin_password or '').strip() or _random_password(16)
        updates['prod_admin_password'] = new_admin_pwd
        rotated['admin_password'] = True
        # Update DB admin
        admin_email = cfg.get('prod_admin_email') or os.environ.get('ADMIN_EMAIL', 'admin@example.com')
        await db.users.update_one(
            {'email': admin_email.lower(), 'role': {'$ne': 'super_admin'}},
            {'$set': {'password_hash': hash_password(new_admin_pwd)}}
        )

    if req.rotate_superadmin_password:
        new_super_pwd = (req.new_superadmin_password or '').strip() or _random_password(16)
        updates['prod_superadmin_password'] = new_super_pwd
        rotated['superadmin_password'] = True
        super_email = cfg.get('prod_superadmin_email') or os.environ.get('SUPERADMIN_EMAIL', 'superadmin@qrhub.it')
        await db.users.update_one(
            {'email': super_email.lower(), 'role': 'super_admin'},
            {'$set': {'password_hash': hash_password(new_super_pwd)}}
        )

    if not updates:
        raise HTTPException(status_code=400, detail='Nessuna rotazione richiesta')

    # Persist into deployment config
    updates['updated_at'] = datetime.now(timezone.utc).isoformat()
    updates['updated_by'] = user.get('email', '')
    await db.config.update_one({'type': 'deployment'}, {'$set': updates}, upsert=True)

    fly_result = None
    if req.apply_to_fly and cfg.get('flyio_api_key') and cfg.get('flyio_app_name'):
        # Re-apply secrets so production picks up the new values
        new_cfg = {**cfg, **updates}
        secrets = _collect_fly_secrets(new_cfg)
        query = '''
        mutation($input: SetSecretsInput!) {
          setSecrets(input: $input) {
            release { id version description }
          }
        }'''
        data = await _fly_graphql(cfg['flyio_api_key'], query, {
            'input': {'appId': cfg['flyio_app_name'], 'secrets': secrets, 'replaceAll': False}
        })
        rel = (data.get('setSecrets') or {}).get('release') or {}
        fly_result = {
            'release_version': rel.get('version'),
            'release_description': rel.get('description'),
            'applied_keys': [s['key'] for s in secrets]
        }

    return {
        'message': 'Credenziali ruotate',
        'rotated': rotated,
        'new_admin_password': new_admin_pwd if req.rotate_admin_password else None,
        'new_superadmin_password': new_super_pwd if req.rotate_superadmin_password else None,
        'new_jwt_secret_preview': (updates.get('prod_jwt_secret') or '')[:8] + '…' if rotated['jwt'] else None,
        'fly': fly_result
    }


# ──────────────────────────────────────────────────────────────────
# Uptime monitor — pings production backend every N seconds
# ──────────────────────────────────────────────────────────────────
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


@api_router.get('/deploy/uptime/summary')
async def uptime_summary(user: dict = Depends(require_super_admin)):
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    checks = await db.uptime_checks.find(
        {'timestamp': {'$gte': cutoff}}, {'_id': 0}
    ).sort('timestamp', -1).to_list(2000)
    cfg = await _load_deploy_config()
    target = await _uptime_target_url(cfg)
    if not checks:
        return {
            'has_data': False, 'target': target,
            'enabled': cfg.get('uptime_enabled', True),
            'interval_sec': cfg.get('uptime_interval_sec', 60),
            'message': 'In attesa del primo check (entro 60s dal salvataggio dell\'URL Fly).'
        }
    total = len(checks)
    up_count = sum(1 for c in checks if c.get('up'))
    uptime_pct = round((up_count / total) * 100, 2) if total else 0.0
    latencies = [c['latency_ms'] for c in checks if c.get('up') and c.get('latency_ms')]
    avg_latency = round(sum(latencies) / len(latencies)) if latencies else 0
    last = checks[0]
    # Hourly bucket for chart
    buckets = {}
    for c in checks:
        try:
            h = c['timestamp'][:13]  # YYYY-MM-DDTHH
            b = buckets.setdefault(h, {'hour': h, 'up': 0, 'down': 0, 'lat_sum': 0, 'lat_cnt': 0})
            if c.get('up'):
                b['up'] += 1
                if c.get('latency_ms'):
                    b['lat_sum'] += c['latency_ms']
                    b['lat_cnt'] += 1
            else:
                b['down'] += 1
        except Exception:
            pass
    chart = []
    for h in sorted(buckets.keys()):
        b = buckets[h]
        chart.append({
            'hour': h[11:13] + ':00',
            'full_hour': h,
            'avg_latency': round(b['lat_sum'] / b['lat_cnt']) if b['lat_cnt'] else 0,
            'up': b['up'], 'down': b['down']
        })
    return {
        'has_data': True, 'target': target,
        'enabled': cfg.get('uptime_enabled', True),
        'interval_sec': cfg.get('uptime_interval_sec', 60),
        'current_status': 'up' if last.get('up') else 'down',
        'last_check': last,
        'uptime_pct_24h': uptime_pct,
        'avg_latency_ms': avg_latency,
        'total_checks': total,
        'down_count': total - up_count,
        'chart': chart,
        'recent': checks[:15]
    }


@api_router.post('/deploy/uptime/check-now')
async def uptime_check_now(user: dict = Depends(require_super_admin)):
    cfg = await _load_deploy_config()
    rec = await _run_uptime_check(cfg)
    if not rec:
        raise HTTPException(status_code=400, detail='Configura prima Fly App Name o Fly App URL')
    return rec


app.include_router(api_router)

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

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event('startup')
async def seed_admin():
    # 1. Create super_admin if not exists
    SUPERADMIN_EMAIL = os.environ.get('SUPERADMIN_EMAIL', 'superadmin@qrhub.it')
    SUPERADMIN_PASSWORD = os.environ.get('SUPERADMIN_PASSWORD', 'changeme123')
    
    super_admin = await db.users.find_one({'role': 'super_admin'})
    if not super_admin:
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

    # 3. Legacy ADMIN_EMAIL → ensure exists as default org_admin
    admin = await db.users.find_one({'email': ADMIN_EMAIL})
    if not admin:
        default_org = await db.organizations.find_one({'slug': 'demo'}, {'_id': 0, 'id': 1})
        await db.users.insert_one({
            'email': ADMIN_EMAIL,
            'password_hash': hash_password(ADMIN_PASSWORD),
            'name': 'Org Admin',
            'role': 'org_admin',
            'organization_id': default_org['id'] if default_org else None,
            'created_at': datetime.now(timezone.utc).isoformat()
        })
        logger.info(f'Org admin created: {_redact_email(ADMIN_EMAIL)}')
    elif not verify_password(ADMIN_PASSWORD, admin['password_hash']):
        await db.users.update_one(
            {'email': ADMIN_EMAIL},
            {'$set': {'password_hash': hash_password(ADMIN_PASSWORD)}}
        )
        logger.info(f'Admin password updated: {_redact_email(ADMIN_EMAIL)}')

    # Anonymize legacy user display name "Admin VDN"
    try:
        await db.users.update_many(
            {'name': {'$in': ['Admin VDN', 'Admin VDN SRL']}},
            {'$set': {'name': 'Org Admin'}}
        )
    except Exception:
        pass

    Path('/app/memory').mkdir(exist_ok=True)
    with open('/app/memory/test_credentials.md', 'w') as f:
        f.write(f'''# Test Credentials\n\n## Super Admin (QRHub Platform)\n- Email: {SUPERADMIN_EMAIL}\n- Password: {SUPERADMIN_PASSWORD}\n- Role: super_admin\n\n## Org Admin (default organization)\n- Email: {ADMIN_EMAIL}\n- Password: {ADMIN_PASSWORD}\n- Role: org_admin\n\n## API Endpoints\n- POST /api/auth/login\n- GET /api/auth/me\n- POST /api/auth/logout\n- GET /api/organizations (super admin)\n- GET /api/my-organization (any logged-in user)\n''')
    
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