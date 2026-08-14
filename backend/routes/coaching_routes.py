"""Coaching routes.

Stage 1 — public intake + admin queue.

Public:
- POST /api/coaching/requests      Submit a new coaching request

Admin:
- GET    /api/coaching/admin/requests           List all requests
- GET    /api/coaching/admin/requests/{id}      Detail
- PATCH  /api/coaching/admin/requests/{id}      Update status / notes
- DELETE /api/coaching/admin/requests/{id}      Remove (soft-cleanup)
"""
import asyncio
import logging
import re
import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from db import db
from models import (
    CoachingRequestCreate, CoachingRequestUpdate, CoachingRequestOut,
    CoachCreate, CoachUpdate,
)
from auth import require_admin, require_coach, hash_password, get_current_user
from utils import doc_to_dict

logger = logging.getLogger('ghp.coaching')
router = APIRouter(prefix='/coaching', tags=['coaching'])


def _get_primary_coach_id() -> str | None:
    """Placeholder for multi-coach routing later. For now the first coach
    account is treated as the default assignee."""
    return None


@router.post('/requests', response_model=CoachingRequestOut)
async def create_request(payload: CoachingRequestCreate):
    if not payload.waiver_accepted:
        raise HTTPException(400, 'Waiver must be accepted to submit a request')
    now = datetime.utcnow()
    doc = {
        'id': str(uuid.uuid4()),
        'first_name': payload.first_name.strip(),
        'last_name': (payload.last_name or '').strip(),
        'email': payload.email.lower().strip(),
        'phone': (payload.phone or '').strip(),
        'area': payload.area,
        'message': (payload.message or '').strip(),
        'status': 'new',
        'admin_notes': '',
        'assigned_coach_id': None,
        'waiver_accepted': True,
        'created_at': now,
        'updated_at': now,
    }
    await db.coaching_requests.insert_one(doc)
    # Fire-and-forget email to the coach
    try:
        from email_service import send_coaching_request_email
        asyncio.create_task(send_coaching_request_email(doc))
    except Exception as e:
        logger.exception(f'Failed to schedule coaching email: {e}')
    return CoachingRequestOut(**doc_to_dict(doc))


@router.get('/admin/requests', response_model=list[CoachingRequestOut])
async def list_requests(_=Depends(require_admin)):
    docs = await db.coaching_requests.find().sort('created_at', -1).to_list(500)
    return [CoachingRequestOut(**doc_to_dict(d)) for d in docs]


@router.get('/admin/requests/{req_id}', response_model=CoachingRequestOut)
async def get_request(req_id: str, _=Depends(require_admin)):
    d = await db.coaching_requests.find_one({'id': req_id})
    if not d:
        raise HTTPException(404, 'Request not found')
    return CoachingRequestOut(**doc_to_dict(d))


@router.patch('/admin/requests/{req_id}', response_model=CoachingRequestOut)
async def update_request(req_id: str, payload: CoachingRequestUpdate, _=Depends(require_admin)):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, 'No fields to update')
    updates['updated_at'] = datetime.utcnow()
    d = await db.coaching_requests.find_one_and_update(
        {'id': req_id}, {'$set': updates}, return_document=True
    )
    if not d:
        raise HTTPException(404, 'Request not found')
    return CoachingRequestOut(**doc_to_dict(d))


@router.delete('/admin/requests/{req_id}')
async def delete_request(req_id: str, _=Depends(require_admin)):
    res = await db.coaching_requests.delete_one({'id': req_id})
    if res.deleted_count == 0:
        raise HTTPException(404, 'Request not found')
    return {'ok': True}


# ============ ADMIN: manage coach accounts ============
@router.post('/admin/coaches')
async def create_coach(payload: CoachCreate, _=Depends(require_admin)):
    email = payload.email.lower().strip()
    if await db.users.find_one({'email': email}):
        raise HTTPException(409, 'A user with that email already exists')
    now = datetime.utcnow()
    doc = {
        'id': str(uuid.uuid4()),
        'email': email,
        'password_hash': hash_password(payload.password),
        'first_name': payload.first_name or '',
        'last_name': payload.last_name or '',
        'role': 'coach',
        'bio': payload.bio or '',
        'default_price': float(payload.default_price),
        'coach_active': True,
        'created_at': now,
    }
    await db.users.insert_one(doc)
    return doc_to_dict(doc)


@router.get('/admin/coaches')
async def list_coaches(_=Depends(require_admin)):
    docs = await db.users.find({'role': 'coach'}).sort('created_at', -1).to_list(100)
    return [doc_to_dict(d) for d in docs]


@router.put('/admin/coaches/{coach_id}')
async def update_coach(coach_id: str, payload: CoachUpdate, _=Depends(require_admin)):
    existing = await db.users.find_one({'id': coach_id, 'role': 'coach'})
    if not existing:
        raise HTTPException(404, 'Coach not found')
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if updates:
        await db.users.update_one({'id': coach_id}, {'$set': updates})
    d = await db.users.find_one({'id': coach_id})
    return doc_to_dict(d)


@router.delete('/admin/coaches/{coach_id}')
async def remove_coach(coach_id: str, _=Depends(require_admin)):
    existing = await db.users.find_one({'id': coach_id, 'role': 'coach'})
    if not existing:
        raise HTTPException(404, 'Coach not found')
    await db.users.update_one(
        {'id': coach_id},
        {'$set': {'role': 'customer', 'coach_active': False}}
    )
    return {'ok': True}


# ============ COACH: self-service ============
@router.get('/coach/me')
async def coach_me(user: dict = Depends(require_coach)):
    return doc_to_dict(user)


@router.get('/coach/requests')
async def coach_requests(user: dict = Depends(require_coach)):
    """All requests either unassigned or assigned to this coach."""
    query = {'$or': [
        {'assigned_coach_id': user['id']},
        {'assigned_coach_id': None},
        {'assigned_coach_id': {'$exists': False}},
    ]}
    docs = await db.coaching_requests.find(query).sort('created_at', -1).to_list(500)
    return [doc_to_dict(d) for d in docs]


@router.patch('/coach/requests/{req_id}')
async def coach_update_request(req_id: str, payload: CoachingRequestUpdate, user: dict = Depends(require_coach)):
    """Coach can update status / notes on their own requests. Accepting a
    request creates a client relationship."""
    req = await db.coaching_requests.find_one({'id': req_id})
    if not req:
        raise HTTPException(404, 'Request not found')
    if req.get('assigned_coach_id') and req['assigned_coach_id'] != user['id']:
        raise HTTPException(403, 'This request is already handled by another coach')

    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    updates['assigned_coach_id'] = user['id']
    updates['updated_at'] = datetime.utcnow()
    await db.coaching_requests.update_one({'id': req_id}, {'$set': updates})

    # If newly accepted, ensure a coaching client record exists
    if updates.get('status') == 'accepted':
        existing_client = await db.coaching_clients.find_one({'request_id': req_id})
        if not existing_client:
            customer_user = await db.users.find_one({'email': req.get('email', '').lower()})
            client_doc = {
                'id': str(uuid.uuid4()),
                'coach_id': user['id'],
                'customer_user_id': customer_user['id'] if customer_user else None,
                'customer_email': req.get('email', ''),
                'customer_name': f"{req.get('first_name', '')} {req.get('last_name', '')}".strip(),
                'request_id': req_id,
                'area': req.get('area', ''),
                'active': True,
                'started_at': datetime.utcnow(),
            }
            await db.coaching_clients.insert_one(client_doc)

    refreshed = await db.coaching_requests.find_one({'id': req_id})
    return doc_to_dict(refreshed)


@router.get('/coach/clients')
async def coach_clients(user: dict = Depends(require_coach)):
    docs = await db.coaching_clients.find(
        {'coach_id': user['id'], 'active': True}
    ).sort('started_at', -1).to_list(500)
    return [doc_to_dict(d) for d in docs]


@router.delete('/coach/clients/{client_id}')
async def deactivate_client(client_id: str, user: dict = Depends(require_coach)):
    res = await db.coaching_clients.update_one(
        {'id': client_id, 'coach_id': user['id']},
        {'$set': {'active': False}}
    )
    if res.matched_count == 0:
        raise HTTPException(404, 'Client not found')
    return {'ok': True}


# ============ PROTOCOLS (Stage 3) ============
async def _hydrate_protocol(proto: dict) -> dict:
    """Attach items + calendar entries. For items linked to a store product,
    include the product's slug/price/image so the customer can add-to-cart."""
    items = await db.protocol_items.find({'protocol_id': proto['id']}).sort('created_at', 1).to_list(200)
    entries = await db.calendar_entries.find({'protocol_id': proto['id']}).sort('date', 1).to_list(1000)
    # Batch fetch products used by the items
    product_ids = [i['product_id'] for i in items if i.get('product_id')]
    products_by_id = {}
    if product_ids:
        prods = await db.products.find({'id': {'$in': product_ids}}).to_list(len(product_ids))
        products_by_id = {p['id']: p for p in prods}
    hydrated_items = []
    for it in items:
        d = doc_to_dict(it)
        prod = products_by_id.get(it.get('product_id'))
        if prod:
            d['product_slug'] = prod.get('slug')
            d['product_name'] = prod.get('name')
            d['product_price'] = prod.get('price')
            d['product_image'] = prod.get('image') or (prod.get('images') or [None])[0]
            # If vial_strength_mg was not set at add time, try to infer from the product name
            if not d.get('vial_strength_mg'):
                inferred = _infer_vial_strength_mg(prod, it.get('variant_label'))
                if inferred:
                    d['vial_strength_mg'] = inferred
        hydrated_items.append(d)
    return {
        **doc_to_dict(proto),
        'items': hydrated_items,
        'calendar': [doc_to_dict(e) for e in entries],
    }


def _infer_vial_strength_mg(product: Optional[dict], variant_label: Optional[str] = None) -> Optional[float]:
    """Best-effort infer 'mg per vial' from a store product.

    Precedence:
      1. Matching variant's `vial_strength_mg`
      2. Any variant's `vial_strength_mg`
      3. Matching variant label (e.g. '5mg') → 5.0
      4. Regex on `product.name` matching '(\\d+(?:\\.\\d+)?)\\s*mg' (e.g. 'TB-500 10mg' → 10.0)
    Returns None if nothing found.
    """
    if not product:
        return None
    variants = product.get('variants') or []
    if variant_label:
        for v in variants:
            if v.get('label') == variant_label and v.get('vial_strength_mg'):
                return float(v['vial_strength_mg'])
    for v in variants:
        if v.get('vial_strength_mg'):
            return float(v['vial_strength_mg'])
    if variant_label:
        m = re.search(r'(\d+(?:\.\d+)?)\s*mg', variant_label, re.IGNORECASE)
        if m:
            return float(m.group(1))
    name = product.get('name') or ''
    m = re.search(r'(\d+(?:\.\d+)?)\s*mg\b', name, re.IGNORECASE)
    if m:
        return float(m.group(1))
    return None


async def _get_coach_client(client_id: str, coach_id: str) -> dict:
    doc = await db.coaching_clients.find_one({'id': client_id, 'coach_id': coach_id})
    if not doc:
        raise HTTPException(404, 'Client not found')
    return doc


# --- Coach: manage protocols for their clients ---
@router.get('/coach/clients/{client_id}')
async def coach_client_detail(client_id: str, user: dict = Depends(require_coach)):
    client = await _get_coach_client(client_id, user['id'])
    proto = await db.protocols.find_one({'client_id': client_id, 'active': True})
    hydrated = await _hydrate_protocol(proto) if proto else None
    return {'client': doc_to_dict(client), 'protocol': hydrated}


from models import ProtocolCreate, ProtocolUpdate, ProtocolItemIn, CalendarEntryIn  # noqa: E402


@router.post('/coach/clients/{client_id}/protocol')
async def create_protocol(client_id: str, payload: ProtocolCreate, user: dict = Depends(require_coach)):
    client = await _get_coach_client(client_id, user['id'])
    # Archive any previous active protocol for this client
    await db.protocols.update_many(
        {'client_id': client_id, 'active': True},
        {'$set': {'active': False, 'archived_at': datetime.utcnow()}}
    )
    now = datetime.utcnow()
    doc = {
        'id': str(uuid.uuid4()),
        'coach_id': user['id'],
        'client_id': client_id,
        'client_name': client.get('customer_name', ''),
        'client_email': client.get('customer_email', ''),
        'title': payload.title.strip(),
        'area': payload.area or client.get('area', ''),
        'duration_weeks': int(payload.duration_weeks or 8),
        'notes': payload.notes or '',
        'active': True,
        'created_at': now,
        'updated_at': now,
    }
    await db.protocols.insert_one(doc)
    return await _hydrate_protocol(doc)


@router.put('/coach/protocols/{proto_id}')
async def update_protocol(proto_id: str, payload: ProtocolUpdate, user: dict = Depends(require_coach)):
    existing = await db.protocols.find_one({'id': proto_id, 'coach_id': user['id']})
    if not existing:
        raise HTTPException(404, 'Protocol not found')
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    updates['updated_at'] = datetime.utcnow()
    await db.protocols.update_one({'id': proto_id}, {'$set': updates})
    refreshed = await db.protocols.find_one({'id': proto_id})
    return await _hydrate_protocol(refreshed)


@router.delete('/coach/protocols/{proto_id}')
async def delete_protocol(proto_id: str, user: dict = Depends(require_coach)):
    existing = await db.protocols.find_one({'id': proto_id, 'coach_id': user['id']})
    if not existing:
        raise HTTPException(404, 'Protocol not found')
    await db.protocols.delete_one({'id': proto_id})
    await db.protocol_items.delete_many({'protocol_id': proto_id})
    await db.calendar_entries.delete_many({'protocol_id': proto_id})
    return {'ok': True}


@router.post('/coach/protocols/{proto_id}/items')
async def add_item(proto_id: str, payload: ProtocolItemIn, user: dict = Depends(require_coach)):
    proto = await db.protocols.find_one({'id': proto_id, 'coach_id': user['id']})
    if not proto:
        raise HTTPException(404, 'Protocol not found')
    # Fallback: if coach didn't fill vial_strength_mg, try to infer from the product name (e.g. "TB-500 10mg" → 10)
    vial_strength = payload.vial_strength_mg
    if vial_strength is None and payload.product_id:
        product = await db.products.find_one({'id': payload.product_id})
        vial_strength = _infer_vial_strength_mg(product, payload.variant_label)
    doc = {
        'id': str(uuid.uuid4()),
        'protocol_id': proto_id,
        'product_id': payload.product_id,
        'variant_label': payload.variant_label,
        'name': payload.name.strip(),
        'dose': payload.dose or '',
        'dose_amount': payload.dose_amount,
        'dose_unit': payload.dose_unit or '',
        'vial_strength_mg': vial_strength,
        'frequency': payload.frequency or '',
        'freq_days': payload.freq_days or [],
        'freq_time': payload.freq_time or '',
        'notes': payload.notes or '',
        'created_at': datetime.utcnow(),
    }
    await db.protocol_items.insert_one(doc)

    # Auto-generate calendar entries from freq_days across the whole protocol duration
    if payload.freq_days:
        from datetime import timedelta
        day_idx = {'Mon': 0, 'Tue': 1, 'Wed': 2, 'Thu': 3, 'Fri': 4, 'Sat': 5, 'Sun': 6}
        weeks = int(proto.get('duration_weeks') or 8)
        # Week 1 Monday = Monday of the week the protocol was created (aligns with frontend grid)
        ref_dt = proto.get('created_at') or datetime.utcnow()
        ref_date = ref_dt.date() if hasattr(ref_dt, 'date') else datetime.fromisoformat(str(ref_dt)).date()
        week1_mon = ref_date - timedelta(days=ref_date.weekday())  # Mon=0..Sun=6
        entries: list[dict] = []
        for w in range(weeks):
            for d in payload.freq_days:
                if d not in day_idx:
                    continue
                date = week1_mon + timedelta(days=w * 7 + day_idx[d])
                entries.append({
                    'id': str(uuid.uuid4()),
                    'protocol_id': proto_id,
                    'client_id': proto['client_id'],
                    'item_id': doc['id'],
                    'date': date.isoformat(),
                    'item_name': doc['name'],
                    'dose': doc['dose'],
                    'time_of_day': payload.freq_time or '',
                    'notes': '',
                    'done': False,
                    'created_at': datetime.utcnow(),
                })
        if entries:
            await db.calendar_entries.insert_many(entries)
    return doc_to_dict(doc)


@router.delete('/coach/protocols/{proto_id}/items/{item_id}')
async def delete_item(proto_id: str, item_id: str, user: dict = Depends(require_coach)):
    proto = await db.protocols.find_one({'id': proto_id, 'coach_id': user['id']})
    if not proto:
        raise HTTPException(404, 'Protocol not found')
    res = await db.protocol_items.delete_one({'id': item_id, 'protocol_id': proto_id})
    if res.deleted_count == 0:
        raise HTTPException(404, 'Item not found')
    # Cascade: remove auto-generated calendar entries linked to this item
    await db.calendar_entries.delete_many({'protocol_id': proto_id, 'item_id': item_id})
    # Cascade: revoke any unconsumed cart pushes for this item
    await db.prescribed_cart_pushes.delete_many({'item_id': item_id, 'consumed_at': None})
    return {'ok': True}


# ---------------- vial calculator + push-to-cart ----------------

_UNIT_TO_MG = {'mg': 1.0, 'mcg': 0.001, 'iu': None, 'clicks': None}


def _compute_vials(item: dict, proto: dict, product: Optional[dict]) -> dict:
    """Return {weekly_mg, total_mg, vial_strength_mg, vials, days_per_week, weeks} — None if uncomputable."""
    import math
    days = len(item.get('freq_days') or [])
    weeks = int(proto.get('duration_weeks') or 0)
    dose_amount = item.get('dose_amount')
    dose_unit = (item.get('dose_unit') or '').lower()
    if item.get('freq_time') == 'AM+PM':
        doses_per_day = 2
    else:
        doses_per_day = 1
    mg_factor = _UNIT_TO_MG.get(dose_unit)
    if not dose_amount or mg_factor is None or days == 0 or weeks == 0:
        return {'weekly_mg': None, 'total_mg': None, 'vial_strength_mg': None, 'vials': None,
                'days_per_week': days, 'weeks': weeks, 'doses_per_day': doses_per_day}
    per_dose_mg = float(dose_amount) * mg_factor
    weekly_mg = per_dose_mg * days * doses_per_day
    total_mg = weekly_mg * weeks
    # Vial strength: item override → product variant → product-level
    vs = item.get('vial_strength_mg')
    if not vs and product:
        vlabel = item.get('variant_label')
        for v in (product.get('variants') or []):
            if vlabel and v.get('label') == vlabel and v.get('vial_strength_mg'):
                vs = v['vial_strength_mg']
                break
        if not vs:
            for v in (product.get('variants') or []):
                if v.get('vial_strength_mg'):
                    vs = v['vial_strength_mg']
                    break
    vials = math.ceil(total_mg / vs) if vs and vs > 0 else None
    return {'weekly_mg': round(weekly_mg, 3), 'total_mg': round(total_mg, 3),
            'vial_strength_mg': vs, 'vials': vials, 'days_per_week': days,
            'weeks': weeks, 'doses_per_day': doses_per_day}


@router.get('/coach/protocols/{proto_id}/items/{item_id}/vial-calc')
async def vial_calc(proto_id: str, item_id: str, user: dict = Depends(require_coach)):
    proto = await db.protocols.find_one({'id': proto_id, 'coach_id': user['id']})
    if not proto:
        raise HTTPException(404, 'Protocol not found')
    item = await db.protocol_items.find_one({'id': item_id, 'protocol_id': proto_id})
    if not item:
        raise HTTPException(404, 'Item not found')
    product = await db.products.find_one({'id': item.get('product_id')}) if item.get('product_id') else None
    return _compute_vials(item, proto, product)


@router.post('/coach/protocols/{proto_id}/items/{item_id}/push-to-cart')
async def push_to_cart(proto_id: str, item_id: str, user: dict = Depends(require_coach)):
    proto = await db.protocols.find_one({'id': proto_id, 'coach_id': user['id']})
    if not proto:
        raise HTTPException(404, 'Protocol not found')
    item = await db.protocol_items.find_one({'id': item_id, 'protocol_id': proto_id})
    if not item:
        raise HTTPException(404, 'Item not found')
    if not item.get('product_id'):
        raise HTTPException(400, 'Item is not linked to a store product')
    product = await db.products.find_one({'id': item['product_id']})
    if not product:
        raise HTTPException(400, 'Linked product no longer exists')
    calc = _compute_vials(item, proto, product)
    if not calc.get('vials'):
        raise HTTPException(400, 'Cannot compute vials — set numeric dose, unit, days, and a vial strength.')
    if calc['vials'] > 100:
        raise HTTPException(400, f'Computed {calc["vials"]} vials — please double-check dose/duration; the max per push is 100.')
    # Fetch matching variant (fallback to first available with a vial_strength)
    variant_label = item.get('variant_label')
    if not variant_label:
        for v in (product.get('variants') or []):
            if v.get('vial_strength_mg'):
                variant_label = v['label']
                break
    # Replace any prior unconsumed push for this item
    await db.prescribed_cart_pushes.delete_many({'item_id': item_id, 'consumed_at': None})
    push_doc = {
        'id': str(uuid.uuid4()),
        'client_id': proto['client_id'],
        'protocol_id': proto_id,
        'item_id': item_id,
        'product_id': product['id'],
        'variant_label': variant_label,
        'qty': int(calc['vials']),
        'weekly_mg': calc['weekly_mg'],
        'total_mg': calc['total_mg'],
        'vial_strength_mg': calc['vial_strength_mg'],
        'created_at': datetime.utcnow(),
        'consumed_at': None,
    }
    await db.prescribed_cart_pushes.insert_one(push_doc)
    return {'ok': True, 'qty': push_doc['qty'], 'variant_label': variant_label, 'calc': calc}


@router.get('/my/prescribed-cart')
async def my_prescribed_cart(user: dict = Depends(get_current_user)):
    client = await db.coaching_clients.find_one({'customer_user_id': user['id'], 'active': True})
    if not client:
        return []
    pushes = await db.prescribed_cart_pushes.find({'client_id': client['id'], 'consumed_at': None}).to_list(50)
    out = []
    for p in pushes:
        product = await db.products.find_one({'id': p['product_id']})
        if not product:
            continue
        out.append({
            'id': p['id'],
            'product_id': p['product_id'],
            'product_slug': product.get('slug'),
            'product_name': product.get('name'),
            'product_image': product.get('image') or (product.get('images') or [None])[0],
            'product_price': product.get('price'),
            'variant_label': p.get('variant_label'),
            'qty': p['qty'],
            'weekly_mg': p.get('weekly_mg'),
            'total_mg': p.get('total_mg'),
        })
    return out


class ConsumeIn(BaseModel):
    ids: Optional[list[str]] = None  # if omitted, consume all unconsumed


@router.post('/my/prescribed-cart/consume')
async def consume_prescribed_cart(payload: ConsumeIn, user: dict = Depends(get_current_user)):
    client = await db.coaching_clients.find_one({'customer_user_id': user['id'], 'active': True})
    if not client:
        return {'consumed': 0}
    query = {'client_id': client['id'], 'consumed_at': None}
    if payload.ids:
        query['id'] = {'$in': payload.ids}
    res = await db.prescribed_cart_pushes.update_many(query, {'$set': {'consumed_at': datetime.utcnow()}})
    return {'consumed': res.modified_count}


@router.post('/coach/protocols/{proto_id}/calendar')
async def add_calendar_entry(proto_id: str, payload: CalendarEntryIn, user: dict = Depends(require_coach)):
    proto = await db.protocols.find_one({'id': proto_id, 'coach_id': user['id']})
    if not proto:
        raise HTTPException(404, 'Protocol not found')
    doc = {
        'id': str(uuid.uuid4()),
        'protocol_id': proto_id,
        'client_id': proto['client_id'],
        'date': payload.date,
        'item_name': payload.item_name,
        'dose': payload.dose or '',
        'time_of_day': payload.time_of_day or '',
        'notes': payload.notes or '',
        'done': False,
        'created_at': datetime.utcnow(),
    }
    await db.calendar_entries.insert_one(doc)
    return doc_to_dict(doc)


@router.delete('/coach/protocols/{proto_id}/calendar/{entry_id}')
async def delete_calendar_entry(proto_id: str, entry_id: str, user: dict = Depends(require_coach)):
    proto = await db.protocols.find_one({'id': proto_id, 'coach_id': user['id']})
    if not proto:
        raise HTTPException(404, 'Protocol not found')
    res = await db.calendar_entries.delete_one({'id': entry_id, 'protocol_id': proto_id})
    if res.deleted_count == 0:
        raise HTTPException(404, 'Entry not found')
    return {'ok': True}


@router.patch('/coach/protocols/{proto_id}/calendar/{entry_id}')
async def toggle_calendar_entry_coach(proto_id: str, entry_id: str, done: bool, user: dict = Depends(require_coach)):
    proto = await db.protocols.find_one({'id': proto_id, 'coach_id': user['id']})
    if not proto:
        raise HTTPException(404, 'Protocol not found')
    res = await db.calendar_entries.update_one(
        {'id': entry_id, 'protocol_id': proto_id},
        {'$set': {'done': bool(done), 'done_at': datetime.utcnow() if done else None}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, 'Entry not found')
    return {'ok': True, 'done': bool(done)}


# --- Customer: view own protocol + tick doses ---
from auth import get_current_user  # noqa: E402


@router.get('/my/protocol')
async def my_protocol(user: dict = Depends(get_current_user)):
    """Return the customer's active coaching protocol if any (matches by user email)."""
    email = (user.get('email') or '').lower()
    client = await db.coaching_clients.find_one({
        '$or': [
            {'customer_user_id': user['id']},
            {'customer_email': email},
        ],
        'active': True,
    })
    if not client:
        return None
    proto = await db.protocols.find_one({'client_id': client['id'], 'active': True})
    if not proto:
        return None
    proto = await _sync_protocol_payment(proto)
    return await _hydrate_protocol(proto)


@router.patch('/my/calendar/{entry_id}')
async def toggle_calendar_entry(entry_id: str, done: bool, user: dict = Depends(get_current_user)):
    entry = await db.calendar_entries.find_one({'id': entry_id})
    if not entry:
        raise HTTPException(404, 'Entry not found')
    # Verify ownership via client match
    email = (user.get('email') or '').lower()
    client = await db.coaching_clients.find_one({'id': entry['client_id']})
    if not client or (client.get('customer_user_id') != user['id'] and client.get('customer_email', '').lower() != email):
        raise HTTPException(403, 'Not your entry')
    await db.calendar_entries.update_one({'id': entry_id}, {'$set': {'done': bool(done)}})
    return {'ok': True, 'done': bool(done)}


# ============ STAGE 4 — PAID SESSION FLOW ============
async def _sync_protocol_payment(proto: dict) -> dict:
    """If protocol has a linked paylink order, sync its paid state."""
    order_id = proto.get('payment_order_id')
    if not order_id or proto.get('paid'):
        return proto
    order = await db.orders.find_one({'id': order_id})
    if order and order.get('payment_status') == 'paid' and not proto.get('paid'):
        await db.protocols.update_one({'id': proto['id']}, {'$set': {'paid': True, 'paid_at': datetime.utcnow()}})
        proto['paid'] = True
    return proto


@router.post('/coach/protocols/{proto_id}/paylink')
async def create_protocol_paylink(proto_id: str, user: dict = Depends(require_coach)):
    """Coach: generate a Wallid pay link for this protocol. Creates a paylink
    order tied to the protocol; when paid, the protocol unlocks for the client."""
    proto = await db.protocols.find_one({'id': proto_id, 'coach_id': user['id']})
    if not proto:
        raise HTTPException(404, 'Protocol not found')
    if proto.get('payment_order_id'):
        existing_order = await db.orders.find_one({'id': proto['payment_order_id']})
        if existing_order:
            return {'order_id': existing_order['id'], 'order_number': existing_order.get('order_number'),
                    'payment_link': f"/paylink/{existing_order['id']}"}

    price = float(proto.get('price') or user.get('default_price') or 9.99)
    client = await db.coaching_clients.find_one({'id': proto['client_id']})
    if not client:
        raise HTTPException(400, 'Client not found for protocol')

    from routes.order_routes import _next_order_number  # existing counter helper
    order_number = await _next_order_number()

    order_doc = {
        'id': str(uuid.uuid4()),
        'order_number': order_number,
        'source': 'paylink',
        'purpose': 'coaching',
        'protocol_id': proto_id,
        'items': [{
            'product_id': None,
            'slug': 'coaching-plan',
            'name': f"Coaching plan · {proto['title']}",
            'qty': 1,
            'price': price,
        }],
        'subtotal': price,
        'shipping': 0,
        'discount': 0,
        'total': price,
        'shipping_address': {
            'first_name': (client.get('customer_name') or '').split(' ')[0],
            'last_name': ' '.join((client.get('customer_name') or '').split(' ')[1:]),
            'email': client.get('customer_email', ''),
            'phone': '', 'address1': 'Coaching plan',
            'city': '', 'postcode': '', 'country': 'United Kingdom',
        },
        'payment_status': 'pending',
        'status': 'processing',
        'created_at': datetime.utcnow(),
        'updated_at': datetime.utcnow(),
    }
    await db.orders.insert_one(order_doc)

    await db.protocols.update_one(
        {'id': proto_id},
        {'$set': {'payment_order_id': order_doc['id'], 'price': price, 'paid': False}}
    )
    return {
        'order_id': order_doc['id'],
        'order_number': order_number,
        'payment_link': f"/paylink/{order_doc['id']}",
        'amount': price,
    }


# ============ STAGE 5 — MESSAGES + AT-RISK ============
from pydantic import BaseModel as _BaseModel


class MessageIn(_BaseModel):
    body: str


@router.get('/coach/clients/{client_id}/messages')
async def coach_messages(client_id: str, user: dict = Depends(require_coach)):
    await _get_coach_client(client_id, user['id'])
    msgs = await db.coach_messages.find({'client_id': client_id}).sort('created_at', 1).to_list(500)
    return [doc_to_dict(m) for m in msgs]


@router.post('/coach/clients/{client_id}/messages')
async def coach_send_message(client_id: str, payload: MessageIn, user: dict = Depends(require_coach)):
    await _get_coach_client(client_id, user['id'])
    doc = {
        'id': str(uuid.uuid4()), 'client_id': client_id, 'from_role': 'coach',
        'coach_id': user['id'], 'body': payload.body.strip(),
        'created_at': datetime.utcnow(),
    }
    await db.coach_messages.insert_one(doc)
    return doc_to_dict(doc)


@router.get('/my/messages')
async def my_messages(user: dict = Depends(get_current_user)):
    email = (user.get('email') or '').lower()
    client = await db.coaching_clients.find_one({
        '$or': [{'customer_user_id': user['id']}, {'customer_email': email}], 'active': True,
    })
    if not client:
        return []
    msgs = await db.coach_messages.find({'client_id': client['id']}).sort('created_at', 1).to_list(500)
    return [doc_to_dict(m) for m in msgs]


@router.post('/my/messages')
async def my_send_message(payload: MessageIn, user: dict = Depends(get_current_user)):
    email = (user.get('email') or '').lower()
    client = await db.coaching_clients.find_one({
        '$or': [{'customer_user_id': user['id']}, {'customer_email': email}], 'active': True,
    })
    if not client:
        raise HTTPException(404, 'No active coaching relationship')
    doc = {
        'id': str(uuid.uuid4()), 'client_id': client['id'], 'from_role': 'client',
        'coach_id': client.get('coach_id'), 'body': payload.body.strip(),
        'created_at': datetime.utcnow(),
    }
    await db.coach_messages.insert_one(doc)
    return doc_to_dict(doc)


@router.get('/coach/at-risk')
async def coach_at_risk(user: dict = Depends(require_coach)):
    """Clients who missed a scheduled dose in the last 3 days."""
    from datetime import timedelta
    today = datetime.utcnow().date().isoformat()
    three_days_ago = (datetime.utcnow().date() - timedelta(days=3)).isoformat()
    proto_ids = [p['id'] async for p in db.protocols.find({'coach_id': user['id'], 'active': True}, {'id': 1})]
    if not proto_ids:
        return []
    entries = await db.calendar_entries.find({
        'protocol_id': {'$in': proto_ids},
        'date': {'$gte': three_days_ago, '$lt': today},
        'done': False,
    }).to_list(500)
    missed_by_client: dict[str, int] = {}
    for e in entries:
        missed_by_client[e['client_id']] = missed_by_client.get(e['client_id'], 0) + 1
    if not missed_by_client:
        return []
    clients = await db.coaching_clients.find(
        {'id': {'$in': list(missed_by_client.keys())}}
    ).to_list(100)
    return [{**doc_to_dict(c), 'missed_count': missed_by_client.get(c['id'], 0)} for c in clients]


# ---------------- Weigh-ins ----------------

from models import WeighInIn, TargetWeightIn  # noqa: E402


async def _my_client(user: dict) -> Optional[dict]:
    email = (user.get('email') or '').lower()
    return await db.coaching_clients.find_one({
        '$or': [{'customer_user_id': user['id']}, {'customer_email': email}], 'active': True,
    })


@router.get('/my/weigh-ins')
async def my_weigh_ins(user: dict = Depends(get_current_user)):
    client = await _my_client(user)
    if not client:
        return {'entries': [], 'target_weight_kg': None}
    entries = await db.weigh_ins.find({'client_id': client['id']}).sort('date', 1).to_list(500)
    return {
        'entries': [doc_to_dict(e) for e in entries],
        'target_weight_kg': client.get('target_weight_kg'),
    }


@router.post('/my/weigh-ins')
async def my_add_weigh_in(payload: WeighInIn, user: dict = Depends(get_current_user)):
    client = await _my_client(user)
    if not client:
        raise HTTPException(404, 'No active coaching relationship')
    now = datetime.utcnow()
    # Upsert by (client_id, date) — one entry per day
    doc = {
        'client_id': client['id'],
        'date': payload.date,
        'weight_kg': float(payload.weight_kg),
        'updated_at': now,
    }
    existing = await db.weigh_ins.find_one({'client_id': client['id'], 'date': payload.date})
    if existing:
        await db.weigh_ins.update_one({'_id': existing['_id']}, {'$set': doc})
        return {**doc_to_dict(existing), **doc}
    doc.update({'id': str(uuid.uuid4()), 'created_at': now})
    await db.weigh_ins.insert_one(doc)
    return doc_to_dict(doc)


@router.delete('/my/weigh-ins/{entry_id}')
async def my_delete_weigh_in(entry_id: str, user: dict = Depends(get_current_user)):
    client = await _my_client(user)
    if not client:
        raise HTTPException(404, 'No active coaching relationship')
    res = await db.weigh_ins.delete_one({'id': entry_id, 'client_id': client['id']})
    if res.deleted_count == 0:
        raise HTTPException(404, 'Weigh-in not found')
    return {'ok': True}


@router.patch('/my/target-weight')
async def my_set_target_weight(payload: TargetWeightIn, user: dict = Depends(get_current_user)):
    client = await _my_client(user)
    if not client:
        raise HTTPException(404, 'No active coaching relationship')
    await db.coaching_clients.update_one(
        {'id': client['id']},
        {'$set': {'target_weight_kg': payload.target_weight_kg}},
    )
    return {'ok': True, 'target_weight_kg': payload.target_weight_kg}


@router.get('/coach/clients/{client_id}/weigh-ins')
async def coach_weigh_ins(client_id: str, user: dict = Depends(require_coach)):
    await _get_coach_client(client_id, user['id'])
    entries = await db.weigh_ins.find({'client_id': client_id}).sort('date', 1).to_list(500)
    client = await db.coaching_clients.find_one({'id': client_id})
    return {
        'entries': [doc_to_dict(e) for e in entries],
        'target_weight_kg': (client or {}).get('target_weight_kg'),
    }


@router.patch('/coach/clients/{client_id}/target-weight')
async def coach_set_target_weight(client_id: str, payload: TargetWeightIn, user: dict = Depends(require_coach)):
    await _get_coach_client(client_id, user['id'])
    await db.coaching_clients.update_one(
        {'id': client_id},
        {'$set': {'target_weight_kg': payload.target_weight_kg}},
    )
    return {'ok': True, 'target_weight_kg': payload.target_weight_kg}
