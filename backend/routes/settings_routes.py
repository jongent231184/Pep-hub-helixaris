"""Site settings routes."""
from datetime import datetime
from fastapi import APIRouter, Depends
from db import db
from models import Settings
from auth import require_admin

router = APIRouter(prefix='/settings', tags=['settings'])


@router.get('', response_model=Settings)
async def get_settings():
    doc = await db.settings.find_one({'_singleton': True})
    if not doc:
        s = Settings()
        doc = s.model_dump()
        doc['_singleton'] = True
        await db.settings.insert_one(doc)
        return s
    doc.pop('_id', None)
    doc.pop('_singleton', None)
    return Settings(**doc)


@router.put('', response_model=Settings)
async def update_settings(payload: Settings, _=Depends(require_admin)):
    data = payload.model_dump()
    data['_singleton'] = True
    data['updated_at'] = datetime.utcnow()
    await db.settings.update_one(
        {'_singleton': True}, {'$set': data}, upsert=True
    )
    data.pop('_singleton', None)
    return Settings(**data)
