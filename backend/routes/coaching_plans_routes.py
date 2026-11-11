"""Coaching tiers (Bronze/Silver/Gold), monthly memberships, weekly check-ins,
resources and the renewal cron. Companion to coaching_routes.py."""
import asyncio
import hmac
import logging
import os
import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request
from pydantic import BaseModel

from auth import get_current_user, require_admin, require_coach
from db import db
from routes.coaching_routes import _get_coach_client, _my_client
from utils import doc_to_dict

logger = logging.getLogger('ghp.coaching.plans')
router = APIRouter(prefix='/coaching', tags=['coaching-plans'])

TIER_ORDER = ['bronze', 'silver', 'gold']
MODULES = ['plan', 'messages', 'checkin', 'progress', 'supplements', 'resources', 'video_call']

DEFAULT_PLANS = [
    {
        'tier': 'bronze', 'name': 'Bronze', 'price_monthly': 49.0,
        'tagline': 'Your personalised protocol, built and tracked.',
        'features': ['Personalised protocol built by your coach', 'Dosing calendar with daily tick-off',
                     'Messaging with your coach (48h replies)', 'Fortnightly plan review'],
        'modules': ['plan', 'messages'],
    },
    {
        'tier': 'silver', 'name': 'Silver', 'price_monthly': 89.0,
        'tagline': 'Everything in Bronze, plus weekly accountability.',
        'features': ['Weekly check-in reviewed by your coach', 'Progress tracking & charts',
                     'Supplement plan alongside your protocol', 'Faster replies (24h)'],
        'modules': ['plan', 'messages', 'checkin', 'progress', 'supplements'],
    },
    {
        'tier': 'gold', 'name': 'Gold', 'price_monthly': 149.0,
        'tagline': 'Everything in Silver, plus priority 1-to-1 access.',
        'features': ['Monthly 1-to-1 video call', 'Same-day priority replies',
                     'Unlimited protocol adjustments', 'Resources library: guides, videos & FAQs'],
        'modules': ['plan', 'messages', 'checkin', 'progress', 'supplements', 'resources', 'video_call'],
    },
]


# ---------- plans ----------
async def get_plans() -> list[dict]:
    docs = await db.coaching_plans.find().to_list(10)
    if not docs:
        now = datetime.utcnow()
        docs = [{'id': str(uuid.uuid4()), **p, 'updated_at': now} for p in DEFAULT_PLANS]
        await db.coaching_plans.insert_many([dict(d) for d in docs])
    docs = [doc_to_dict(d) for d in docs]
    docs.sort(key=lambda p: TIER_ORDER.index(p['tier']) if p['tier'] in TIER_ORDER else 99)
    return docs


async def get_plan(tier: Optional[str]) -> Optional[dict]:
    if not tier:
        return None
    return next((p for p in await get_plans() if p['tier'] == tier), None)


class PlanIn(BaseModel):
    tier: str
    name: str
    price_monthly: float
    tagline: str = ''
    features: list[str] = []
    modules: list[str] = []


@router.get('/plans')
async def list_plans():
    return await get_plans()


@router.put('/admin/plans')
async def save_plans(payload: list[PlanIn], _=Depends(require_admin)):
    if sorted(p.tier for p in payload) != sorted(TIER_ORDER):
        raise HTTPException(400, 'Exactly one plan per tier (bronze, silver, gold) is required')
    now = datetime.utcnow()
    for p in payload:
        if p.price_monthly <= 0:
            raise HTTPException(400, f'{p.name}: price must be greater than zero')
        bad = [m for m in p.modules if m not in MODULES]
        if bad:
            raise HTTPException(400, f'Unknown modules: {bad}')
        await db.coaching_plans.update_one(
            {'tier': p.tier},
            {'$set': {**p.model_dump(), 'updated_at': now}, '$setOnInsert': {'id': str(uuid.uuid4())}},
            upsert=True,
        )
    return await get_plans()


# ---------- membership ----------
def _add_month(dt: datetime) -> datetime:
    return dt + timedelta(days=30)


async def _apply_membership_payments(client: dict) -> dict:
    """Extend paid_until by one month for every paid membership order not yet applied."""
    orders = await db.orders.find({
        'purpose': 'coaching_membership', 'client_id': client['id'],
        'payment_status': 'paid', 'membership_applied': {'$ne': True},
    }).sort('created_at', 1).to_list(50)
    if not orders:
        return client
    paid_until = client.get('paid_until')
    tier = client.get('tier')
    for o in orders:
        base = o.get('paid_at') or o.get('updated_at') or datetime.utcnow()
        start = paid_until if paid_until and paid_until > base else base
        paid_until = _add_month(start)
        tier = o.get('tier') or tier
        await db.orders.update_one({'id': o['id']}, {'$set': {'membership_applied': True}})
    await db.coaching_clients.update_one(
        {'id': client['id']},
        {'$set': {'paid_until': paid_until, 'tier': tier, 'membership_started_at': client.get('membership_started_at') or datetime.utcnow()}},
    )
    client.update({'paid_until': paid_until, 'tier': tier})
    return client


async def _pending_membership_order(client_id: str) -> Optional[dict]:
    return await db.orders.find_one(
        {'purpose': 'coaching_membership', 'client_id': client_id, 'payment_status': {'$ne': 'paid'}},
        sort=[('created_at', -1)],
    )


async def membership_state(client: dict) -> dict:
    client = await _apply_membership_payments(client)
    now = datetime.utcnow()
    paid_until = client.get('paid_until')
    active = bool(paid_until and paid_until > now)
    plan = await get_plan(client.get('tier'))
    pending = await _pending_membership_order(client['id'])
    return {
        'client_id': client['id'],
        'tier': client.get('tier'),
        'plan': plan,
        'paid_until': paid_until,
        'active': active,
        'days_left': max(0, (paid_until - now).days) if paid_until else 0,
        'modules': (plan or {}).get('modules', []) if active else [],
        'pending_order': {
            'id': pending['id'], 'order_number': pending.get('order_number'),
            'amount': float(pending.get('total') or 0), 'tier': pending.get('tier'),
            'payment_link': f"/paylink/{pending['id']}", 'created_at': pending.get('created_at'),
        } if pending else None,
    }


@router.get('/my/membership')
async def my_membership(user: dict = Depends(get_current_user)):
    client = await _my_client(user)
    if not client:
        req = await db.coaching_requests.find_one({'email': (user.get('email') or '').lower()}, sort=[('created_at', -1)])
        return {'client_id': None, 'active': False, 'tier': None, 'modules': [], 'pending_order': None,
                'request': {'status': req.get('status'), 'tier': req.get('tier'), 'created_at': req.get('created_at')} if req else None}
    state = await membership_state(client)
    coach = await db.users.find_one({'id': client['coach_id']}, {'first_name': 1, 'last_name': 1, 'bio': 1})
    state['coach_name'] = f"{(coach or {}).get('first_name', '')} {(coach or {}).get('last_name', '')}".strip() or 'Your coach'
    return state


async def require_member(user: dict = Depends(get_current_user)) -> dict:
    client = await _my_client(user)
    if not client:
        raise HTTPException(403, 'No coaching membership')
    state = await membership_state(client)
    if not state['active']:
        raise HTTPException(402, 'Coaching membership is not active')
    client['_modules'] = state['modules']
    return client


def _require_module(client: dict, module: str):
    if module not in client.get('_modules', []):
        raise HTTPException(403, f'Your plan does not include {module}. Upgrade to unlock it.')


class MembershipPaylinkIn(BaseModel):
    tier: str
    price: Optional[float] = None
    send_email: bool = True


async def _create_membership_order(client: dict, coach_id: str, tier: str, price: float, renewal: bool) -> dict:
    from routes.order_routes import _next_order_number
    plan = await get_plan(tier)
    order_number = await _next_order_number()
    name = (client.get('customer_name') or '').strip()
    now = datetime.utcnow()
    label = 'renewal' if renewal else 'first month'
    doc = {
        'id': str(uuid.uuid4()), 'order_number': order_number,
        'source': 'paylink', 'purpose': 'coaching_membership',
        'client_id': client['id'], 'coach_user_id': coach_id, 'tier': tier,
        'items': [{'product_id': None, 'slug': f'coaching-{tier}',
                   'name': f"{(plan or {}).get('name', tier.title())} coaching · 1 month ({label})",
                   'qty': 1, 'price': price}],
        'subtotal': price, 'shipping': 0, 'discount': 0, 'total': price,
        'shipping_address': {
            'first_name': name.split(' ')[0] if name else '', 'last_name': ' '.join(name.split(' ')[1:]),
            'email': client.get('customer_email', ''), 'phone': '', 'address1': 'Coaching membership',
            'city': '', 'postcode': '', 'country': 'United Kingdom',
        },
        'payment_status': 'pending', 'status': 'processing',
        'created_at': now, 'updated_at': now,
    }
    await db.orders.insert_one(doc)
    return doc


@router.get('/coach/clients/{client_id}/membership')
async def coach_membership(client_id: str, user: dict = Depends(require_coach)):
    client = await _get_coach_client(client_id, user['id'])
    return await membership_state(client)


@router.post('/coach/clients/{client_id}/membership-paylink')
async def coach_membership_paylink(client_id: str, payload: MembershipPaylinkIn, user: dict = Depends(require_coach)):
    client = await _get_coach_client(client_id, user['id'])
    plan = await get_plan(payload.tier)
    if not plan:
        raise HTTPException(400, 'Unknown tier')
    price = float(payload.price if payload.price is not None else plan['price_monthly'])
    if price <= 0:
        raise HTTPException(400, 'Price must be greater than zero')
    pending = await _pending_membership_order(client_id)
    if pending:
        await db.orders.delete_one({'id': pending['id']})
    renewal = bool(client.get('paid_until'))
    order = await _create_membership_order(client, user['id'], payload.tier, price, renewal)
    await db.coaching_clients.update_one({'id': client_id}, {'$set': {'tier': client.get('tier') or payload.tier, 'requested_tier': payload.tier}})
    if payload.send_email:
        try:
            from email_service import send_membership_paylink_email
            asyncio.create_task(send_membership_paylink_email(client, order, plan, renewal))
        except Exception as e:
            logger.exception(f'membership email failed: {e}')
    return {'order_id': order['id'], 'order_number': order['order_number'],
            'payment_link': f"/paylink/{order['id']}", 'amount': price, 'tier': payload.tier}


class MembershipAdjustIn(BaseModel):
    tier: Optional[str] = None
    paid_until: Optional[datetime] = None
    add_days: Optional[int] = None


@router.patch('/coach/clients/{client_id}/membership')
async def coach_adjust_membership(client_id: str, payload: MembershipAdjustIn, user: dict = Depends(require_coach)):
    client = await _get_coach_client(client_id, user['id'])
    updates = {}
    if payload.tier:
        if not await get_plan(payload.tier):
            raise HTTPException(400, 'Unknown tier')
        updates['tier'] = payload.tier
    if payload.paid_until is not None:
        updates['paid_until'] = payload.paid_until.replace(tzinfo=None)
    if payload.add_days:
        base = client.get('paid_until') or datetime.utcnow()
        if base < datetime.utcnow():
            base = datetime.utcnow()
        updates['paid_until'] = base + timedelta(days=int(payload.add_days))
    if not updates:
        raise HTTPException(400, 'Nothing to update')
    await db.coaching_clients.update_one({'id': client_id}, {'$set': updates})
    client.update(updates)
    return await membership_state(client)


# ---------- weekly check-ins ----------
class CheckinIn(BaseModel):
    week_ending: str  # ISO date YYYY-MM-DD
    weight_kg: Optional[float] = None
    energy: Optional[int] = None
    sleep: Optional[int] = None
    training: Optional[int] = None
    notes: str = ''
    questions: str = ''


def _rating(v: Optional[int], label: str):
    if v is not None and not (1 <= int(v) <= 10):
        raise HTTPException(400, f'{label} must be between 1 and 10')


@router.get('/my/checkins')
async def my_checkins(client: dict = Depends(require_member)):
    _require_module(client, 'checkin')
    docs = await db.coaching_checkins.find({'client_id': client['id']}).sort('week_ending', -1).to_list(200)
    return [doc_to_dict(d) for d in docs]


@router.post('/my/checkins')
async def my_submit_checkin(payload: CheckinIn, client: dict = Depends(require_member)):
    _require_module(client, 'checkin')
    for v, l in ((payload.energy, 'Energy'), (payload.sleep, 'Sleep'), (payload.training, 'Training')):
        _rating(v, l)
    now = datetime.utcnow()
    doc = {**payload.model_dump(), 'client_id': client['id'], 'coach_id': client['coach_id'],
           'reviewed': False, 'coach_reply': '', 'updated_at': now}
    existing = await db.coaching_checkins.find_one({'client_id': client['id'], 'week_ending': payload.week_ending})
    if existing:
        await db.coaching_checkins.update_one({'id': existing['id']}, {'$set': {**doc, 'reviewed': False}})
        doc['id'] = existing['id']
        doc['created_at'] = existing.get('created_at', now)
    else:
        doc.update({'id': str(uuid.uuid4()), 'created_at': now})
        await db.coaching_checkins.insert_one(dict(doc))
    if payload.weight_kg:
        await db.weigh_ins.update_one(
            {'client_id': client['id'], 'date': payload.week_ending},
            {'$set': {'weight_kg': float(payload.weight_kg), 'updated_at': now},
             '$setOnInsert': {'id': str(uuid.uuid4()), 'client_id': client['id'], 'date': payload.week_ending, 'created_at': now}},
            upsert=True,
        )
    return doc_to_dict(doc)


@router.get('/coach/clients/{client_id}/checkins')
async def coach_checkins(client_id: str, user: dict = Depends(require_coach)):
    await _get_coach_client(client_id, user['id'])
    docs = await db.coaching_checkins.find({'client_id': client_id}).sort('week_ending', -1).to_list(200)
    return [doc_to_dict(d) for d in docs]


class CheckinReviewIn(BaseModel):
    coach_reply: Optional[str] = None
    reviewed: Optional[bool] = None


@router.patch('/coach/checkins/{checkin_id}')
async def coach_review_checkin(checkin_id: str, payload: CheckinReviewIn, user: dict = Depends(require_coach)):
    doc = await db.coaching_checkins.find_one({'id': checkin_id})
    if not doc:
        raise HTTPException(404, 'Check-in not found')
    await _get_coach_client(doc['client_id'], user['id'])
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if payload.coach_reply is not None:
        updates['reviewed'] = True
        updates['reviewed_at'] = datetime.utcnow()
    await db.coaching_checkins.update_one({'id': checkin_id}, {'$set': updates})
    return doc_to_dict(await db.coaching_checkins.find_one({'id': checkin_id}))


@router.get('/coach/checkins/pending')
async def coach_pending_checkins(user: dict = Depends(require_coach)):
    docs = await db.coaching_checkins.find({'coach_id': user['id'], 'reviewed': False}).sort('created_at', -1).to_list(100)
    return [doc_to_dict(d) for d in docs]


# ---------- resources (Gold) ----------
class ResourceIn(BaseModel):
    title: str
    kind: str = 'guide'  # guide | video | faq
    url: str = ''
    body: str = ''
    min_tier: str = 'gold'


@router.get('/my/resources')
async def my_resources(client: dict = Depends(require_member)):
    _require_module(client, 'resources')
    docs = await db.coaching_resources.find().sort('created_at', -1).to_list(200)
    return [doc_to_dict(d) for d in docs]


@router.get('/admin/resources')
async def admin_resources(_=Depends(require_coach)):
    docs = await db.coaching_resources.find().sort('created_at', -1).to_list(200)
    return [doc_to_dict(d) for d in docs]


@router.post('/admin/resources')
async def admin_add_resource(payload: ResourceIn, _=Depends(require_coach)):
    doc = {'id': str(uuid.uuid4()), **payload.model_dump(), 'created_at': datetime.utcnow()}
    await db.coaching_resources.insert_one(dict(doc))
    return doc_to_dict(doc)


@router.delete('/admin/resources/{res_id}')
async def admin_delete_resource(res_id: str, _=Depends(require_coach)):
    res = await db.coaching_resources.delete_one({'id': res_id})
    if res.deleted_count == 0:
        raise HTTPException(404, 'Resource not found')
    return {'ok': True}


# ---------- coach: attention feed + view-as-client ----------
@router.get('/coach/attention')
async def coach_attention(user: dict = Depends(require_coach)):
    clients = await db.coaching_clients.find({'coach_id': user['id'], 'active': True}).to_list(500)
    by_id = {c['id']: c for c in clients}
    now = datetime.utcnow()
    pending = await db.coaching_checkins.find({'coach_id': user['id'], 'reviewed': False}).sort('created_at', -1).to_list(100)
    pending_checkins = [{'id': c['id'], 'client_id': c['client_id'], 'customer_name': by_id.get(c['client_id'], {}).get('customer_name', ''),
                         'week_ending': c['week_ending'], 'created_at': c['created_at']} for c in pending if c['client_id'] in by_id]
    unanswered = []
    for c in clients:
        last = await db.coach_messages.find_one({'client_id': c['id']}, sort=[('created_at', -1)])
        if last and last.get('from_role') == 'client':
            unanswered.append({'client_id': c['id'], 'customer_name': c.get('customer_name', ''), 'body': last.get('body', '')[:140], 'created_at': last['created_at']})
    expiring, lapsed, unpaid = [], [], []
    for c in clients:
        state = await membership_state(c)
        row = {'client_id': c['id'], 'customer_name': c.get('customer_name', ''), 'tier': state['tier'],
               'paid_until': state['paid_until'], 'days_left': state['days_left'], 'pending_order': state['pending_order']}
        if state['paid_until'] and not state['active']:
            lapsed.append(row)
        elif state['active'] and state['days_left'] <= 5:
            expiring.append(row)
        if state['pending_order'] and not state['paid_until']:
            unpaid.append(row)
    return {'pending_checkins': pending_checkins, 'unanswered_messages': unanswered,
            'expiring': expiring, 'lapsed': lapsed, 'unpaid_first_month': unpaid, 'as_of': now}


@router.get('/coach/clients/{client_id}/portal-view')
async def coach_portal_view(client_id: str, user: dict = Depends(require_coach)):
    """Everything the client's portal shows, so the coach can view it as them."""
    from routes.coaching_routes import _hydrate_protocol, _sync_protocol_payment
    client = await _get_coach_client(client_id, user['id'])
    state = await membership_state(client)
    proto = await db.protocols.find_one({'client_id': client_id, 'active': True})
    if proto:
        proto = await _hydrate_protocol(await _sync_protocol_payment(proto))
    checkins = await db.coaching_checkins.find({'client_id': client_id}).sort('week_ending', -1).to_list(200)
    messages = await db.coach_messages.find({'client_id': client_id}).sort('created_at', 1).to_list(500)
    resources = await db.coaching_resources.find().sort('created_at', -1).to_list(200)
    state['coach_name'] = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or 'Your coach'
    state['client_name'] = client.get('customer_name', '')
    return {'client': doc_to_dict(client), 'membership': state, 'protocol': proto,
            'checkins': [doc_to_dict(c) for c in checkins], 'messages': [doc_to_dict(m) for m in messages],
            'resources': [doc_to_dict(r) for r in resources]}


# ---------- renewal cron ----------
async def run_renewals(run_id: str) -> dict:
    """Memberships expiring within 3 days (or lapsed < 14 days) without a pending
    pay link get a renewal order + email. Lapsed memberships trigger a lapsed email once."""
    now = datetime.utcnow()
    created = lapsed = 0
    clients = await db.coaching_clients.find({'active': True, 'paid_until': {'$ne': None}}).to_list(1000)
    for c in clients:
        c = await _apply_membership_payments(c)
        pu = c.get('paid_until')
        if not pu or pu > now + timedelta(days=3) or pu < now - timedelta(days=14):
            continue
        if await _pending_membership_order(c['id']):
            if pu < now and not c.get('lapsed_notified_at'):
                try:
                    from email_service import send_membership_lapsed_email
                    await send_membership_lapsed_email(c, await _pending_membership_order(c['id']))
                except Exception as e:
                    logger.error(f'lapsed email failed: {e}')
                await db.coaching_clients.update_one({'id': c['id']}, {'$set': {'lapsed_notified_at': now}})
                lapsed += 1
            continue
        plan = await get_plan(c.get('tier'))
        if not plan:
            continue
        order = await _create_membership_order(c, c['coach_id'], c['tier'], float(plan['price_monthly']), True)
        try:
            from email_service import send_membership_paylink_email
            await send_membership_paylink_email(c, order, plan, True)
        except Exception as e:
            logger.error(f'renewal email failed: {e}')
        created += 1
    result = {'run_id': run_id, 'renewals_created': created, 'lapsed_notified': lapsed, 'ran_at': now}
    await db.cron_runs.update_one({'run_id': run_id}, {'$set': result}, upsert=True)
    logger.info(f'coaching renewals: {result}')
    return result


@router.post('/cron/renewals')
async def cron_renewals(request: Request, background: BackgroundTasks,
                        authorization: Optional[str] = Header(None),
                        x_webhook_id: Optional[str] = Header(None)):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    secret = os.environ.get('WEBHOOK_CRON_SECRET', '')
    token = authorization.split(' ', 1)[1] if authorization and authorization.startswith('Bearer ') else ''
    if not secret or not token or not hmac.compare_digest(token, secret):
        raise HTTPException(401, 'Unauthorized')
    try:
        body = await request.json()
    except Exception:
        body = {}
    if not isinstance(body, dict):
        raise HTTPException(400, 'Invalid body')
    run_id = x_webhook_id or body.get('run_id') or str(uuid.uuid4())
    if await db.cron_runs.find_one({'run_id': run_id}):
        return {'ok': True, 'duplicate': True}
    await db.cron_runs.insert_one({'run_id': run_id, 'job': 'coaching-renewals', 'queued_at': datetime.utcnow()})
    background.add_task(run_renewals, run_id)
    return {'ok': True, 'queued': True, 'run_id': run_id}
