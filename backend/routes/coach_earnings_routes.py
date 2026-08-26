"""Coach earnings & payouts — mirrors the ambassador flow, but attribution is
by coaching-client relationship rather than promo code, and the amount owed
to the coach is the full order total (admin decides how much to actually pay
out on each settlement).

Data model additions:
  orders.coach_payout_paid       bool   — True once the coach has been paid for this order
  orders.coach_payout_id         str    — id of the payout that settled this order
  orders.coach_payout_paid_at    dt
  orders.coach_user_id           str    — stamped at settlement time so we can query "orders owed to coach X"
                                          (denormalised because attribution is via coaching_clients
                                          which can change over time)
  db.coach_payouts               new collection: {id, coach_user_id, amount, note,
                                                  order_ids[], order_numbers[], created_at}

Attribution rule (source of truth):
  A paid order is attributed to a coach if the order's user_id maps to a
  coaching_clients doc for that coach (ever — not just currently active).
"""
from datetime import datetime, timezone
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from db import db
from auth import require_admin, require_coach
from utils import doc_to_dict

router = APIRouter(prefix='/coaching', tags=['coaching-earnings'])


# ---------------- Pydantic ----------------
class CoachPayoutCreate(BaseModel):
    amount: float
    note: Optional[str] = ''
    order_ids: Optional[list[str]] = None


# ---------------- Helpers ----------------
async def _customer_ids_for_coach(coach_id: str) -> list[str]:  # kept for reference / future use
    """Every customer this coach has (or has ever had) a coaching relationship with."""
    docs = await db.coaching_clients.find(
        {'coach_id': coach_id, 'customer_user_id': {'$ne': None}},
        {'customer_user_id': 1, '_id': 0},
    ).to_list(1000)
    return list({d['customer_user_id'] for d in docs if d.get('customer_user_id')})


async def _orders_for_coach(coach_id: str) -> list[dict]:
    """Paid coaching invoices/paylinks attributed to this coach.

    Counts an order if EITHER:
      • `purpose == 'coaching'`, OR
      • any line item has `slug == 'coaching-plan'`  (catches legacy orders
        created before the `purpose` field was introduced)

    Attribution priority:
      1. `orders.coach_user_id` denorm stamp
      2. `orders.protocol_id` → `protocols.coach_id`
    """
    proto_ids = [
        p['id'] async for p in db.protocols.find(
            {'coach_id': coach_id}, {'id': 1, '_id': 0}
        )
    ]
    coaching_selector = {
        '$or': [
            {'purpose': 'coaching'},
            {'items.slug': 'coaching-plan'},
        ],
    }
    attribution_selector = {
        '$or': [
            {'coach_user_id': coach_id},
            {'protocol_id': {'$in': proto_ids}} if proto_ids else {'_never': True},
        ],
    }
    query = {
        'payment_status': 'paid',
        '$and': [coaching_selector, attribution_selector],
    }
    docs = await db.orders.find(query).sort('created_at', -1).to_list(2000)
    return docs


def _looks_like_coaching_order(order: dict) -> bool:
    if order.get('purpose') == 'coaching':
        return True
    for item in order.get('items') or []:
        if item.get('slug') == 'coaching-plan':
            return True
    return False


async def _order_attributable_to_coach(order: dict, coach_id: str) -> bool:
    if not _looks_like_coaching_order(order):
        return False
    if order.get('coach_user_id') == coach_id:
        return True
    proto_id = order.get('protocol_id')
    if not proto_id:
        return False
    proto = await db.protocols.find_one({'id': proto_id}, {'coach_id': 1, '_id': 0})
    return bool(proto and proto.get('coach_id') == coach_id)


def _summarise_orders(orders: list[dict]) -> dict:
    total_gross = 0.0
    paid_gross = 0.0
    pending_gross = 0.0
    paid_count = 0
    for o in orders:
        total = float(o.get('total') or 0)
        total_gross += total
        if o.get('coach_payout_paid'):
            paid_gross += total
            paid_count += 1
        else:
            pending_gross += total
    return {
        'orders_count': len(orders),
        'orders_paid_count': paid_count,
        'orders_pending_count': len(orders) - paid_count,
        'gross_total': round(total_gross, 2),
        'total_paid_out': round(paid_gross, 2),
        'pending_payout': round(pending_gross, 2),
    }


# ---------------- Admin: list all coaches with earnings ----------------
@router.get('/admin/coach-earnings')
async def list_coach_earnings(_=Depends(require_admin)):
    coaches = await db.users.find({'role': 'coach'}).sort('created_at', -1).to_list(200)
    out = []
    for c in coaches:
        orders = await _orders_for_coach(c['id'])
        out.append({
            'user': doc_to_dict(c),
            'earnings': _summarise_orders(orders),
        })
    return out


@router.get('/admin/coach-earnings/{coach_id}')
async def get_coach_earnings(coach_id: str, _=Depends(require_admin)):
    coach = await db.users.find_one({'id': coach_id, 'role': 'coach'})
    if not coach:
        raise HTTPException(404, 'Coach not found')
    orders = await _orders_for_coach(coach_id)
    payouts = await db.coach_payouts.find(
        {'coach_user_id': coach_id}
    ).sort('created_at', -1).to_list(500)
    return {
        'user': doc_to_dict(coach),
        'earnings': _summarise_orders(orders),
        'orders': [doc_to_dict(o) for o in orders],
        'payouts': [doc_to_dict(p) for p in payouts],
    }


@router.post('/admin/coach-earnings/{coach_id}/payouts')
async def create_coach_payout(coach_id: str, payload: CoachPayoutCreate, _=Depends(require_admin)):
    coach = await db.users.find_one({'id': coach_id, 'role': 'coach'})
    if not coach:
        raise HTTPException(404, 'Coach not found')
    if float(payload.amount) <= 0:
        raise HTTPException(400, 'Amount must be > 0')

    order_ids = list(dict.fromkeys(payload.order_ids or []))
    order_numbers: list[str] = []
    if order_ids:
        docs = await db.orders.find({'id': {'$in': order_ids}}).to_list(len(order_ids))
        by_id = {d['id']: d for d in docs}
        for oid in order_ids:
            o = by_id.get(oid)
            if not o:
                raise HTTPException(400, f'Order not found: {oid}')
            if o.get('payment_status') != 'paid':
                raise HTTPException(400, f'Order {o.get("order_number")} is not paid yet')
            if not await _order_attributable_to_coach(o, coach_id):
                raise HTTPException(400, f'Order {o.get("order_number")} is not attributed to this coach')
            if o.get('coach_payout_paid'):
                raise HTTPException(400, f'Order {o.get("order_number")} is already marked paid to coach')
            order_numbers.append(o.get('order_number', ''))

    payout_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    doc = {
        'id': payout_id,
        'coach_user_id': coach_id,
        'amount': round(float(payload.amount), 2),
        'note': payload.note or '',
        'order_ids': order_ids,
        'order_numbers': order_numbers,
        'created_at': now,
    }
    await db.coach_payouts.insert_one(doc)

    if order_ids:
        await db.orders.update_many(
            {'id': {'$in': order_ids}},
            {'$set': {
                'coach_payout_paid': True,
                'coach_payout_id': payout_id,
                'coach_payout_paid_at': now,
                'coach_user_id': coach_id,  # denorm so future queries stay fast
            }},
        )
    return doc_to_dict(doc)


@router.delete('/admin/coach-earnings/{coach_id}/payouts/{payout_id}')
async def delete_coach_payout(coach_id: str, payout_id: str, _=Depends(require_admin)):
    payout = await db.coach_payouts.find_one({'id': payout_id, 'coach_user_id': coach_id})
    if not payout:
        raise HTTPException(404, 'Payout not found')
    order_ids = payout.get('order_ids') or []
    if order_ids:
        await db.orders.update_many(
            {'id': {'$in': order_ids}, 'coach_payout_id': payout_id},
            {'$set': {'coach_payout_paid': False},
             '$unset': {'coach_payout_id': '', 'coach_payout_paid_at': ''}},
        )
    await db.coach_payouts.delete_one({'id': payout_id, 'coach_user_id': coach_id})
    return {'ok': True}


@router.post('/admin/coach-earnings/backfill')
async def backfill_coaching_orders(_=Depends(require_admin)):
    """One-shot migration: stamp `purpose='coaching'` + `coach_user_id` on legacy
    coaching paylink orders that predate those fields.

    Idempotent. Reports counts. Uses `items.slug == 'coaching-plan'` to detect
    coaching orders regardless of whether `purpose` was set at creation time.
    """
    now = datetime.now(timezone.utc)
    purpose_set = 0
    coach_stamped = 0
    scanned = 0

    async for o in db.orders.find(
        {'items.slug': 'coaching-plan'},
        {'id': 1, 'purpose': 1, 'coach_user_id': 1, 'protocol_id': 1, 'order_number': 1},
    ):
        scanned += 1
        updates: dict = {}
        if o.get('purpose') != 'coaching':
            updates['purpose'] = 'coaching'
        if not o.get('coach_user_id') and o.get('protocol_id'):
            proto = await db.protocols.find_one(
                {'id': o['protocol_id']}, {'coach_id': 1, '_id': 0}
            )
            if proto and proto.get('coach_id'):
                updates['coach_user_id'] = proto['coach_id']
        if updates:
            updates['updated_at'] = now
            await db.orders.update_one({'id': o['id']}, {'$set': updates})
            if 'purpose' in updates:
                purpose_set += 1
            if 'coach_user_id' in updates:
                coach_stamped += 1

    return {
        'ok': True,
        'scanned': scanned,
        'purpose_stamped': purpose_set,
        'coach_user_id_stamped': coach_stamped,
    }


# ---------------- Coach self-service ----------------
@router.get('/coach/earnings')
async def my_coach_earnings(user: dict = Depends(require_coach)):
    orders = await _orders_for_coach(user['id'])
    payouts = await db.coach_payouts.find(
        {'coach_user_id': user['id']}
    ).sort('created_at', -1).to_list(500)
    return {
        'user': doc_to_dict(user),
        'earnings': _summarise_orders(orders),
        'orders': [doc_to_dict(o) for o in orders],
        'payouts': [doc_to_dict(p) for p in payouts],
    }
