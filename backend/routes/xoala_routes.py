"""Xoala card payments — hosted 'Standard Checkout' (customer enters card on Xoala's page).

Flow: POST /xoala/create-payment → signed form fields → browser POSTs them to Xoala →
Xoala POSTs the result to /xoala/return (we verify + 303 to the SPA) and JSON to /xoala/notify.
"""
import hashlib
import hmac
import logging
import os
from datetime import datetime
from fastapi import APIRouter, HTTPException, Request, Body, Depends
from fastapi.responses import RedirectResponse
from db import db
from order_helpers import mark_order_paid
from auth import require_admin

logger = logging.getLogger('xoala')
router = APIRouter(prefix='/xoala', tags=['xoala'])

XOALA_BASE_URL = os.environ.get('XOALA_BASE_URL', '').rstrip('/')
XOALA_MEMBER_ID = os.environ.get('XOALA_MEMBER_ID', '')
XOALA_TOTYPE = os.environ.get('XOALA_TOTYPE', '')
XOALA_SECRET_KEY = os.environ.get('XOALA_SECRET_KEY', '')
XOALA_TERMINAL_ID = os.environ.get('XOALA_TERMINAL_ID', '')
XOALA_CURRENCY = os.environ.get('XOALA_CURRENCY', 'GBP')
SANDBOX = 'sandbox' in XOALA_BASE_URL

STATUS_LABEL = {'Y': 'paid', 'N': 'failed', 'C': 'cancelled', 'P': 'pending', '3D': 'pending'}


def _configured() -> bool:
    return bool(XOALA_BASE_URL and XOALA_MEMBER_ID and XOALA_TOTYPE and XOALA_SECRET_KEY)


def _md5(*parts: str) -> str:
    return hashlib.md5('|'.join(parts).encode('utf-8')).hexdigest()


def _checksum_ok(expected: str, supplied: str) -> bool:
    return bool(supplied) and hmac.compare_digest(expected.lower(), supplied.lower())


def _api_base(request: Request) -> str:
    """Our public origin (frontend + /api share a host). Prefer the caller's origin so
    preview, GHP and Helixaris each get callbacks on their own domain."""
    origin = request.headers.get('origin') or request.headers.get('referer', '')
    if origin:
        from urllib.parse import urlparse
        u = urlparse(origin)
        if u.scheme and u.netloc:
            return f'{u.scheme}://{u.netloc}'
    base = os.environ.get('SITE_BASE_URL', '').rstrip('/')
    if not base:
        proto = request.headers.get('x-forwarded-proto', 'https')
        base = f"{proto}://{request.headers.get('host', '')}"
    return base


def _frontend_base(request: Request) -> str:
    return _api_base(request)


def _amount_str(total) -> str:
    return f'{float(total):.2f}'


@router.get('/config')
async def xoala_config():
    return {'configured': _configured(), 'sandbox': SANDBOX, 'currency': XOALA_CURRENCY}


@router.post('/create-payment')
async def create_payment(payload: dict = Body(...), request: Request = None):
    """Build the signed Xoala form for an existing order. Frontend auto-submits it."""
    if not _configured():
        raise HTTPException(500, 'Card payments are not configured')
    order = await db.orders.find_one({'id': payload.get('order_id', '')})
    if not order:
        raise HTTPException(404, 'Order not found')
    if order.get('payment_status') == 'paid':
        raise HTTPException(409, 'This order has already been paid')

    for item in order.get('items', []):
        if not item.get('product_id'):
            continue
        prod = await db.products.find_one({'id': item['product_id']}, {'stock': 1, 'name': 1, 'variants': 1})
        if not prod:
            continue
        available = int(prod.get('stock', 0) or 0)
        opt = item.get('option')
        if opt:
            for v in prod.get('variants', []) or []:
                if str(v.get('label', '')).strip().lower() == str(opt).strip().lower() and v.get('stock') is not None:
                    available = int(v['stock'])
                    break
        if available < int(item['qty']):
            raise HTTPException(409, f"Insufficient stock for '{item.get('name') or prod.get('name')}'. Only {available} left.")

    attempt = int(order.get('xoala_attempts', 0) or 0) + 1
    txn_id = f"{order['order_number']}-{attempt}"
    amount = _amount_str(order['total'])
    api_base = _api_base(request)
    redirect_url = f'{api_base}/api/xoala/return'
    notify_url = f'{api_base}/api/xoala/notify'
    addr = order.get('shipping_address') or {}

    fields = {
        'memberId': XOALA_MEMBER_ID,
        'totype': XOALA_TOTYPE,
        'amount': amount,
        'TMPL_AMOUNT': amount,
        'currency': XOALA_CURRENCY,
        'TMPL_CURRENCY': XOALA_CURRENCY,
        'merchantTransactionId': txn_id,
        'merchantRedirectUrl': redirect_url,
        'notificationUrl': notify_url,
        'orderDescription': f"Order {order['order_number']}",
        'transactionType': 'DB',
        'paymentMode': 'CC',
        'language': 'ENG',
        'firstName': (addr.get('first_name') or '')[:50],
        'lastName': (addr.get('last_name') or '')[:50],
        'email': addr.get('email') or '',
        'phone': (addr.get('phone') or '')[:24],
        'telnocc': '+44',
        'country': 'GB',
        'city': (addr.get('city') or '')[:50],
        'state': 'NA',
        'postcode': (addr.get('postcode') or '').replace(' ', '')[:9],
        'street': (addr.get('address1') or '')[:100],
        'customerId': order['id'][:100],
        'ip': (request.headers.get('x-forwarded-for', '').split(',')[0].strip() or (request.client.host if request.client else '')),
    }
    if XOALA_TERMINAL_ID:
        fields['terminalid'] = XOALA_TERMINAL_ID
    fields['checksum'] = _md5(XOALA_MEMBER_ID, XOALA_TOTYPE, amount, txn_id, redirect_url, XOALA_SECRET_KEY)
    fields = {k: v for k, v in fields.items() if v != ''}

    await db.orders.update_one({'id': order['id']}, {'$set': {
        'xoala_txn_id': txn_id, 'xoala_attempts': attempt, 'xoala_status': 'begun',
        'xoala_amount': amount, 'xoala_currency': XOALA_CURRENCY,
        'xoala_return_to': _frontend_base(request),
        'payment_provider': 'xoala', 'updated_at': datetime.utcnow(),
    }})
    return {'action': f'{XOALA_BASE_URL}/transaction/Checkout', 'fields': fields, 'txn_id': txn_id}


async def _apply(order: dict, status: str, payment_id: str, source: str, raw: dict) -> None:
    status = (status or '').upper()
    if status == 'Y':
        await mark_order_paid(
            order_id=order['id'], payment_id=payment_id, payment_provider='xoala',
            extra_fields={
                'xoala_status': 'Y', 'xoala_payment_id': payment_id,
                'xoala_card': f"{raw.get('paymentBrand') or ''} •••• {raw.get('cardLast4Digits') or (raw.get('card') or {}).get('last4Digits') or ''}".strip(),
            },
            payment_source=source,
        )
    elif status in ('N', 'C'):
        await db.orders.update_one(
            {'id': order['id'], 'payment_status': {'$ne': 'paid'}},
            {'$set': {'payment_status': 'failed', 'xoala_status': status, 'xoala_payment_id': payment_id,
                      'xoala_result': (raw.get('resultDescription') or (raw.get('result') or {}).get('description') or raw.get('remark') or '')[:200],
                      'updated_at': datetime.utcnow()}},
        )
    else:
        await db.orders.update_one({'id': order['id']}, {'$set': {
            'xoala_status': status, 'xoala_payment_id': payment_id, 'updated_at': datetime.utcnow()}})


@router.post('/return')
async def xoala_return(request: Request):
    """Browser lands here (POST from Xoala). Verify, record, then send the customer on."""
    form = await request.form()
    p = {str(k): str(v) for k, v in form.items()}
    txn_id = p.get('merchantTransactionId') or p.get('desc') or ''
    payment_id = p.get('paymentId') or p.get('trackingid') or ''
    status = (p.get('status') or '').upper()
    order = await db.orders.find_one({'xoala_txn_id': txn_id}) if txn_id else None
    front = (order or {}).get('xoala_return_to') or _api_base(request)

    if not order:
        logger.warning(f'xoala return: unknown txn {txn_id!r}')
        return RedirectResponse(f'{front}/checkout?xoala=failed', status_code=303)

    expected = _md5(payment_id, txn_id, p.get('amount', ''), status, XOALA_SECRET_KEY)
    if not _checksum_ok(expected, p.get('checksum', '')):
        logger.error(f'xoala return: bad checksum for {txn_id}')
        await db.orders.update_one({'id': order['id']}, {'$set': {'xoala_status': 'checksum_error', 'updated_at': datetime.utcnow()}})
        return RedirectResponse(f'{front}/checkout?xoala=failed', status_code=303)
    if p.get('amount') != order.get('xoala_amount'):
        logger.error(f'xoala return: amount mismatch for {txn_id}')
        return RedirectResponse(f'{front}/checkout?xoala=failed', status_code=303)

    await _apply(order, status, payment_id, 'return', p)
    if status in ('Y', 'P', '3D'):
        return RedirectResponse(f"{front}/order-confirmation/{order['order_number']}?xoala=1", status_code=303)
    return RedirectResponse(f'{front}/checkout?xoala=failed', status_code=303)


@router.post('/notify')
async def xoala_notify(request: Request):
    """Server-to-server notification from Xoala (JSON). Idempotent."""
    try:
        p = await request.json()
    except Exception:
        form = await request.form()
        p = {str(k): str(v) for k, v in form.items()}
    txn_id = str(p.get('merchantTransactionId') or '')
    payment_id = str(p.get('paymentId') or '')
    tx_status = str(p.get('transactionStatus') or '').upper()
    order = await db.orders.find_one({'xoala_txn_id': txn_id}) if txn_id else None
    if not order:
        raise HTTPException(404, 'Unknown transaction')
    expected = _md5(payment_id, txn_id, str(p.get('amount', '')), tx_status, XOALA_SECRET_KEY)
    if not _checksum_ok(expected, str(p.get('checksum', ''))):
        logger.error(f'xoala notify: bad checksum for {txn_id}')
        raise HTTPException(400, 'Invalid checksum')
    if str(p.get('amount', '')) != order.get('xoala_amount'):
        raise HTTPException(400, 'Amount mismatch')
    await _apply(order, tx_status, payment_id, 'webhook', p)
    await db.orders.update_one({'id': order['id']}, {'$set': {'xoala_notified_at': datetime.utcnow(), 'xoala_gateway_status': str(p.get('status') or '')}})
    return {'received': True}


@router.get('/status/{order_id}')
async def xoala_status(order_id: str):
    order = await db.orders.find_one({'$or': [{'id': order_id}, {'order_number': order_id}]},
                                     {'_id': 0, 'payment_status': 1, 'xoala_status': 1, 'order_number': 1})
    if not order:
        raise HTTPException(404, 'Order not found')
    return order


@router.get('/debug/recent')
async def recent(_=Depends(require_admin)):
    docs = await db.orders.find({'xoala_txn_id': {'$exists': True}}, {
        '_id': 0, 'order_number': 1, 'payment_status': 1, 'xoala_status': 1, 'xoala_payment_id': 1,
        'xoala_amount': 1, 'xoala_currency': 1, 'xoala_result': 1, 'xoala_notified_at': 1, 'updated_at': 1,
    }).sort('updated_at', -1).limit(20).to_list(20)
    return {'sandbox': SANDBOX, 'orders': docs}
