"""Wallid Pay-by-Bank payment gateway routes."""
import base64
import hashlib
import hmac
import logging
import os
import time
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Request, Body, Depends
from pymongo.errors import DuplicateKeyError

from db import db
from order_helpers import mark_order_paid
from auth import require_admin

logger = logging.getLogger('ghp.wallid')
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


@router.get('/debug/webhook-health')
async def webhook_health(_=Depends(require_admin)):
    """Admin — show whether the webhook secret is loaded (without revealing it)
    and return the most recent 20 webhook attempts to diagnose why auto-sync
    might be failing."""
    attempts = await db.wallid_webhook_attempts.find().sort(
        'received_at', -1
    ).limit(20).to_list(20)
    for a in attempts:
        a.pop('_id', None)
        if 'received_at' in a and hasattr(a['received_at'], 'isoformat'):
            a['received_at'] = a['received_at'].isoformat()
    secret = WALLID_WEBHOOK_SECRET or ''
    return {
        'webhook_secret_configured': bool(secret),
        'webhook_secret_length': len(secret),
        'webhook_secret_starts_with': secret[:3] + '...' if len(secret) >= 3 else '',
        'wallid_api_configured': _configured(),
        'frontend_public_url': FRONTEND_PUBLIC_URL or '(auto-detect from origin)',
        'attempts_total': await db.wallid_webhook_attempts.count_documents({}),
        'recent_attempts': attempts,
        'server_time_utc': datetime.now(timezone.utc).isoformat(),
    }


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
    """Verify HMAC-SHA256 signature on the RAW body, then process events.
    Every attempt is recorded to `wallid_webhook_attempts` for diagnostics."""
    raw_body = await request.body()
    ts_str = request.headers.get('x-webhook-timestamp', '')
    sig = request.headers.get('x-webhook-signature', '')
    attempt_doc = {
        'received_at': datetime.now(timezone.utc),
        'has_timestamp': bool(ts_str),
        'has_signature': bool(sig),
        'body_len': len(raw_body),
        'body_preview': raw_body[:500].decode('utf-8', errors='replace'),
        'result': 'unknown',
    }

    async def _record(result: str, **extra):
        attempt_doc['result'] = result
        attempt_doc.update(extra)
        try:
            await db.wallid_webhook_attempts.insert_one(attempt_doc)
            # Keep only the most recent 200 attempts to bound the collection
            count = await db.wallid_webhook_attempts.count_documents({})
            if count > 200:
                oldest = await db.wallid_webhook_attempts.find().sort('received_at', 1).limit(count - 200).to_list(count - 200)
                if oldest:
                    await db.wallid_webhook_attempts.delete_many({'_id': {'$in': [o['_id'] for o in oldest]}})
        except Exception as e:
            logger.exception(f'Failed to log webhook attempt: {e}')

    if not WALLID_WEBHOOK_SECRET:
        logger.error('[wallid webhook] Rejected: WALLID_WEBHOOK_SECRET not configured on this environment')
        await _record('rejected_no_secret')
        raise HTTPException(500, 'Webhook secret not configured')

    if not ts_str or not sig:
        logger.warning('[wallid webhook] Rejected: missing signature headers')
        await _record('rejected_missing_headers')
        raise HTTPException(400, 'Missing signature headers')

    # Replay window: reject if timestamp is more than 5 minutes off.
    try:
        ts = int(ts_str)
    except ValueError:
        await _record('rejected_bad_timestamp', ts_str=ts_str)
        raise HTTPException(400, 'Bad timestamp header')
    skew = int(time.time()) - ts
    if abs(skew) > 300:
        logger.warning(f'[wallid webhook] Rejected: timestamp skew {skew}s (limit ±300s)')
        await _record('rejected_timestamp_skew', skew_seconds=skew)
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
        logger.warning(
            f'[wallid webhook] Rejected: signature mismatch. Expected prefix={expected[:20]}... got={sig[:20]}...'
        )
        await _record('rejected_signature_mismatch',
                      expected_prefix=expected[:20], received_prefix=sig[:20])
        raise HTTPException(400, 'Invalid signature')

    # Only now parse JSON
    try:
        import json as _json
        payload = _json.loads(raw_body.decode('utf-8'))
    except Exception:
        await _record('rejected_bad_json')
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

    logger.info(f'[wallid webhook] Accepted: {processed} event(s) processed')
    await _record('accepted', events_processed=processed, total_events=len(events))
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


@router.post('/sync-pending')
async def sync_pending_orders(_=Depends(require_admin)):
    """Admin — poll Wallid for every order that has a Wallid payment ID and
    isn't already paid, and update local state. Returns a summary."""
    if not _configured():
        raise HTTPException(500, 'Wallid is not configured')
    return await _sync_pending_impl()


async def _sync_pending_impl(max_age_hours: Optional[int] = None) -> dict:
    """Shared implementation used by both the admin endpoint and the background
    poller. If `max_age_hours` is set, only orders created within that window
    are polled (used by the background loop to avoid pounding Wallid with
    stale orders forever)."""
    query: dict = {
        'wallid_api_payment_id': {'$exists': True, '$nin': [None, '']},
        'payment_status': {'$ne': 'paid'},
    }
    if max_age_hours is not None:
        from datetime import timedelta as _td
        cutoff = datetime.utcnow() - _td(hours=max_age_hours)
        query['created_at'] = {'$gte': cutoff}

    orders = await db.orders.find(query).to_list(500)
    updated = 0
    now_paid = 0
    failed_lookups = 0
    changes = []

    async with httpx.AsyncClient(timeout=15.0) as client:
        for order in orders:
            api_payment_id = order.get('wallid_api_payment_id')
            prev_payment_status = order.get('payment_status')
            try:
                resp = await client.get(
                    f"{WALLID_BASE_URL}/status",
                    params={'apiPaymentId': api_payment_id},
                    headers={'Authorization': _basic_auth_header()},
                )
                if resp.status_code >= 400:
                    failed_lookups += 1
                    continue
                data = resp.json()
                wallid_status = (data.get('status') or '').upper()
            except httpx.RequestError:
                failed_lookups += 1
                continue

            await _apply_status(order, wallid_status, payment_ref=api_payment_id, source='polling')
            refreshed = await db.orders.find_one({'id': order['id']})
            new_status = refreshed.get('payment_status') if refreshed else prev_payment_status
            if new_status != prev_payment_status:
                updated += 1
                if new_status == 'paid':
                    now_paid += 1
                changes.append({
                    'order_number': order.get('order_number'),
                    'from': prev_payment_status,
                    'to': new_status,
                    'wallid_status': wallid_status,
                })

    return {
        'ok': True,
        'checked': len(orders),
        'updated': updated,
        'now_paid': now_paid,
        'failed_lookups': failed_lookups,
        'changes': changes,
    }


# Background poller — safety net for missed webhooks
POLLER_INTERVAL_SECONDS = int(os.environ.get('WALLID_POLLER_INTERVAL_SECONDS', '60'))
POLLER_MAX_AGE_HOURS = int(os.environ.get('WALLID_POLLER_MAX_AGE_HOURS', '24'))


async def start_wallid_poller():
    """Long-running background task that periodically polls Wallid for any
    pending order created within the last N hours. This is the safety net
    that catches webhook deliveries that never arrived. Idempotent — orders
    already paid are ignored via the DB query."""
    import asyncio
    if not _configured():
        logger.info('[wallid poller] Wallid not configured — background poller disabled')
        return
    logger.info(
        f'[wallid poller] Started (interval={POLLER_INTERVAL_SECONDS}s, '
        f'max_age={POLLER_MAX_AGE_HOURS}h)'
    )
    while True:
        try:
            await asyncio.sleep(POLLER_INTERVAL_SECONDS)
            result = await _sync_pending_impl(max_age_hours=POLLER_MAX_AGE_HOURS)
            if result.get('now_paid'):
                logger.info(
                    f'[wallid poller] Recovered {result["now_paid"]} order(s): '
                    + ', '.join(f"{c['order_number']} → {c['to']}" for c in result.get('changes', []))
                )
            elif result.get('checked'):
                logger.debug(f'[wallid poller] Checked {result["checked"]} pending order(s), no changes')
        except Exception as e:  # noqa: BLE001 — never let the loop die
            logger.exception(f'[wallid poller] Iteration failed (will continue): {e}')
