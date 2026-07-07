"""Promo / discount code routes.

Public:
- POST /api/promos/validate  (called from checkout)

Admin:
- GET    /api/promos
- POST   /api/promos
- PUT    /api/promos/{id}
- DELETE /api/promos/{id}
"""
from datetime import datetime, timezone
import uuid
from fastapi import APIRouter, HTTPException, Depends
from db import db
from models import PromoCreate, PromoUpdate, PromoOut, PromoValidateIn, PromoValidateOut
from auth import require_admin
from utils import doc_to_dict

router = APIRouter(prefix='/promos', tags=['promos'])


def _normalise_code(code: str) -> str:
    return (code or '').strip().upper()


async def _calculate_discount(promo: dict, subtotal: float, shipping: float) -> PromoValidateOut:
    """Given a matched promo doc, compute the discount for this basket."""
    code = promo['code']
    ptype = promo.get('type', 'percent')
    value = float(promo.get('value', 0))
    discount = 0.0
    shipping_discount = 0.0
    if ptype == 'percent':
        discount = round(subtotal * (value / 100.0), 2)
    elif ptype == 'fixed':
        discount = round(min(value, subtotal), 2)
    elif ptype == 'free_shipping':
        shipping_discount = round(shipping, 2)
    return PromoValidateOut(
        valid=True, code=code, type=ptype, value=value,
        discount=discount, shipping_discount=shipping_discount,
        message='Promo code applied'
    )


@router.post('/validate', response_model=PromoValidateOut)
async def validate_promo(payload: PromoValidateIn):
    code = _normalise_code(payload.code)
    if not code:
        raise HTTPException(400, 'Code is required')
    promo = await db.promos.find_one({'code': code})
    if not promo:
        return PromoValidateOut(valid=False, message='Invalid promo code')
    if not promo.get('active', True):
        return PromoValidateOut(valid=False, message='This promo code is no longer active')
    exp = promo.get('expires_at')
    if exp:
        exp_naive = exp.replace(tzinfo=None) if isinstance(exp, datetime) and exp.tzinfo else exp
        if isinstance(exp_naive, datetime) and exp_naive < datetime.utcnow():
            return PromoValidateOut(valid=False, message='This promo code has expired')
    max_uses = promo.get('max_uses')
    if max_uses is not None and int(promo.get('uses', 0)) >= int(max_uses):
        return PromoValidateOut(valid=False, message='This promo code has reached its usage limit')
    if float(payload.subtotal) < float(promo.get('min_subtotal', 0)):
        return PromoValidateOut(
            valid=False,
            message=f"Minimum basket subtotal £{float(promo['min_subtotal']):.2f} required"
        )
    return await _calculate_discount(promo, float(payload.subtotal), float(payload.shipping))


# ---------------- Admin ----------------
@router.get('', response_model=list[PromoOut])
async def list_promos(_=Depends(require_admin)):
    docs = await db.promos.find().sort('created_at', -1).to_list(500)
    return [PromoOut(**doc_to_dict(d)) for d in docs]


@router.post('', response_model=PromoOut)
async def create_promo(payload: PromoCreate, _=Depends(require_admin)):
    code = _normalise_code(payload.code)
    if not code:
        raise HTTPException(400, 'Code is required')
    if await db.promos.find_one({'code': code}):
        raise HTTPException(409, 'A promo with that code already exists')
    now = datetime.utcnow()
    doc = payload.model_dump()
    doc.update({
        'id': str(uuid.uuid4()),
        'code': code,
        'uses': 0,
        'created_at': now,
        'updated_at': now,
    })
    await db.promos.insert_one(doc)
    return PromoOut(**doc_to_dict(doc))


@router.put('/{promo_id}', response_model=PromoOut)
async def update_promo(promo_id: str, payload: PromoUpdate, _=Depends(require_admin)):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if 'code' in updates:
        updates['code'] = _normalise_code(updates['code'])
        clash = await db.promos.find_one({'code': updates['code'], 'id': {'$ne': promo_id}})
        if clash:
            raise HTTPException(409, 'A promo with that code already exists')
    if not updates:
        raise HTTPException(400, 'No fields to update')
    updates['updated_at'] = datetime.utcnow()
    res = await db.promos.find_one_and_update(
        {'id': promo_id}, {'$set': updates}, return_document=True
    )
    if not res:
        raise HTTPException(404, 'Promo not found')
    return PromoOut(**doc_to_dict(res))


@router.delete('/{promo_id}')
async def delete_promo(promo_id: str, _=Depends(require_admin)):
    res = await db.promos.delete_one({'id': promo_id})
    if res.deleted_count == 0:
        raise HTTPException(404, 'Promo not found')
    return {'ok': True}
