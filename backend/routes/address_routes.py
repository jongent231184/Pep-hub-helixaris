"""Saved shipping/billing address book for logged-in customers."""
from datetime import datetime
import uuid
from fastapi import APIRouter, HTTPException, Depends
from db import db
from models import AddressCreate, AddressUpdate, AddressOut
from auth import get_current_user
from utils import doc_to_dict

router = APIRouter(prefix='/addresses', tags=['addresses'])


async def _clear_default(user_id: str, except_id: str | None = None):
    """Ensure at most one address is marked default per user."""
    flt: dict = {'user_id': user_id, 'is_default': True}
    if except_id:
        flt['id'] = {'$ne': except_id}
    await db.addresses.update_many(flt, {'$set': {'is_default': False}})


@router.get('/mine', response_model=list[AddressOut])
async def list_mine(user: dict = Depends(get_current_user)):
    docs = await db.addresses.find({'user_id': user['id']}).sort('created_at', -1).to_list(50)
    return [AddressOut(**doc_to_dict(d)) for d in docs]


@router.post('', response_model=AddressOut)
async def create_address(payload: AddressCreate, user: dict = Depends(get_current_user)):
    # If this is the user's first address, force it to default.
    count = await db.addresses.count_documents({'user_id': user['id']})
    is_default = payload.is_default or count == 0

    now = datetime.utcnow()
    doc = {
        'id': str(uuid.uuid4()),
        'user_id': user['id'],
        **payload.model_dump(),
        'is_default': is_default,
        'created_at': now,
        'updated_at': now,
    }
    if is_default:
        await _clear_default(user['id'])
    await db.addresses.insert_one(doc)
    return AddressOut(**doc_to_dict(doc))


@router.put('/{address_id}', response_model=AddressOut)
async def update_address(address_id: str, payload: AddressUpdate, user: dict = Depends(get_current_user)):
    existing = await db.addresses.find_one({'id': address_id, 'user_id': user['id']})
    if not existing:
        raise HTTPException(404, 'Address not found')
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if updates.get('is_default') is True:
        await _clear_default(user['id'], except_id=address_id)
    updates['updated_at'] = datetime.utcnow()
    res = await db.addresses.find_one_and_update(
        {'id': address_id, 'user_id': user['id']},
        {'$set': updates},
        return_document=True,
    )
    return AddressOut(**doc_to_dict(res))


@router.delete('/{address_id}')
async def delete_address(address_id: str, user: dict = Depends(get_current_user)):
    res = await db.addresses.delete_one({'id': address_id, 'user_id': user['id']})
    if res.deleted_count == 0:
        raise HTTPException(404, 'Address not found')
    return {'ok': True}
