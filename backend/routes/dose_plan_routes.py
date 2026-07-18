"""Saved peptide reconstitution / dose plans for logged-in customers."""
from datetime import datetime
import uuid
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional
from db import db
from auth import get_current_user
from utils import doc_to_dict

router = APIRouter(prefix='/dose-plans', tags=['dose-plans'])


class DosePlanCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=80)
    syringe_units: int  # 30 | 50 | 100
    syringe_ml: float
    vial_mg: float
    bac_ml: float
    dose_mcg: float
    notes: Optional[str] = ''


class DosePlanOut(DosePlanCreate):
    id: str
    user_id: str
    created_at: datetime


@router.get('/mine', response_model=list[DosePlanOut])
async def list_mine(user: dict = Depends(get_current_user)):
    docs = await db.dose_plans.find({'user_id': user['id']}).sort('created_at', -1).to_list(50)
    return [DosePlanOut(**doc_to_dict(d)) for d in docs]


@router.post('', response_model=DosePlanOut)
async def create_plan(payload: DosePlanCreate, user: dict = Depends(get_current_user)):
    if await db.dose_plans.count_documents({'user_id': user['id']}) >= 50:
        raise HTTPException(400, 'Plan limit reached (50). Please delete an old plan first.')
    doc = {
        'id': str(uuid.uuid4()),
        'user_id': user['id'],
        **payload.model_dump(),
        'created_at': datetime.utcnow(),
    }
    await db.dose_plans.insert_one(doc)
    return DosePlanOut(**doc_to_dict(doc))


@router.delete('/{plan_id}')
async def delete_plan(plan_id: str, user: dict = Depends(get_current_user)):
    res = await db.dose_plans.delete_one({'id': plan_id, 'user_id': user['id']})
    if res.deleted_count == 0:
        raise HTTPException(404, 'Plan not found')
    return {'ok': True}
