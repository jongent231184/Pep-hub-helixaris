"""Niftipay hosted card checkout: create order -> redirect to payUrl -> signed webhook marks paid."""
import hashlib
import hmac
import logging
import os
import time
from datetime import datetime, timedelta

import httpx
from fastapi import APIRouter, Body, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from auth import get_current_user_optional, require_admin
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
async def create_payment(payload: dict = Body(...), request: Request = None, user: dict = Depends(get_current_user_optional)):
    if not _configured():
        raise HTTPException(503, 'Card payments are not available yet')
    is_admin = bool(user) and user.get('role') == 'admin'
    if not is_admin and (await db.settings.find_one({'_singleton': True}) or {}).get('payments_paused'):
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


async def _remote_status(order_key: str) -> str:
    if not order_key:
        return ''
    code, data = await _api('GET', f'/api/fiat/orders/{order_key}')
    return ((data.get('order') or {}).get('status') or '').lower() if code == 200 else ''


@router.post('/webhook')
async def webhook(request: Request):
    raw = await request.body()
    secret = _cfg()['WEBHOOK_SECRET']
    signed = bool(secret) and _verify(secret, request.headers.get('x-timestamp', ''), request.headers.get('x-signature', ''), raw)
    if secret and not signed:
        logger.warning('niftipay webhook: bad signature')
        return JSONResponse({'ok': False, 'error': 'signature'}, status_code=500)
    try:
        payload = await request.json()
    except Exception:
        payload = None
    if not isinstance(payload, dict):
        return JSONResponse({'ok': False}, status_code=400)
    event = (payload.get('event') or '').lower()
    o = payload.get('order') if isinstance(payload.get('order'), dict) else {}
    nid, ref = o.get('id'), o.get('merchantReference')
    await db.niftipay_events.insert_one({'event': event, 'order_id': nid, 'reference': ref, 'signed': signed, 'received_at': datetime.utcnow(), 'payload': payload})
    clauses = [{'niftipay_order_id': v} for v in [nid] if isinstance(v, str) and v] + [{'niftipay_reference': v} for v in [ref] if isinstance(v, str) and v]
    if event == 'test' or not clauses:
        return {'ok': True}
    order = await db.orders.find_one({'$or': clauses})
    if not order:
        logger.warning(f'niftipay webhook: no order for {nid} / {ref}')
        return {'ok': True}
    if not signed:
        # Unsigned (no secret configured): trust only what Niftipay's API confirms.
        remote = await _remote_status(order.get('niftipay_order_key'))
        if event == 'paid' and remote not in ('paid', 'completed') or event != 'paid' and remote != event:
            logger.warning(f'niftipay webhook: unsigned {event} not confirmed by API ({remote!r}) for {order["id"]}')
            return {'ok': True}
    now = datetime.utcnow()
    if event == 'paid':
        await mark_order_paid(order_id=order['id'], payment_id=str(o.get('pspOrderId') or nid), payment_provider='niftipay',
                              extra_fields={'niftipay_status': 'paid', 'niftipay_amount_cents': o.get('amountCents')}, payment_source='webhook')
    elif event in ('cancelled', 'expired'):
        await db.orders.update_one({'id': order['id'], 'payment_status': {'$ne': 'paid'}},
                                   {'$set': {'payment_status': 'failed', 'niftipay_status': event, 'niftipay_pay_url': None, 'updated_at': now}})
    elif event == 'refunded':
        await db.orders.update_one({'id': order['id']}, {'$set': {'payment_status': 'refunded', 'niftipay_status': 'refunded', 'refunded_at': now, 'updated_at': now}})
    elif event in ('chargeback', 'risk_alert'):
        await db.orders.update_one({'id': order['id']}, {'$set': {'niftipay_status': event, 'flagged': True, 'flag_reason': f'Niftipay {event}', 'updated_at': now}})
    else:
        await db.orders.update_one({'id': order['id']}, {'$set': {'niftipay_status': event, 'updated_at': now}})
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
    already = float(order.get('refunded_amount') or 0)
    amount = float(payload.get('amount') or (float(order['total']) - already))
    if amount <= 0 or amount > float(order['total']) - already + 0.005:
        raise HTTPException(400, 'Refund amount exceeds remaining balance')
    code, data = await _api('POST', f"/api/fiat/orders/{order['niftipay_order_key']}/refunds",
                            json={'amountCents': int(round(amount * 100)), 'description': payload.get('reason') or f"Refund order {order.get('order_number', '')}"})
    if code >= 400:
        raise HTTPException(400, data.get('error') or 'Refund failed')
    total_refunded = already + amount
    full = total_refunded >= float(order['total']) - 0.005
    await db.orders.update_one({'id': order_id}, {'$set': {'payment_status': 'refunded' if full else 'partially_refunded', 'refunded_amount': round(total_refunded, 2), 'niftipay_status': 'refunded' if full else 'paid',
                                                           'refunded_at': datetime.utcnow(), 'updated_at': datetime.utcnow()}})
    try:
        from email_service import send_refund_email
        await send_refund_email(order, f'{amount:.2f}', f'{amount:.2f}', full, card='Niftipay')
    except Exception as e:
        logger.warning(f'refund email skipped: {e}')
    return {'ok': True, 'refund': data}


@router.get('/admin/events')
async def recent_events(_=Depends(require_admin)):
    rows = await db.niftipay_events.find({}, {'_id': 0, 'payload': 0}).sort('received_at', -1).to_list(50)
    return [{**r, 'received_at': r['received_at'].isoformat() if r.get('received_at') else None} for r in rows]


async def sync_pending(max_age_hours: int = 48) -> dict:
    """Safety net: re-check every pending Niftipay order against the API and mark paid/failed."""
    since = datetime.utcnow() - timedelta(hours=max_age_hours)
    cur = db.orders.find({'niftipay_order_key': {'$exists': True, '$ne': None}, 'payment_status': 'pending', 'created_at': {'$gte': since}},
                         {'_id': 0, 'id': 1, 'order_number': 1, 'niftipay_order_key': 1})
    checked, changes = 0, []
    async for o in cur:
        checked += 1
        code, data = await _api('GET', f"/api/fiat/orders/{o['niftipay_order_key']}")
        if code != 200:
            continue
        ro = data.get('order') or {}
        st = (ro.get('status') or '').lower()
        await db.orders.update_one({'id': o['id']}, {'$set': {'niftipay_status': st, 'niftipay_psp_status': ro.get('pspStatus'), 'niftipay_card_brand': ro.get('pspPaymentMethodBrand')}})
        if st in ('paid', 'completed'):
            await mark_order_paid(order_id=o['id'], payment_id=str(ro.get('pspOrderId') or ''), payment_provider='niftipay',
                                  extra_fields={'niftipay_status': 'paid', 'niftipay_amount_cents': ro.get('amountCents')}, payment_source='poller')
            changes.append({'order_number': o['order_number'], 'to': 'paid'})
        elif st in ('cancelled', 'expired'):
            await db.orders.update_one({'id': o['id'], 'payment_status': 'pending'}, {'$set': {'payment_status': 'failed', 'niftipay_pay_url': None, 'updated_at': datetime.utcnow()}})
            changes.append({'order_number': o['order_number'], 'to': 'failed'})
    return {'checked': checked, 'now_paid': sum(c['to'] == 'paid' for c in changes), 'changes': changes}


@router.post('/admin/sync-pending')
async def admin_sync_pending(_=Depends(require_admin)):
    return await sync_pending()


async def start_niftipay_poller():
    import asyncio
    if not _configured():
        logger.info('[niftipay poller] not configured — disabled')
        return
    logger.info('[niftipay poller] started (interval=180s, max_age=48h)')
    while True:
        try:
            await asyncio.sleep(180)
            r = await sync_pending()
            if r['changes']:
                logger.info('[niftipay poller] ' + ', '.join(f"{c['order_number']} -> {c['to']}" for c in r['changes']))
        except Exception as e:
            logger.warning(f'[niftipay poller] error: {e}')
