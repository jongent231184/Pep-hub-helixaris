"""Site settings routes - with publish/private gate."""
from datetime import datetime
from fastapi import APIRouter, Depends, Body, HTTPException
from db import db
from models import Settings
from auth import require_admin

router = APIRouter(prefix='/settings', tags=['settings'])


def _strip_private(doc: dict) -> dict:
    """Remove sensitive fields before returning publicly."""
    if not doc:
        return doc
    d = dict(doc)
    d.pop('site_password', None)
    return d


async def _get_or_seed() -> dict:
    doc = await db.settings.find_one({'_singleton': True})
    if not doc:
        s = Settings()
        doc = s.model_dump()
        doc['_singleton'] = True
        await db.settings.insert_one(doc)
    doc.pop('_id', None)
    doc.pop('_singleton', None)
    return doc


@router.get('')
async def get_settings_public():
    """Public settings - site_password is NEVER returned here."""
    doc = await _get_or_seed()
    public = Settings(**_strip_private(doc)).model_dump()
    public.pop('site_password', None)
    return public


@router.get('/admin', response_model=Settings)
async def get_settings_admin(_=Depends(require_admin)):
    """Full settings including site_password (admin-only)."""
    doc = await _get_or_seed()
    return Settings(**doc)


@router.put('', response_model=Settings)
async def update_settings(payload: Settings, _=Depends(require_admin)):
    data = payload.model_dump()
    data['_singleton'] = True
    data['updated_at'] = datetime.utcnow()
    await db.settings.update_one({'_singleton': True}, {'$set': data}, upsert=True)
    data.pop('_singleton', None)
    return Settings(**data)


@router.post('/verify-password')
async def verify_site_password(payload: dict = Body(...)):
    """Public endpoint - check if supplied password matches the site lock password."""
    supplied = (payload or {}).get('password', '')
    doc = await _get_or_seed()
    if doc.get('published'):
        # Site is public; no password needed
        return {'ok': True}
    stored = doc.get('site_password', '') or ''
    if not stored:
        # No password set - block (admin must set one or publish)
        raise HTTPException(401, 'Site is private and no preview password configured')
    if supplied == stored:
        return {'ok': True}
    raise HTTPException(401, 'Incorrect password')
