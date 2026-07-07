"""Order routes."""
from datetime import datetime
import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from db import db
from models import (
    OrderCreate, OrderOut, OrderStatusUpdate,
    PaylinkCreate, PaylinkAddress,
)
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

    # Server-side price re-computation from the catalog so a client can't
    # fabricate an item price by editing the payload. For each item we use
    # the variant price if a matching option was selected, otherwise the
    # base product price.
    priced_items: list[dict] = []
    subtotal_server = 0.0
    for item in payload.items:
        prod = await db.products.find_one({'id': item.product_id})
        if not prod:
            raise HTTPException(400, f"Unknown product: {item.name or item.product_id}")
        server_price = float(prod.get('price', 0) or 0)
        if item.option:
            for v in prod.get('variants', []) or []:
                if str(v.get('label', '')).strip().lower() == item.option.strip().lower():
                    server_price = float(v.get('price', server_price) or server_price)
                    break
        line = item.model_dump()
        line['price'] = server_price
        priced_items.append(line)
        subtotal_server += server_price * int(item.qty)
    subtotal_server = round(subtotal_server, 2)

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
            min_ok = subtotal_server >= float(promo.get('min_subtotal', 0))
            if exp_ok and uses_ok and min_ok:
                ptype = promo.get('type', 'percent')
                value = float(promo.get('value', 0))
                if ptype == 'percent':
                    discount = round(subtotal_server * (value / 100.0), 2)
                elif ptype == 'fixed':
                    discount = round(min(value, subtotal_server), 2)
                elif ptype == 'free_shipping':
                    shipping_final = 0.0
                promo_code_stored = code

    total_final = round(max(0.0, subtotal_server - discount) + shipping_final, 2)

    doc = {
        'id': str(uuid.uuid4()),
        'order_number': await _next_order_number(),
        'user_id': user['id'] if user else None,
        'items': priced_items,
        'shipping_address': payload.shipping_address.model_dump(),
        'subtotal': subtotal_server,
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
    out = []
    for d in docs:
        try:
            out.append(OrderOut(**doc_to_dict(d)))
        except Exception as e:
            oid = d.get('id') or d.get('order_number') or str(d.get('_id'))
            print(f"[orders/all] skipping malformed order {oid}: {e}")
    return out


@router.get('/paylinks', response_model=list[OrderOut])
async def list_paylinks(_=Depends(require_admin)):
    """Admin — list every order created via a pay link (past & pending)."""
    docs = await db.orders.find({'source': 'paylink'}).sort('created_at', -1).to_list(1000)
    out = []
    for d in docs:
        try:
            out.append(OrderOut(**doc_to_dict(d)))
        except Exception as e:
            print(f"[orders/paylinks] skip {d.get('order_number')}: {e}")
    return out


# ============ PAY LINKS ============
# Admin creates a pending order the customer pays via a public URL.

def _placeholder_address() -> dict:
    """Empty shipping address so the OrderOut schema stays valid until the
    customer fills their real one in on the pay page. Uses a valid-format
    email domain (EmailStr rejects .local TLDs)."""
    return {
        'first_name': '', 'last_name': '', 'email': 'pending@ghp-health.com',
        'phone': '', 'address1': '', 'address2': '',
        'city': '', 'postcode': '', 'country': 'United Kingdom',
    }


@router.post('/paylink', response_model=OrderOut)
async def create_paylink(payload: PaylinkCreate, _=Depends(require_admin)):
    """Create a pending order with no shipping address. Returns the order so
    the admin can share `/pay/{order_id}` with the customer."""
    now = datetime.utcnow()

    # Server-side pricing from the catalog (mirrors POST /orders). Custom
    # "Other" lines (no product_id) use the admin-supplied name/price directly.
    priced_items = []
    subtotal_server = 0.0
    for it in payload.items:
        if it.product_id:
            prod = await db.products.find_one({'id': it.product_id})
            if not prod:
                raise HTTPException(400, f"Unknown product id: {it.product_id}")
            price = float(prod.get('price', 0) or 0)
            if it.option:
                for v in prod.get('variants', []) or []:
                    if str(v.get('label', '')).strip().lower() == it.option.strip().lower():
                        price = float(v.get('price', price) or price)
                        break
            line = {
                'product_id': it.product_id,
                'slug': prod.get('slug', ''),
                'name': prod.get('name', ''),
                'image': prod.get('image', ''),
                'option': it.option,
                'qty': int(it.qty),
                'price': price,
            }
        else:
            # Custom "Other" line — description + price provided by admin
            if not it.name or not it.name.strip():
                raise HTTPException(400, 'Custom line item requires a description')
            if it.price is None or float(it.price) < 0:
                raise HTTPException(400, 'Custom line item requires a valid price')
            price = float(it.price)
            line = {
                'product_id': None,
                'slug': 'custom',
                'name': it.name.strip(),
                'image': '',
                'option': None,
                'qty': int(it.qty),
                'price': price,
            }
        priced_items.append(line)
        subtotal_server += price * int(it.qty)
    subtotal_server = round(subtotal_server, 2)

    # Shipping from settings unless overridden
    if payload.shipping is None:
        settings = await db.settings.find_one({}) or {}
        flat = float(settings.get('flat_shipping', 4.99))
        threshold = float(settings.get('free_shipping_threshold', 50))
        shipping_final = 0.0 if subtotal_server >= threshold else flat
    else:
        shipping_final = float(payload.shipping)

    # Server-side promo re-validation (same rules as POST /orders)
    discount = 0.0
    promo_code_stored = None
    if payload.promo_code:
        code = payload.promo_code.strip().upper()
        promo = await db.promos.find_one({'code': code})
        if promo and promo.get('active', True):
            exp = promo.get('expires_at')
            exp_ok = not exp or (isinstance(exp, datetime) and exp.replace(tzinfo=None) >= datetime.utcnow())
            max_uses = promo.get('max_uses')
            uses_ok = max_uses is None or int(promo.get('uses', 0)) < int(max_uses)
            min_ok = subtotal_server >= float(promo.get('min_subtotal', 0))
            if exp_ok and uses_ok and min_ok:
                ptype = promo.get('type', 'percent')
                value = float(promo.get('value', 0))
                if ptype == 'percent':
                    discount = round(subtotal_server * (value / 100.0), 2)
                elif ptype == 'fixed':
                    discount = round(min(value, subtotal_server), 2)
                elif ptype == 'free_shipping':
                    shipping_final = 0.0
                promo_code_stored = code

    total_final = round(max(0.0, subtotal_server - discount) + shipping_final, 2)

    # Pre-fill address hints if admin supplied a name/email
    addr = _placeholder_address()
    if payload.customer_name:
        parts = payload.customer_name.strip().split(' ', 1)
        addr['first_name'] = parts[0]
        addr['last_name'] = parts[1] if len(parts) > 1 else ''
    if payload.customer_email:
        addr['email'] = payload.customer_email

    doc = {
        'id': str(uuid.uuid4()),
        'order_number': await _next_order_number(),
        'user_id': None,
        'items': priced_items,
        'shipping_address': addr,
        'subtotal': subtotal_server,
        'shipping': shipping_final,
        'discount': discount,
        'promo_code': promo_code_stored,
        'total': total_final,
        'currency': 'GBP',
        'payment_status': 'pending',
        'payment_provider': 'paypal',
        'payment_id': '',
        'status': 'pending',
        'source': 'paylink',
        'notes': payload.notes or '',
        'created_at': now,
        'updated_at': now,
    }
    await db.orders.insert_one(doc)
    return OrderOut(**doc_to_dict(doc))


@router.get('/pay/{order_id}', response_model=OrderOut)
async def get_paylink_public(order_id: str):
    """Public — the customer opens their pay link with the order_id (UUID).
    Only returns paylink orders (any status; the frontend shows 'already paid'
    or 'pay now' based on payment_status)."""
    doc = await db.orders.find_one({'id': order_id, 'source': 'paylink'})
    if not doc:
        raise HTTPException(404, 'Pay link not found')
    return OrderOut(**doc_to_dict(doc))


@router.put('/pay/{order_id}/address', response_model=OrderOut)
async def set_paylink_address(order_id: str, payload: PaylinkAddress):
    """Public — customer sets their shipping address before paying. Only
    allowed while the order is still pending."""
    doc = await db.orders.find_one({'id': order_id, 'source': 'paylink'})
    if not doc:
        raise HTTPException(404, 'Pay link not found')
    if doc.get('payment_status') == 'paid':
        raise HTTPException(409, 'This order has already been paid')
    res = await db.orders.find_one_and_update(
        {'id': order_id, 'source': 'paylink', 'payment_status': {'$ne': 'paid'}},
        {'$set': {
            'shipping_address': payload.model_dump(),
            'updated_at': datetime.utcnow(),
        }},
        return_document=True,
    )
    return OrderOut(**doc_to_dict(res))


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
