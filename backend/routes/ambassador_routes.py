"""Ambassador program routes.

Admin endpoints (require_admin):
- POST   /api/ambassadors/admin          Create ambassador account + linked promo
- GET    /api/ambassadors/admin          List all ambassadors with earnings
- GET    /api/ambassadors/admin/{id}     Get single ambassador w/ payouts
- PUT    /api/ambassadors/admin/{id}     Update
- DELETE /api/ambassadors/admin/{id}     Remove ambassador role (soft-delete)
- POST   /api/ambassadors/admin/{id}/payouts   Record a payout
- DELETE /api/ambassadors/admin/{id}/payouts/{payout_id}

Ambassador endpoints (require_ambassador):
- GET /api/ambassadors/me           Own profile + earnings
- GET /api/ambassadors/orders       Orders that used their code (paid only)
- GET /api/ambassadors/orders/{id}  Full order details (must match their code)
- GET /api/ambassadors/payouts      History of payouts received
"""
from datetime import datetime
import logging
import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from db import db
from auth import require_admin, require_ambassador, hash_password
from utils import doc_to_dict
from models import (
    AmbassadorCreate, AmbassadorUpdate, PayoutCreate,
    UserOut, PayoutOut,
)

router = APIRouter(prefix='/ambassadors', tags=['ambassadors'])


def _norm_code(code: str) -> str:
    return (code or '').strip().upper()


async def _compute_earnings(user_id: str, code: str, commission_rate: float) -> dict:
    """Aggregate paid orders using the ambassador's code and compute earnings.
    Commission base = subtotal - discount (net product sales, ex-shipping).
    Paid vs pending commission is derived from the `ambassador_commission_paid`
    flag on each order — the payout record is the audit trail, but the per-order
    flag is the source of truth for what's settled."""
    if not code:
        return {
            'orders_count': 0, 'orders_paid_count': 0, 'orders_pending_count': 0,
            'net_sales': 0.0, 'gross_total': 0.0,
            'commission_earned': 0.0, 'total_paid_out': 0.0, 'pending_payout': 0.0,
        }
    rate = float(commission_rate or 0) / 100.0
    pipeline = [
        {'$match': {'promo_code': code, 'payment_status': 'paid'}},
        {'$group': {
            '_id': {'$ifNull': ['$ambassador_commission_paid', False]},
            'count': {'$sum': 1},
            'net_sales': {'$sum': {'$subtract': [
                {'$ifNull': ['$subtotal', 0]}, {'$ifNull': ['$discount', 0]}
            ]}},
            'gross_total': {'$sum': {'$ifNull': ['$total', 0]}},
        }},
    ]
    total_count = 0
    total_net = 0.0
    total_gross = 0.0
    paid_net = 0.0
    paid_count = 0
    async for grp in db.orders.aggregate(pipeline):
        cnt = int(grp.get('count', 0) or 0)
        net = float(grp.get('net_sales', 0) or 0)
        gross = float(grp.get('gross_total', 0) or 0)
        total_count += cnt
        total_net += net
        total_gross += gross
        if grp['_id'] is True:
            paid_net += net
            paid_count += cnt

    commission_earned = round(total_net * rate, 2)
    commission_paid = round(paid_net * rate, 2)
    return {
        'orders_count': total_count,
        'orders_paid_count': paid_count,
        'orders_pending_count': total_count - paid_count,
        'net_sales': round(total_net, 2),
        'gross_total': round(total_gross, 2),
        'commission_earned': commission_earned,
        'total_paid_out': commission_paid,
        'pending_payout': round(commission_earned - commission_paid, 2),
    }


async def _upsert_promo_for_ambassador(code: str, customer_discount: float, active: bool):
    """Create or update the promo code linked to this ambassador."""
    now = datetime.utcnow()
    existing = await db.promos.find_one({'code': code})
    if existing:
        await db.promos.update_one(
            {'code': code},
            {'$set': {
                'value': float(customer_discount),
                'type': 'percent',
                'active': bool(active),
                'updated_at': now,
            }}
        )
    else:
        await db.promos.insert_one({
            'id': str(uuid.uuid4()),
            'code': code,
            'type': 'percent',
            'value': float(customer_discount),
            'active': bool(active),
            'min_subtotal': 0.0,
            'max_uses': None,
            'expires_at': None,
            'uses': 0,
            'created_at': now,
            'updated_at': now,
        })


# ============ ADMIN ============
@router.post('/admin')
async def create_ambassador(payload: AmbassadorCreate, _=Depends(require_admin)):
    email = payload.email.lower().strip()
    code = _norm_code(payload.ambassador_code)
    if not code:
        raise HTTPException(400, 'ambassador_code is required')
    if await db.users.find_one({'email': email}):
        raise HTTPException(409, 'A user with that email already exists')
    if await db.users.find_one({'ambassador_code': code}):
        raise HTTPException(409, 'That ambassador code is already assigned')
    existing_promo = await db.promos.find_one({'code': code})
    if existing_promo:
        raise HTTPException(409, 'That promo code already exists — pick another')

    now = datetime.utcnow()
    user_doc = {
        'id': str(uuid.uuid4()),
        'email': email,
        'password_hash': hash_password(payload.password),
        'first_name': payload.first_name or '',
        'last_name': payload.last_name or '',
        'role': 'ambassador',
        'ambassador_code': code,
        'commission_rate': float(payload.commission_rate),
        'customer_discount': float(payload.customer_discount),
        'ambassador_active': True,
        'created_at': now,
    }
    await db.users.insert_one(user_doc)
    await _upsert_promo_for_ambassador(code, payload.customer_discount, active=True)

    # Fire welcome email (async, non-blocking). Failure is logged inside the
    # email service — never bubbles up to fail the admin's create request.
    try:
        from email_service import send_ambassador_welcome
        await send_ambassador_welcome(user_doc, temp_password=payload.password)
    except Exception as e:
        # Belt-and-braces — email_service already swallows its own errors,
        # but if import itself fails we still don't want to fail the create.
        logger = logging.getLogger('ghp.ambassador')
        logger.warning(f'ambassador welcome dispatch errored (non-fatal): {e}')

    return {
        'user': doc_to_dict(user_doc),
        'earnings': await _compute_earnings(user_doc['id'], code, payload.commission_rate),
    }


@router.post('/admin/{ambassador_id}/resend-welcome')
async def resend_welcome(ambassador_id: str, _=Depends(require_admin)):
    """Manually re-fire the welcome email (without a password — we don't
    store plaintext passwords). Useful for the ones created before the
    automated flow existed."""
    from email_service import send_ambassador_welcome
    d = await db.users.find_one({'id': ambassador_id, 'role': 'ambassador'})
    if not d:
        raise HTTPException(404, 'Ambassador not found')
    msg_id = await send_ambassador_welcome(d, temp_password=None)
    if not msg_id:
        raise HTTPException(502, 'Could not send welcome email — check RESEND_API_KEY / logs')
    return {'ok': True, 'message_id': msg_id, 'sent_to': d.get('email')}


@router.get('/admin')
async def list_ambassadors(_=Depends(require_admin)):
    docs = await db.users.find({'role': 'ambassador'}).sort('created_at', -1).to_list(500)
    out = []
    for d in docs:
        earnings = await _compute_earnings(
            d['id'], d.get('ambassador_code', ''), d.get('commission_rate', 15.0)
        )
        out.append({
            'user': doc_to_dict(d),
            'earnings': earnings,
        })
    return out


@router.get('/admin/{ambassador_id}')
async def get_ambassador(ambassador_id: str, _=Depends(require_admin)):
    d = await db.users.find_one({'id': ambassador_id, 'role': 'ambassador'})
    if not d:
        raise HTTPException(404, 'Ambassador not found')
    code = d.get('ambassador_code', '')
    earnings = await _compute_earnings(
        d['id'], code, d.get('commission_rate', 15.0)
    )
    payouts_docs = await db.payouts.find(
        {'ambassador_user_id': ambassador_id}
    ).sort('created_at', -1).to_list(500)
    orders_docs = []
    if code:
        orders_docs = await db.orders.find(
            {'promo_code': code, 'payment_status': 'paid'}
        ).sort('created_at', -1).to_list(500)
    return {
        'user': doc_to_dict(d),
        'earnings': earnings,
        'payouts': [doc_to_dict(p) for p in payouts_docs],
        'orders': [doc_to_dict(o) for o in orders_docs],
    }


@router.put('/admin/{ambassador_id}')
async def update_ambassador(ambassador_id: str, payload: AmbassadorUpdate, _=Depends(require_admin)):
    existing = await db.users.find_one({'id': ambassador_id, 'role': 'ambassador'})
    if not existing:
        raise HTTPException(404, 'Ambassador not found')
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    old_code = existing.get('ambassador_code', '')
    new_code = old_code

    if 'ambassador_code' in updates:
        new_code = _norm_code(updates['ambassador_code'])
        updates['ambassador_code'] = new_code
        if new_code != old_code:
            clash = await db.users.find_one(
                {'ambassador_code': new_code, 'id': {'$ne': ambassador_id}}
            )
            if clash:
                raise HTTPException(409, 'That ambassador code is taken')
            promo_clash = await db.promos.find_one({'code': new_code})
            if promo_clash:
                raise HTTPException(409, 'That promo code already exists — pick another')

    if updates:
        await db.users.update_one({'id': ambassador_id}, {'$set': updates})

    # Sync the promo doc
    final = await db.users.find_one({'id': ambassador_id})
    active = bool(final.get('ambassador_active', True))
    disc = float(final.get('customer_discount', 10.0))
    if new_code and new_code != old_code and old_code:
        # Rename the promo (mark old inactive, create new)
        await db.promos.update_one(
            {'code': old_code}, {'$set': {'active': False, 'updated_at': datetime.utcnow()}}
        )
    if new_code:
        await _upsert_promo_for_ambassador(new_code, disc, active=active)

    earnings = await _compute_earnings(
        final['id'], final.get('ambassador_code', ''), final.get('commission_rate', 15.0)
    )
    return {'user': doc_to_dict(final), 'earnings': earnings}


@router.delete('/admin/{ambassador_id}')
async def remove_ambassador(ambassador_id: str, _=Depends(require_admin)):
    """Soft-delete: revert role to customer and deactivate their promo code.
    We keep the user + payout history for accounting."""
    existing = await db.users.find_one({'id': ambassador_id, 'role': 'ambassador'})
    if not existing:
        raise HTTPException(404, 'Ambassador not found')
    code = existing.get('ambassador_code', '')
    await db.users.update_one(
        {'id': ambassador_id},
        {'$set': {'role': 'customer', 'ambassador_active': False}}
    )
    if code:
        await db.promos.update_one(
            {'code': code}, {'$set': {'active': False, 'updated_at': datetime.utcnow()}}
        )
    return {'ok': True}


@router.post('/admin/{ambassador_id}/payouts', response_model=PayoutOut)
async def create_payout(ambassador_id: str, payload: PayoutCreate, _=Depends(require_admin)):
    existing = await db.users.find_one({'id': ambassador_id, 'role': 'ambassador'})
    if not existing:
        raise HTTPException(404, 'Ambassador not found')
    if float(payload.amount) <= 0:
        raise HTTPException(400, 'Amount must be > 0')

    code = existing.get('ambassador_code', '')
    order_ids = list(dict.fromkeys(payload.order_ids or []))  # dedupe, keep order
    order_numbers: list[str] = []

    if order_ids:
        # Validate: each order must belong to this ambassador, be paid, and
        # have commission not-yet-paid — otherwise we'd double-pay.
        docs = await db.orders.find({'id': {'$in': order_ids}}).to_list(len(order_ids))
        by_id = {d['id']: d for d in docs}
        for oid in order_ids:
            o = by_id.get(oid)
            if not o:
                raise HTTPException(400, f'Order not found: {oid}')
            if o.get('promo_code') != code:
                raise HTTPException(400, f'Order {o.get("order_number")} does not use this ambassador’s code')
            if o.get('payment_status') != 'paid':
                raise HTTPException(400, f'Order {o.get("order_number")} is not marked paid yet')
            if o.get('ambassador_commission_paid'):
                raise HTTPException(400, f'Order {o.get("order_number")} commission is already paid')
            order_numbers.append(o.get('order_number', ''))

    payout_id = str(uuid.uuid4())
    doc = {
        'id': payout_id,
        'ambassador_user_id': ambassador_id,
        'amount': round(float(payload.amount), 2),
        'note': payload.note or '',
        'order_ids': order_ids,
        'order_numbers': order_numbers,
        'created_at': datetime.utcnow(),
    }
    await db.payouts.insert_one(doc)

    if order_ids:
        await db.orders.update_many(
            {'id': {'$in': order_ids}},
            {'$set': {
                'ambassador_commission_paid': True,
                'ambassador_payout_id': payout_id,
                'ambassador_commission_paid_at': datetime.utcnow(),
            }}
        )

    return PayoutOut(**doc_to_dict(doc))


@router.delete('/admin/{ambassador_id}/payouts/{payout_id}')
async def delete_payout(ambassador_id: str, payout_id: str, _=Depends(require_admin)):
    payout = await db.payouts.find_one({'id': payout_id, 'ambassador_user_id': ambassador_id})
    if not payout:
        raise HTTPException(404, 'Payout not found')
    order_ids = payout.get('order_ids') or []
    if order_ids:
        # Revert paid flag on the orders this payout covered
        await db.orders.update_many(
            {'id': {'$in': order_ids}, 'ambassador_payout_id': payout_id},
            {'$set': {'ambassador_commission_paid': False},
             '$unset': {'ambassador_payout_id': '', 'ambassador_commission_paid_at': ''}}
        )
    await db.payouts.delete_one({'id': payout_id, 'ambassador_user_id': ambassador_id})
    return {'ok': True}


# ============ AMBASSADOR SELF-SERVICE ============
@router.get('/me')
async def ambassador_me(user: dict = Depends(require_ambassador)):
    code = user.get('ambassador_code', '')
    earnings = await _compute_earnings(user['id'], code, user.get('commission_rate', 15.0))
    return {
        'user': doc_to_dict(user),
        'earnings': earnings,
    }


@router.get('/orders')
async def ambassador_orders(user: dict = Depends(require_ambassador)):
    code = user.get('ambassador_code', '')
    if not code:
        return []
    docs = await db.orders.find({
        'promo_code': code, 'payment_status': 'paid'
    }).sort('created_at', -1).to_list(1000)
    # Return light dicts (skip strict OrderOut to avoid schema drift issues)
    return [doc_to_dict(d) for d in docs]


@router.get('/orders/{order_id}')
async def ambassador_order_detail(order_id: str, user: dict = Depends(require_ambassador)):
    code = user.get('ambassador_code', '')
    if not code:
        raise HTTPException(404, 'Order not found')
    doc = await db.orders.find_one({
        '$or': [{'id': order_id}, {'order_number': order_id}],
        'promo_code': code,
        'payment_status': 'paid',
    })
    if not doc:
        raise HTTPException(404, 'Order not found')
    return doc_to_dict(doc)


@router.get('/payouts')
async def my_payouts(user: dict = Depends(require_ambassador)):
    docs = await db.payouts.find(
        {'ambassador_user_id': user['id']}
    ).sort('created_at', -1).to_list(500)
    return [doc_to_dict(d) for d in docs]
