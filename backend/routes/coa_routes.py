"""COA (Certificate of Analysis) routes.

Public:
- GET /api/coas                 List visible COAs

Admin:
- GET    /api/coas/all
- POST   /api/coas
- PUT    /api/coas/{id}
- DELETE /api/coas/{id}
"""
from datetime import datetime
import uuid
from fastapi import APIRouter, HTTPException, Depends
from db import db
from models import CoaCreate, CoaUpdate, CoaOut
from auth import require_admin
from utils import doc_to_dict

router = APIRouter(prefix='/coas', tags=['coas'])


@router.get('', response_model=list[CoaOut])
async def list_public_coas():
    docs = await db.coas.find({'visible': True}).sort(
        [('sort_order', 1), ('created_at', -1)]
    ).to_list(500)
    return [CoaOut(**doc_to_dict(d)) for d in docs]


@router.get('/all', response_model=list[CoaOut])
async def list_all_coas(_=Depends(require_admin)):
    docs = await db.coas.find().sort(
        [('sort_order', 1), ('created_at', -1)]
    ).to_list(500)
    return [CoaOut(**doc_to_dict(d)) for d in docs]


@router.post('', response_model=CoaOut)
async def create_coa(payload: CoaCreate, _=Depends(require_admin)):
    now = datetime.utcnow()
    doc = payload.model_dump()
    doc.update({
        'id': str(uuid.uuid4()),
        'created_at': now,
        'updated_at': now,
    })
    await db.coas.insert_one(doc)
    return CoaOut(**doc_to_dict(doc))


@router.put('/{coa_id}', response_model=CoaOut)
async def update_coa(coa_id: str, payload: CoaUpdate, _=Depends(require_admin)):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, 'No fields to update')
    updates['updated_at'] = datetime.utcnow()
    res = await db.coas.find_one_and_update(
        {'id': coa_id}, {'$set': updates}, return_document=True
    )
    if not res:
        raise HTTPException(404, 'COA not found')
    return CoaOut(**doc_to_dict(res))


@router.delete('/{coa_id}')
async def delete_coa(coa_id: str, _=Depends(require_admin)):
    res = await db.coas.delete_one({'id': coa_id})
    if res.deleted_count == 0:
        raise HTTPException(404, 'COA not found')
    return {'ok': True}
