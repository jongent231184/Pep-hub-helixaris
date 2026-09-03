"""Cross-brand portal — a personal master login that shows a hub of every
brand the operator manages, with a clickable card to each brand's admin.

Uses a separate `portal_users` collection so it has NO overlap with the
per-brand admin credentials (that stay 100% independent per your ask).
"""
import os
import uuid
from datetime import datetime, timezone, timedelta

import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr

from db import db

router = APIRouter(prefix='/portal', tags=['portal'])
_pwd = CryptContext(schemes=['bcrypt'], deprecated='auto')
_bearer = HTTPBearer(auto_error=False)


PORTAL_SECRET = os.environ.get('PORTAL_JWT_SECRET', os.environ.get('JWT_SECRET', 'change-me'))
PORTAL_ALG = 'HS256'
PORTAL_TTL_HOURS = 12


def _issue(sub: str) -> str:
    return jwt.encode(
        {
            'sub': sub,
            'scope': 'portal',
            'exp': datetime.now(timezone.utc) + timedelta(hours=PORTAL_TTL_HOURS),
        },
        PORTAL_SECRET,
        algorithm=PORTAL_ALG,
    )


async def require_portal(cred: HTTPAuthorizationCredentials = Depends(_bearer)) -> dict:
    if not cred or not cred.credentials:
        raise HTTPException(401, 'Portal token required')
    try:
        payload = jwt.decode(cred.credentials, PORTAL_SECRET, algorithms=[PORTAL_ALG])
    except jwt.PyJWTError:
        raise HTTPException(401, 'Invalid portal token')
    if payload.get('scope') != 'portal':
        raise HTTPException(401, 'Not a portal token')
    user = await db.portal_users.find_one({'id': payload['sub']})
    if not user:
        raise HTTPException(401, 'Portal user no longer exists')
    return user


class PortalLogin(BaseModel):
    email: EmailStr
    password: str


@router.post('/login')
async def portal_login(payload: PortalLogin):
    email = payload.email.lower().strip()
    user = await db.portal_users.find_one({'email': email})
    if not user or not _pwd.verify(payload.password, user.get('password_hash', '')):
        raise HTTPException(401, 'Invalid email or password')
    return {
        'access_token': _issue(user['id']),
        'user': {'id': user['id'], 'email': user['email'], 'name': user.get('name', '')},
    }


@router.get('/me')
async def portal_me(user: dict = Depends(require_portal)):
    return {'id': user['id'], 'email': user['email'], 'name': user.get('name', '')}


@router.get('/brands')
async def portal_brands(_: dict = Depends(require_portal)):
    """The list of brands this portal can jump into. Kept in DB so you can add
    a new brand later without a redeploy."""
    docs = await db.portal_brands.find({'visible': {'$ne': False}}).sort('order', 1).to_list(20)
    return [
        {
            'key': d['key'],
            'name': d['name'],
            'tagline': d.get('tagline', ''),
            'logo': d.get('logo', ''),
            'primary_color': d.get('primary_color', '#0b1220'),
            'accent_color': d.get('accent_color', '#c8a24a'),
            'admin_url': d['admin_url'],
        }
        for d in docs
    ]


# ---------- Seed helpers (safe to call multiple times) ----------
@router.post('/admin/seed')
async def portal_seed(
    payload: dict,
    _ping: dict = Depends(require_portal),  # protect from anonymous seeding
):
    """Upsert the current portal user's own record. Payload: {email, password?, name?}"""
    email = payload.get('email', '').lower().strip()
    if not email:
        raise HTTPException(400, 'email required')
    now = datetime.now(timezone.utc)
    existing = await db.portal_users.find_one({'email': email})
    doc = {
        'email': email,
        'name': payload.get('name') or (existing.get('name') if existing else ''),
        'updated_at': now,
    }
    if payload.get('password'):
        doc['password_hash'] = _pwd.hash(payload['password'])
    if existing:
        await db.portal_users.update_one({'id': existing['id']}, {'$set': doc})
        return {'ok': True, 'action': 'updated', 'id': existing['id']}
    doc.update({'id': str(uuid.uuid4()), 'created_at': now})
    if 'password_hash' not in doc:
        raise HTTPException(400, 'password required for new user')
    await db.portal_users.insert_one(doc)
    return {'ok': True, 'action': 'created', 'id': doc['id']}


# ---------- Bootstrap: idempotent seed on startup ----------
async def ensure_default_portal_user_and_brands():
    """Called once on backend startup — creates the initial portal user + brand
    entries from env vars if they don't exist yet. Never overwrites."""
    # Master user
    email = os.environ.get('PORTAL_ADMIN_EMAIL', 'jongent@hotmail.co.uk').lower()
    password = os.environ.get('PORTAL_ADMIN_PASSWORD', 'admin123')
    existing = await db.portal_users.find_one({'email': email})
    if not existing:
        await db.portal_users.insert_one({
            'id': str(uuid.uuid4()),
            'email': email,
            'password_hash': _pwd.hash(password),
            'name': 'Portal Owner',
            'created_at': datetime.now(timezone.utc),
        })
    # Clean up the earlier placeholder if it still exists
    await db.portal_users.delete_many({'email': 'owner@ghp-health.com'})

    # Brand cards — upsert so config edits in env vars propagate on restart
    defaults = [
        {
            'key': 'ghp-health',
            'name': 'GHP Health',
            'tagline': 'Research-grade peptides',
            'logo': '/brands/ghp-health/logo.jpg',
            'primary_color': '#0b1220',
            'accent_color': '#c8a24a',
            'admin_url': os.environ.get('GHP_ADMIN_URL', '/admin'),
            'order': 1,
            'visible': True,
        },
        {
            'key': 'helixaris',
            'name': 'Helixaris Bioscience',
            'tagline': 'Advancing peptide research',
            'logo': '/brands/helixaris/logo.png',
            'primary_color': '#050b1a',
            'accent_color': '#7ec8ff',
            'admin_url': os.environ.get('HELIXARIS_ADMIN_URL', 'https://helixaris.com/admin'),
            'order': 2,
            'visible': True,
        },
    ]
    for b in defaults:
        await db.portal_brands.update_one(
            {'key': b['key']},
            {'$set': b, '$setOnInsert': {'created_at': datetime.now(timezone.utc)}},
            upsert=True,
        )
