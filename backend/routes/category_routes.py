"""Category routes."""
from datetime import datetime
import uuid
from fastapi import APIRouter, HTTPException, Depends
from db import db
from models import CategoryCreate, CategoryUpdate, CategoryOut
from auth import require_admin
from utils import doc_to_dict

router = APIRouter(prefix='/categories', tags=['categories'])


@router.get('', response_model=list[CategoryOut])
async def list_categories():
    docs = await db.categories.find({'visible': True}).sort('sort_order', 1).to_list(200)
    return [CategoryOut(**doc_to_dict(d)) for d in docs]


@router.get('/all', response_model=list[CategoryOut])
async def list_all_categories(_=Depends(require_admin)):
    docs = await db.categories.find().sort('sort_order', 1).to_list(200)
    return [CategoryOut(**doc_to_dict(d)) for d in docs]


@router.post('', response_model=CategoryOut)
async def create_category(payload: CategoryCreate, _=Depends(require_admin)):
    if await db.categories.find_one({'slug': payload.slug}):
        raise HTTPException(400, 'slug already exists')
    doc = payload.model_dump()
    doc['id'] = str(uuid.uuid4())
    doc['created_at'] = datetime.utcnow()
    await db.categories.insert_one(doc)
    return CategoryOut(**doc_to_dict(doc))


@router.put('/{cat_id}', response_model=CategoryOut)
async def update_category(cat_id: str, payload: CategoryUpdate, _=Depends(require_admin)):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, 'No fields to update')
    res = await db.categories.find_one_and_update(
        {'id': cat_id},
        {'$set': updates},
        return_document=True
    )
    if not res:
        raise HTTPException(404, 'Category not found')
    return CategoryOut(**doc_to_dict(res))


@router.delete('/{cat_id}')
async def delete_category(cat_id: str, _=Depends(require_admin)):
    res = await db.categories.delete_one({'id': cat_id})
    if res.deleted_count == 0:
        raise HTTPException(404, 'Category not found')
    return {'ok': True}
