"""Wallid Pay-by-Bank payment gateway routes."""
import base64
import hashlib
import hmac
import os
import time
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Request, Body
from pymongo.errors import DuplicateKeyError

from db import db
from order_helpers import mark_order_paid

router = APIRouter(prefix='/wallid', tags=['wallid'])

WALLID_BASE_URL = os.environ.get('WALLID_BASE_URL', 'https://payment-api.wallid.co/api/payment-gw/v1')
WALLID_KEY_ID = os.environ.get('WALLID_KEY_ID', '')
WALLID_KEY_SECRET = os.environ.get('WALLID_KEY_SECRET', '')
WALLID_WEBHOOK_SECRET = os.environ.get('WALLID_WEBHOOK_SECRET', '')
FRONTEND_PUBLIC_URL = os.environ.get('FRONTEND_PUBLIC_URL', '').rstrip('/')

FINAL_STATUSES = {'SUCCESS', 'FAILED', 'EXPIRED'}


def _configured() -> bool:
    return bool(WALLID_KEY_ID and WALLID_KEY_SECRET)


def _basic_auth_header() -> str:
    token = base64.b64encode(f"{WALLID_KEY_ID}:{WALLID_KEY_SECRET}".encode()).decode()
    return f"Basic {token}"


def _gbp_to_minor(amount: float) -> int:
    return int(round(float(amount) * 100))


def _frontend_base(request: Request) -> str:
    """Prefer FRONTEND_PUBLIC_URL, else fall back to request Origin header
    (useful on preview environment)."""
    if FRONTEND_PUBLIC_URL:
        return FRONTEND_PUBLIC_URL
    origin = request.headers.get('origin', '').rstrip('/')
    if origin:
        return origin
    # last-resort: reconstruct from Host
    host = request.headers.get('host', '')
    scheme = request.headers.get('x-forwarded-proto', 'https')
    return f"{scheme}://{host}".rstrip('/')


@router.get('/config')
async def wallid_config():
    return {'configured': _configured()}


@router.post('/create-payment')
async def create_payment(payload: dict = Body(...), request: Request = None):
    """Create a Wallid hosted payment session for an existing internal order.
    Returns { payment_link, api_payment_id, status } — the frontend redirects
    the customer to payment_link."""
    if not _configured():
        raise HTTPException(500, 'Wallid is not configured')

    internal_order_id = payload.get('order_id')
    if not internal_order_id:
        raise HTTPException(400, 'order_id is required')

    order = await db.orders.find_one({'id': internal_order_id})
    if not order:
        raise HTTPException(404, 'Order not found')
    if order.get('payment_status') == 'paid':
        raise HTTPException(409, 'This order has already been paid')

    # Same pre-flight stock guard as PayPal — refuse to start payment if any
    # item is oversold. Variant stock overrides product stock.
    for item in order.get('items', []):
        if not item.get('product_id'):
            continue
        prod = await db.products.find_one(
            {'id': item['product_id']}, {'stock': 1, 'name': 1, 'variants': 1}
        )
        if not prod:
            continue
        available = int(prod.get('stock', 0) or 0)
        opt = item.get('option')
        if opt:
            for v in prod.get('variants', []) or []:
                if str(v.get('label', '')).strip().lower() == str(opt).strip().lower():
                    vs = v.get('stock')
                    if vs is not None:
                        available = int(vs)
                    break
        if available < int(item['qty']):
            raise HTTPException(
                409,
                f"Insufficient stock for '{item.get('name') or prod.get('name') or 'item'}'"
                + (f" ({opt})" if opt else '')
                + f". Only {available} left.",
            )

    amount_minor = _gbp_to_minor(order['total'])
    currency = order.get('currency', 'GBP')

    base = _frontend_base(request)
    success_url = f"{base}/order-confirmation/{order['order_number']}?wallid=1"
    fail_url = f"{base}/checkout?wallid=failed"

    # Build items for Wallid. Their docs require category + image_url + product_url.
    items_payload = []
    for it in order.get('items', []) or []:
        img = it.get('image') or ''
        if img and img.startswith('/'):
            img = f"{base}{img}"
        elif not img:
            img = f"{base}/favicon.ico"
        product_url = f"{base}/product/{it.get('slug', '')}" if it.get('slug') else base
        items_payload.append({
            'name': str(it.get('name', 'Item'))[:120],
            'category': 'Research chemicals',
            'price_minor': _gbp_to_minor(it.get('price', 0)),
            'image_url': img,
            'product_url': product_url,
        })

    body = {
        'order_id': order['order_number'],
        'amount': amount_minor,
        'currency': currency,
        'success_url': success_url,
        'fail_url': fail_url,
        'items': items_payload,
        'description': f"GHP-Health order {order['order_number']}",
        'customer_email': (order.get('shipping_address') or {}).get('email', ''),
        'country': (order.get('shipping_address') or {}).get('country') and 'GB' or 'GB',
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.post(
                f"{WALLID_BASE_URL}/create",
                json=body,
                headers={'Authorization': _basic_auth_header(), 'Content-Type': 'application/json'},
            )
        except httpx.RequestError as e:
            raise HTTPException(502, f'Wallid network error: {e}')

    if resp.status_code >= 400:
        raise HTTPException(502, f'Wallid create failed ({resp.status_code}): {resp.text[:300]}')

    data = resp.json()
    api_payment_id = data.get('api_payment_id')
    payment_link = data.get('payment_link')
    status_str = data.get('status', 'NEW')
    if not api_payment_id or not payment_link:
        raise HTTPException(502, 'Wallid response missing api_payment_id / payment_link')

    await db.orders.update_one(
        {'id': internal_order_id},
        {'$set': {
            'wallid_api_payment_id': api_payment_id,
            'wallid_status': status_str,
            'payment_provider': 'wallid',
            'updated_at': datetime.utcnow(),
        }},
    )

    return {
        'api_payment_id': api_payment_id,
        'payment_link': payment_link,
        'status': status_str,
    }


async def _apply_status(order: dict, wallid_status: str, payment_ref: str = '', source: str = 'polling'):
    """Idempotent status mapping — called by webhook and status-poll.
    `source` is stamped onto the order so admins can see if the payment was
    confirmed by webhook (instant) or by polling (delayed / webhook missed).
    """
    wallid_status = (wallid_status or '').upper()
    if not order:
        return
    if wallid_status == 'SUCCESS':
        await mark_order_paid(
            order_id=order['id'],
            payment_id=payment_ref or order.get('wallid_api_payment_id', ''),
            payment_provider='wallid',
            extra_fields={'wallid_status': wallid_status},
            payment_source=source,
        )
    elif wallid_status in ('FAILED', 'EXPIRED'):
        # Only downgrade if not already paid via another route
        await db.orders.update_one(
            {'id': order['id'], 'payment_status': {'$ne': 'paid'}},
            {'$set': {
                'payment_status': 'failed',
                'wallid_status': wallid_status,
                'updated_at': datetime.utcnow(),
            }},
        )
    else:  # NEW / PENDING
        await db.orders.update_one(
            {'id': order['id']},
            {'$set': {'wallid_status': wallid_status, 'updated_at': datetime.utcnow()}},
        )


@router.post('/webhook')
async def wallid_webhook(request: Request):
    """Verify HMAC-SHA256 signature on the RAW body, then process events."""
    if not WALLID_WEBHOOK_SECRET:
        raise HTTPException(500, 'Webhook secret not configured')

    raw_body = await request.body()
    ts_str = request.headers.get('x-webhook-timestamp', '')
    sig = request.headers.get('x-webhook-signature', '')

    if not ts_str or not sig:
        raise HTTPException(400, 'Missing signature headers')

    # Replay window: reject if timestamp is more than 5 minutes off.
    try:
        ts = int(ts_str)
    except ValueError:
        raise HTTPException(400, 'Bad timestamp header')
    if abs(int(time.time()) - ts) > 300:
        raise HTTPException(400, 'Timestamp outside allowed window')

    # Message = "{timestamp}.{raw_body_bytes}" — use bytes concatenation to
    # avoid any decode/re-encode subtleties on the raw body.
    message = ts_str.encode('utf-8') + b'.' + raw_body
    expected = 'sha256=' + hmac.new(
        WALLID_WEBHOOK_SECRET.encode('utf-8'),
        message,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, sig):
        raise HTTPException(400, 'Invalid signature')

    # Only now parse JSON
    try:
        import json as _json
        payload = _json.loads(raw_body.decode('utf-8'))
    except Exception:
        raise HTTPException(400, 'Invalid JSON body')

    events = payload.get('events', []) or []
    processed = 0
    for evt in events:
        event_id = evt.get('event_id')
        api_payment_id = evt.get('api_payment_id')
        status_str = (evt.get('status') or '').upper()
        if not event_id or not api_payment_id:
            continue

        # Idempotency — unique index on event_id
        try:
            await db.wallid_events.insert_one({
                'event_id': event_id,
                'api_payment_id': api_payment_id,
                'status': status_str,
                'received_at': datetime.now(timezone.utc),
                'raw': evt,
            })
        except DuplicateKeyError:
            continue  # already processed

        order = await db.orders.find_one({'wallid_api_payment_id': api_payment_id})
        if order:
            await _apply_status(order, status_str, payment_ref=api_payment_id, source='webhook')
        processed += 1

    return {'ok': True, 'processed': processed}


@router.get('/verify-status/{order_id}')
async def verify_status(order_id: str):
    """Fallback status poll — updates local order state from Wallid."""
    if not _configured():
        raise HTTPException(500, 'Wallid is not configured')
    order = await db.orders.find_one({'id': order_id})
    if not order:
        raise HTTPException(404, 'Order not found')
    api_payment_id = order.get('wallid_api_payment_id')
    if not api_payment_id:
        raise HTTPException(400, 'Order has no Wallid payment')

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{WALLID_BASE_URL}/status",
            params={'apiPaymentId': api_payment_id},
            headers={'Authorization': _basic_auth_header()},
        )
    if resp.status_code >= 400:
        raise HTTPException(502, f'Wallid status failed ({resp.status_code}): {resp.text[:200]}')

    data = resp.json()
    wallid_status = (data.get('status') or '').upper()
    await _apply_status(order, wallid_status, payment_ref=api_payment_id, source='polling')
    refreshed = await db.orders.find_one({'id': order_id}) or order
    return {
        'wallid_status': wallid_status,
        'payment_status': refreshed.get('payment_status'),
        'order_number': refreshed.get('order_number'),
    }
