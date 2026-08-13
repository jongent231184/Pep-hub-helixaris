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
from models import CoachingRequestCreate, CoachingRequestUpdate, CoachingRequestOut
from auth import require_admin
from utils import doc_to_dict

logger = logging.getLogger('ghp.coaching')
router = APIRouter(prefix='/coaching', tags=['coaching'])


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
