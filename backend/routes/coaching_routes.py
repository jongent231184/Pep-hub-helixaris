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
