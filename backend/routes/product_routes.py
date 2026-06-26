"""Product routes."""
from datetime import datetime
import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from db import db
from models import ProductCreate, ProductUpdate, ProductOut
from auth import require_admin
from utils import doc_to_dict

router = APIRouter(prefix='/products', tags=['products'])


@router.get('', response_model=list[ProductOut])
async def list_products(
    category: Optional[str] = None,
    q: Optional[str] = None,
    featured: Optional[bool] = None,
    sort: str = 'name-asc',
    limit: int = 200,
):
    flt = {'visible': True}
    if category:
        flt['category'] = category
    if featured is not None:
        flt['featured'] = featured
    if q:
        flt['name'] = {'$regex': q, '$options': 'i'}

    sort_map = {
        'name-asc': ('name', 1), 'name-desc': ('name', -1),
        'price-asc': ('price', 1), 'price-desc': ('price', -1),
        'latest': ('created_at', -1), 'popular': ('featured', -1)
    }
    field, direction = sort_map.get(sort, ('name', 1))
    docs = await db.products.find(flt).sort(field, direction).to_list(limit)
    return [ProductOut(**doc_to_dict(d)) for d in docs]


@router.get('/all', response_model=list[ProductOut])
async def admin_list_all(_=Depends(require_admin)):
    docs = await db.products.find().sort('updated_at', -1).to_list(1000)
    return [ProductOut(**doc_to_dict(d)) for d in docs]


@router.get('/{slug}', response_model=ProductOut)
async def get_product(slug: str):
    doc = await db.products.find_one({'slug': slug})
    if not doc:
        raise HTTPException(404, 'Product not found')
    return ProductOut(**doc_to_dict(doc))


@router.get('/id/{product_id}', response_model=ProductOut)
async def get_product_by_id(product_id: str, _=Depends(require_admin)):
    doc = await db.products.find_one({'id': product_id})
    if not doc:
        raise HTTPException(404, 'Product not found')
    return ProductOut(**doc_to_dict(doc))


@router.post('', response_model=ProductOut)
async def create_product(payload: ProductCreate, _=Depends(require_admin)):
    if await db.products.find_one({'slug': payload.slug}):
        raise HTTPException(400, 'slug already exists')
    now = datetime.utcnow()
    doc = payload.model_dump()
    doc.update({'id': str(uuid.uuid4()), 'created_at': now, 'updated_at': now})
    await db.products.insert_one(doc)
    return ProductOut(**doc_to_dict(doc))


@router.put('/{product_id}', response_model=ProductOut)
async def update_product(product_id: str, payload: ProductUpdate, _=Depends(require_admin)):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, 'No fields to update')
    updates['updated_at'] = datetime.utcnow()
    res = await db.products.find_one_and_update(
        {'id': product_id}, {'$set': updates}, return_document=True
    )
    if not res:
        raise HTTPException(404, 'Product not found')
    return ProductOut(**doc_to_dict(res))


@router.delete('/{product_id}')
async def delete_product(product_id: str, _=Depends(require_admin)):
    res = await db.products.delete_one({'id': product_id})
    if res.deleted_count == 0:
        raise HTTPException(404, 'Product not found')
    return {'ok': True}
