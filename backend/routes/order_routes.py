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
    # Legacy generator (random) — no longer used. Kept for reference.
    return 'GHP-' + datetime.utcnow().strftime('%Y%m%d') + '-' + uuid.uuid4().hex[:6].upper()


async def _next_order_number() -> str:
    """Sequential order number, starts at GHP-001 and grows to GHP-999, GHP-1000..."""
    counter = await db.counters.find_one_and_update(
        {'_id': 'orders'},
        {'$inc': {'seq': 1}},
        upsert=True,
        return_document=True,
    )
    seq = counter.get('seq', 1)
    return f'GHP-{seq:03d}'


@router.post('', response_model=OrderOut)
async def create_order(payload: OrderCreate, user: Optional[dict] = Depends(get_current_user_optional)):
    now = datetime.utcnow()

    # Server-side promo re-validation so the client can't fabricate discounts.
    discount = 0.0
    shipping_final = float(payload.shipping)
    promo_code_stored: Optional[str] = None
    if payload.promo_code:
        code = payload.promo_code.strip().upper()
        promo = await db.promos.find_one({'code': code})
        if promo and promo.get('active', True):
            exp = promo.get('expires_at')
            exp_ok = not exp or (isinstance(exp, datetime) and exp.replace(tzinfo=None) >= datetime.utcnow())
            max_uses = promo.get('max_uses')
            uses_ok = max_uses is None or int(promo.get('uses', 0)) < int(max_uses)
            min_ok = float(payload.subtotal) >= float(promo.get('min_subtotal', 0))
            if exp_ok and uses_ok and min_ok:
                ptype = promo.get('type', 'percent')
                value = float(promo.get('value', 0))
                if ptype == 'percent':
                    discount = round(payload.subtotal * (value / 100.0), 2)
                elif ptype == 'fixed':
                    discount = round(min(value, payload.subtotal), 2)
                elif ptype == 'free_shipping':
                    shipping_final = 0.0
                promo_code_stored = code

    total_final = round(max(0.0, payload.subtotal - discount) + shipping_final, 2)

    doc = {
        'id': str(uuid.uuid4()),
        'order_number': await _next_order_number(),
        'user_id': user['id'] if user else None,
        'items': [i.model_dump() for i in payload.items],
        'shipping_address': payload.shipping_address.model_dump(),
        'subtotal': payload.subtotal,
        'shipping': shipping_final,
        'discount': discount,
        'promo_code': promo_code_stored,
        'total': total_final,
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
