"""Client feedback on coaching: anytime from the portal, plus a formal end-of-plan request from the coach."""
import logging
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user, require_admin, require_coach
from db import db
from routes.coaching_routes import _get_coach_client
from routes.coaching_plans_routes import require_member, feedback_pending
from utils import doc_to_dict

logger = logging.getLogger('ghp.coaching.feedback')
router = APIRouter(prefix='/coaching', tags=['coaching-feedback'])

GOALS = ('yes', 'partly', 'no')


class FeedbackIn(BaseModel):
    kind: str = 'general'  # general | end_of_plan
    rating_overall: int = Field(ge=1, le=5)
    rating_communication: Optional[int] = Field(default=None, ge=1, le=5)
    rating_clarity: Optional[int] = Field(default=None, ge=1, le=5)
    rating_value: Optional[int] = Field(default=None, ge=1, le=5)
    nps: Optional[int] = Field(default=None, ge=0, le=10)
    went_well: str = ''
    improve: str = ''
    goal_achieved: Optional[str] = None
    testimonial: str = ''
    allow_certificate: bool = False
    allow_public: bool = False


def _fb_out(f: dict) -> dict:
    return doc_to_dict(f)


def _request_state(client: dict) -> dict:
    return {'feedback_requested_at': client.get('feedback_requested_at'), 'feedback_request_note': client.get('feedback_request_note', '')}


# ---------- member ----------
@router.get('/my/feedback')
async def my_feedback(client: dict = Depends(require_member)):
    docs = await db.coaching_feedback.find({'client_id': client['id']}).sort('created_at', -1).to_list(100)
    return {'items': [_fb_out(d) for d in docs], 'pending_request': await feedback_pending(client), **_request_state(client)}


@router.post('/my/feedback')
async def submit_feedback(payload: FeedbackIn, bg: BackgroundTasks, client: dict = Depends(require_member), user: dict = Depends(get_current_user)):
    if payload.kind not in ('general', 'end_of_plan'):
        raise HTTPException(400, 'Invalid feedback kind')
    if payload.goal_achieved and payload.goal_achieved not in GOALS:
        raise HTTPException(400, 'Invalid goal_achieved')
    if payload.kind == 'end_of_plan' and not client.get('feedback_requested_at'):
        payload.kind = 'general'
    doc = {'id': str(uuid.uuid4()), 'client_id': client['id'], 'coach_id': client.get('coach_id'),
           'customer_user_id': user['id'], 'client_name': client.get('customer_name', ''),
           **payload.model_dump(), 'went_well': payload.went_well.strip(), 'improve': payload.improve.strip(),
           'testimonial': payload.testimonial.strip(), 'created_at': datetime.utcnow()}
    await db.coaching_feedback.insert_one(dict(doc))
    bg.add_task(_notify_feedback, client, doc)
    return _fb_out(doc)


async def _notify_feedback(client: dict, fb: dict):
    try:
        from email_service import send_feedback_received_email
        coach = await db.users.find_one({'id': client.get('coach_id')}) if client.get('coach_id') else None
        await send_feedback_received_email(client, fb, (coach or {}).get('email'))
    except Exception as e:
        logger.error(f'feedback notify failed: {e}')


# ---------- coach ----------
class RequestIn(BaseModel):
    note: str = ''


@router.post('/coach/clients/{client_id}/feedback-request')
async def coach_request_feedback(client_id: str, payload: RequestIn, bg: BackgroundTasks, user: dict = Depends(require_coach)):
    client = await _get_coach_client(client_id, user['id'])
    now = datetime.utcnow()
    await db.coaching_clients.update_one({'id': client_id}, {'$set': {'feedback_requested_at': now, 'feedback_request_note': payload.note.strip()}})
    coach_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or 'Your coach'
    bg.add_task(_send_request_email, client, payload.note.strip(), coach_name)
    return {'ok': True, 'feedback_requested_at': now}


async def _send_request_email(client: dict, note: str, coach_name: str):
    try:
        from email_service import send_feedback_request_email
        await send_feedback_request_email(client, note, coach_name)
    except Exception as e:
        logger.error(f'feedback request email failed: {e}')


@router.delete('/coach/clients/{client_id}/feedback-request')
async def coach_withdraw_feedback_request(client_id: str, user: dict = Depends(require_coach)):
    await _get_coach_client(client_id, user['id'])
    await db.coaching_clients.update_one({'id': client_id}, {'$unset': {'feedback_requested_at': '', 'feedback_request_note': ''}})
    return {'ok': True}


@router.get('/coach/clients/{client_id}/feedback')
async def coach_client_feedback(client_id: str, user: dict = Depends(require_coach)):
    client = await _get_coach_client(client_id, user['id'])
    docs = await db.coaching_feedback.find({'client_id': client_id}).sort('created_at', -1).to_list(100)
    return {'items': [_fb_out(d) for d in docs], 'pending_request': await feedback_pending(client), **_request_state(client)}


# ---------- owner ----------
def _summary(docs: list[dict]) -> dict:
    nps_vals = [d['nps'] for d in docs if d.get('nps') is not None]
    promoters = sum(1 for n in nps_vals if n >= 9)
    detractors = sum(1 for n in nps_vals if n <= 6)
    avg = lambda k: round(sum(d[k] for d in docs if d.get(k) is not None) / max(1, sum(1 for d in docs if d.get(k) is not None)), 1) if any(d.get(k) is not None for d in docs) else None  # noqa: E731
    goals = {g: sum(1 for d in docs if d.get('goal_achieved') == g) for g in GOALS}
    return {'count': len(docs),
            'nps': round(100 * (promoters - detractors) / len(nps_vals)) if nps_vals else None,
            'nps_responses': len(nps_vals),
            'avg_overall': avg('rating_overall'), 'avg_communication': avg('rating_communication'),
            'avg_clarity': avg('rating_clarity'), 'avg_value': avg('rating_value'),
            'goals': goals, 'public_testimonials': sum(1 for d in docs if d.get('allow_public') and d.get('testimonial'))}


@router.get('/admin/feedback')
async def admin_feedback(_=Depends(require_admin)):
    docs = await db.coaching_feedback.find().sort('created_at', -1).to_list(1000)
    coaches = {c['id']: f"{c.get('first_name', '')} {c.get('last_name', '')}".strip() async for c in db.users.find({'role': 'coach'})}
    out = []
    for d in docs:
        o = _fb_out(d)
        o['coach_name'] = coaches.get(d.get('coach_id'), '—')
        out.append(o)
    return {'summary': _summary(docs), 'items': out}


@router.get('/coach/feedback')
async def coach_all_feedback(user: dict = Depends(require_coach)):
    docs = await db.coaching_feedback.find({'coach_id': user['id']}).sort('created_at', -1).to_list(1000)
    return {'summary': _summary(docs), 'items': [_fb_out(d) for d in docs]}


# ---------- public testimonials (opted-in only) ----------
@router.get('/testimonials')
async def public_testimonials():
    docs = await db.coaching_feedback.find({'allow_public': True, 'testimonial': {'$ne': ''}}).sort('created_at', -1).to_list(20)
    return [{'id': d['id'], 'first_name': (d.get('client_name') or 'A client').split(' ')[0], 'testimonial': d['testimonial'],
             'rating_overall': d.get('rating_overall'), 'created_at': d.get('created_at')} for d in docs]
