"""Admin customer blocklist — ban customers by name / email / address."""
from datetime import datetime
import uuid
from fastapi import APIRouter, HTTPException, Depends
from db import db
from models import BlocklistEntryCreate, BlocklistEntryOut
from auth import require_admin
from utils import doc_to_dict
from blocklist import entry_matches

router = APIRouter(prefix='/admin/blocklist', tags=['blocklist'])


def _has_criteria(e: dict) -> bool:
    return any((e.get(k) or '').strip() for k in ('email', 'postcode', 'first_name', 'last_name'))


@router.get('', response_model=list[BlocklistEntryOut])
async def list_entries(_=Depends(require_admin)):
    docs = await db.blocklist.find().sort('created_at', -1).to_list(2000)
    return [BlocklistEntryOut(**doc_to_dict(d)) for d in docs]


@router.post('', response_model=BlocklistEntryOut)
async def create_entry(payload: BlocklistEntryCreate, _=Depends(require_admin)):
    data = {k: (v or '').strip() for k, v in payload.model_dump().items()}
    if not _has_criteria(data):
        raise HTTPException(400, 'Provide at least an email, a postcode or a name')
    if data['postcode'] and not data['address1'] and not (data['first_name'] or data['last_name']):
        raise HTTPException(400, 'A postcode alone is too broad — add an address line or a name')
    doc = {'id': str(uuid.uuid4()), **data, 'hits': 0, 'created_at': datetime.utcnow()}
    await db.blocklist.insert_one(doc)
    return BlocklistEntryOut(**doc_to_dict(doc))


@router.post('/from-order/{order_id}', response_model=BlocklistEntryOut)
async def create_from_order(order_id: str, payload: BlocklistEntryCreate, _=Depends(require_admin)):
    """Ban the customer behind an order using its shipping address details."""
    order = await db.orders.find_one({'$or': [{'id': order_id}, {'order_number': order_id}]})
    if not order:
        raise HTTPException(404, 'Order not found')
    a = order.get('shipping_address') or {}
    doc = {
        'id': str(uuid.uuid4()),
        'first_name': a.get('first_name', ''),
        'last_name': a.get('last_name', ''),
        'email': a.get('email', ''),
        'address1': a.get('address1', ''),
        'postcode': a.get('postcode', ''),
        'reason': (payload.reason or '').strip(),
        'source_order_number': order.get('order_number'),
        'hits': 0,
        'created_at': datetime.utcnow(),
    }
    await db.blocklist.insert_one(doc)
    return BlocklistEntryOut(**doc_to_dict(doc))


@router.delete('/{entry_id}')
async def delete_entry(entry_id: str, _=Depends(require_admin)):
    res = await db.blocklist.delete_one({'id': entry_id})
    if res.deleted_count == 0:
        raise HTTPException(404, 'Entry not found')
    return {'ok': True}


@router.get('/matching-orders')
async def matching_orders(_=Depends(require_admin)):
    """Order ids whose shipping or billing address matches a blocklist entry."""
    entries = await db.blocklist.find().to_list(2000)
    if not entries:
        return {'order_ids': []}
    ids = []
    cursor = db.orders.find({}, {'id': 1, 'shipping_address': 1, 'billing_address': 1})
    async for o in cursor:
        addrs = [o.get('shipping_address') or {}, o.get('billing_address') or {}]
        if any(entry_matches(e, a) for e in entries for a in addrs):
            ids.append(o['id'])
    return {'order_ids': ids}
