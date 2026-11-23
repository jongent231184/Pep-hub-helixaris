"""Niftipay hosted card checkout: create order -> redirect to payUrl -> signed webhook marks paid."""
import hashlib
import hmac
import logging
import os
import time
from datetime import datetime

import httpx
from fastapi import APIRouter, Body, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from auth import require_admin
from db import db
from order_helpers import mark_order_paid

logger = logging.getLogger('ghp.niftipay')
router = APIRouter(prefix='/niftipay', tags=['niftipay'])
BASE = 'https://www.niftipay.com'


def _cfg():
    return {k: os.environ.get(f'NIFTIPAY_{k}', '').strip() for k in ('API_KEY', 'INTEGRATION_ID', 'WEBHOOK_SECRET')}


def _configured() -> bool:
    c = _cfg()
    return bool(c['API_KEY'] and c['INTEGRATION_ID'])


def _frontend_base(request: Request) -> str:
    host = request.headers.get('x-forwarded-host') or request.headers.get('host', '')
    return f"https://{host}"


async def _api(method: str, path: str, **kw):
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.request(method, BASE + path, headers={'x-api-key': _cfg()['API_KEY'], 'Accept': 'application/json'}, **kw)
    try:
        data = r.json()
    except Exception:
        data = {'error': r.text[:200]}
    return r.status_code, data


@router.get('/config')
async def niftipay_config():
    return {'enabled': _configured()}


@router.post('/create-payment')
async def create_payment(payload: dict = Body(...), request: Request = None):
    if not _configured():
        raise HTTPException(503, 'Card payments are not available yet')
    if (await db.settings.find_one({'_singleton': True}) or {}).get('payments_paused'):
        raise HTTPException(503, 'Payments are temporarily paused')
    order = await db.orders.find_one({'id': payload.get('order_id', '')})
    if not order:
        raise HTTPException(404, 'Order not found')
    if order.get('payment_status') == 'paid':
        raise HTTPException(400, 'Order already paid')
    if order.get('niftipay_pay_url') and order.get('niftipay_order_key'):
        return {'pay_url': order['niftipay_pay_url']}
    addr = order.get('shipping_address') or {}
    attempt = int(order.get('niftipay_attempt') or 0) + 1
    reference = f"{order.get('order_number') or order['id'][:8]}" + (f"-{attempt}" if attempt > 1 else '')
    base = _frontend_base(request)
    body = {
        'integrationId': _cfg()['INTEGRATION_ID'], 'amount': f"{float(order['total']):.2f}", 'currency': 'GBP',
        'description': f"Order {order.get('order_number') or order['id'][:8]}", 'reference': reference,
        'email': order.get('email') or addr.get('email') or '', 'firstName': addr.get('first_name') or '', 'lastName': addr.get('last_name') or '',
        'phone': addr.get('phone') or '', 'country': (addr.get('country') or 'GB')[:2].upper(),
        'returnUrl': f"{base}/order-confirmation/{order.get('order_number') or order['id']}?niftipay=1",
        'failureUrl': f"{base}/checkout?niftipay=failed",
    }
    code, data = await _api('POST', '/api/fiat/orders', json=body)
    if code == 409 and 'eference' in str(data.get('error', '')):
        await db.orders.update_one({'id': order['id']}, {'$set': {'niftipay_attempt': attempt}})
        return await create_payment(payload, request)
    if code >= 400:
        logger.error(f'niftipay create failed {code}: {data}')
        raise HTTPException(502 if code >= 500 else 400, data.get('error') or 'Card payment could not be started')
    o = data.get('order') or {}
    await db.orders.update_one({'id': order['id']}, {'$set': {
        'payment_provider': 'niftipay', 'niftipay_order_id': o.get('id'), 'niftipay_order_key': o.get('orderKey'),
        'niftipay_reference': reference, 'niftipay_attempt': attempt, 'niftipay_pay_url': data.get('payUrl'),
        'niftipay_total_charged': (data.get('display') or {}).get('total'), 'niftipay_status': o.get('status'), 'updated_at': datetime.utcnow()}})
    return {'pay_url': data.get('payUrl'), 'display': data.get('display')}


def _verify(secret: str, ts: str, sig: str, raw: bytes) -> bool:
    if not (secret and ts and sig and sig.startswith('v1=')):
        return False
    if abs(int(time.time()) - int(ts or 0)) > 300:
        return False
    expected = hmac.new(secret.encode(), ts.encode() + b'.' + raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig[3:], expected)


async def _confirmed_paid(order_key: str) -> bool:
    if not order_key:
        return False
    code, data = await _api('GET', f'/api/fiat/orders/{order_key}')
    return code == 200 and ((data.get('order') or {}).get('status') or '').lower() in ('paid', 'completed')


@router.post('/webhook')
async def webhook(request: Request):
    raw = await request.body()
    secret = _cfg()['WEBHOOK_SECRET']
    if secret and not _verify(secret, request.headers.get('x-timestamp', ''), request.headers.get('x-signature', ''), raw):
        logger.warning('niftipay webhook: bad signature')
        return JSONResponse({'ok': False, 'error': 'signature'}, status_code=500)
    try:
        payload = await request.json()
    except Exception:
        return JSONResponse({'ok': False}, status_code=400)
    event = (payload.get('event') or '').lower()
    o = payload.get('order') or {}
    await db.niftipay_events.insert_one({'event': event, 'order_id': o.get('id'), 'reference': o.get('merchantReference'), 'received_at': datetime.utcnow(), 'payload': payload})
    if event == 'test' or not o:
        return {'ok': True}
    order = await db.orders.find_one({'$or': [{'niftipay_order_id': o.get('id')}, {'niftipay_reference': o.get('merchantReference')}]})
    if not order:
        logger.warning(f'niftipay webhook: no order for {o.get("id")} / {o.get("merchantReference")}')
        return {'ok': True}
    if event == 'paid':
        if not secret and not await _confirmed_paid(order.get('niftipay_order_key')):
            logger.warning(f'niftipay webhook: unsigned paid event not confirmed by API for {order["id"]}')
            return {'ok': True}
        await mark_order_paid(order_id=order['id'], payment_id=str(o.get('pspOrderId') or o.get('id')), payment_provider='niftipay',
                              extra_fields={'niftipay_status': 'paid', 'niftipay_amount_cents': o.get('amountCents')}, payment_source='webhook')
    elif event in ('cancelled', 'expired'):
        await db.orders.update_one({'id': order['id'], 'payment_status': {'$ne': 'paid'}},
                                   {'$set': {'payment_status': 'failed', 'niftipay_status': event, 'niftipay_pay_url': None, 'updated_at': datetime.utcnow()}})
    elif event == 'refunded':
        await db.orders.update_one({'id': order['id']}, {'$set': {'payment_status': 'refunded', 'niftipay_status': 'refunded', 'refunded_at': datetime.utcnow(), 'updated_at': datetime.utcnow()}})
    elif event in ('chargeback', 'risk_alert'):
        await db.orders.update_one({'id': order['id']}, {'$set': {'niftipay_status': event, 'flagged': True, 'flag_reason': f'Niftipay {event}', 'updated_at': datetime.utcnow()}})
    else:
        await db.orders.update_one({'id': order['id']}, {'$set': {'niftipay_status': event, 'updated_at': datetime.utcnow()}})
    return {'ok': True}


@router.get('/status/{order_id}')
async def status(order_id: str):
    order = await db.orders.find_one({'id': order_id}, {'_id': 0, 'payment_status': 1, 'niftipay_status': 1, 'niftipay_order_key': 1})
    if not order:
        raise HTTPException(404, 'Order not found')
    if order.get('payment_status') != 'paid' and order.get('niftipay_order_key') and _configured():
        code, data = await _api('GET', f"/api/fiat/orders/{order['niftipay_order_key']}")
        st = ((data.get('order') or {}).get('status') or '').lower()
        if code == 200 and st in ('paid', 'completed'):
            await mark_order_paid(order_id=order_id, payment_id=str((data['order']).get('pspOrderId') or ''), payment_provider='niftipay',
                                  extra_fields={'niftipay_status': 'paid'}, payment_source='poll')
            order['payment_status'] = 'paid'
    return {'payment_status': order.get('payment_status'), 'niftipay_status': order.get('niftipay_status')}


@router.post('/admin/{order_id}/refund')
async def refund(order_id: str, payload: dict = Body(default={}), _=Depends(require_admin)):
    order = await db.orders.find_one({'id': order_id})
    if not order or not order.get('niftipay_order_key'):
        raise HTTPException(404, 'No Niftipay payment on this order')
    amount = float(payload.get('amount') or order['total'])
    code, data = await _api('POST', f"/api/fiat/orders/{order['niftipay_order_key']}/refunds",
                            json={'amountCents': int(round(amount * 100)), 'description': payload.get('reason') or f"Refund order {order.get('order_number', '')}"})
    if code >= 400:
        raise HTTPException(400, data.get('error') or 'Refund failed')
    full = amount >= float(order['total']) - 0.005
    await db.orders.update_one({'id': order_id}, {'$set': {'payment_status': 'refunded' if full else 'partially_refunded', 'refunded_amount': amount,
                                                           'refunded_at': datetime.utcnow(), 'updated_at': datetime.utcnow()}})
    try:
        from email_service import send_refund_email
        await send_refund_email(order, f'{amount:.2f}', f'{amount:.2f}', full, card='Niftipay')
    except Exception as e:
        logger.warning(f'refund email skipped: {e}')
    return {'ok': True, 'refund': data}
