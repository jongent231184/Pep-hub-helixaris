"""Order routes."""
from datetime import datetime
import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from db import db
from models import OrderCreate, OrderOut, OrderStatusUpdate
from auth import get_current_user_optional, get_current_user, require_admin
from utils import doc_to_dict

router = APIRouter(prefix='/orders', tags=['orders'])


def _gen_order_number() -> str:
    return 'GHP-' + datetime.utcnow().strftime('%Y%m%d') + '-' + uuid.uuid4().hex[:6].upper()


@router.post('', response_model=OrderOut)
async def create_order(payload: OrderCreate, user: Optional[dict] = Depends(get_current_user_optional)):
    now = datetime.utcnow()
    doc = {
        'id': str(uuid.uuid4()),
        'order_number': _gen_order_number(),
        'user_id': user['id'] if user else None,
        'items': [i.model_dump() for i in payload.items],
        'shipping_address': payload.shipping_address.model_dump(),
        'subtotal': payload.subtotal,
        'shipping': payload.shipping,
        'total': payload.total,
        'currency': 'GBP',
        'payment_status': 'pending',
        'payment_provider': 'paypal',
        'payment_id': '',
        'status': 'pending',
        'notes': payload.notes or '',
        'created_at': now,
        'updated_at': now,
    }
    await db.orders.insert_one(doc)
    return OrderOut(**doc_to_dict(doc))


@router.get('/mine', response_model=list[OrderOut])
async def my_orders(user: dict = Depends(get_current_user)):
    docs = await db.orders.find({'user_id': user['id']}).sort('created_at', -1).to_list(200)
    return [OrderOut(**doc_to_dict(d)) for d in docs]


@router.get('/all', response_model=list[OrderOut])
async def all_orders(_=Depends(require_admin)):
    docs = await db.orders.find().sort('created_at', -1).to_list(1000)
    return [OrderOut(**doc_to_dict(d)) for d in docs]


@router.get('/{order_id}', response_model=OrderOut)
async def get_order(order_id: str, user: Optional[dict] = Depends(get_current_user_optional)):
    doc = await db.orders.find_one({'$or': [{'id': order_id}, {'order_number': order_id}]})
    if not doc:
        raise HTTPException(404, 'Order not found')
    # Allow if user owns it or is admin, or anonymous order (no user)
    if doc.get('user_id') and (not user or (user.get('role') != 'admin' and user['id'] != doc['user_id'])):
        raise HTTPException(403, 'Forbidden')
    return OrderOut(**doc_to_dict(doc))


@router.patch('/{order_id}', response_model=OrderOut)
async def update_order_status(order_id: str, payload: OrderStatusUpdate, _=Depends(require_admin)):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, 'No fields to update')
    updates['updated_at'] = datetime.utcnow()
    res = await db.orders.find_one_and_update(
        {'id': order_id}, {'$set': updates}, return_document=True
    )
    if not res:
        raise HTTPException(404, 'Order not found')
    return OrderOut(**doc_to_dict(res))


@router.delete('/{order_id}')
async def delete_order(order_id: str, _=Depends(require_admin)):
    res = await db.orders.delete_one({'id': order_id})
    if res.deleted_count == 0:
        raise HTTPException(404, 'Order not found')
    return {'ok': True}
