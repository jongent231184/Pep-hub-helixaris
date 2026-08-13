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
import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from db import db
from models import (
    CoachingRequestCreate, CoachingRequestUpdate, CoachingRequestOut,
    CoachCreate, CoachUpdate,
)
from auth import require_admin, require_coach, hash_password
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
    """Attach items + calendar entries."""
    items = await db.protocol_items.find({'protocol_id': proto['id']}).sort('created_at', 1).to_list(200)
    entries = await db.calendar_entries.find({'protocol_id': proto['id']}).sort('date', 1).to_list(1000)
    return {
        **doc_to_dict(proto),
        'items': [doc_to_dict(i) for i in items],
        'calendar': [doc_to_dict(e) for e in entries],
    }


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
    doc = {
        'id': str(uuid.uuid4()),
        'protocol_id': proto_id,
        'product_id': payload.product_id,
        'name': payload.name.strip(),
        'dose': payload.dose or '',
        'frequency': payload.frequency or '',
        'notes': payload.notes or '',
        'created_at': datetime.utcnow(),
    }
    await db.protocol_items.insert_one(doc)
    return doc_to_dict(doc)


@router.delete('/coach/protocols/{proto_id}/items/{item_id}')
async def delete_item(proto_id: str, item_id: str, user: dict = Depends(require_coach)):
    proto = await db.protocols.find_one({'id': proto_id, 'coach_id': user['id']})
    if not proto:
        raise HTTPException(404, 'Protocol not found')
    res = await db.protocol_items.delete_one({'id': item_id, 'protocol_id': proto_id})
    if res.deleted_count == 0:
        raise HTTPException(404, 'Item not found')
    return {'ok': True}


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
