"""Square Payment Links integration.

Design brief:
- One generic line item per order ("GHP Order #123") so peptide product names
  never touch Square's transaction descriptors. Line-item detail lives entirely
  in our DB; the customer still sees the full itemised invoice in their email +
  order-confirmation page.
- Sandbox by default. Flip `SQUARE_ENV=production` in .env to go live.
- Location ID is auto-resolved from the token on first use (Square accounts
  usually have one active location and the SDK exposes them via `locations.list`).
- Webhook signature verification is inline HMAC-SHA256 over
  `notification_url + raw_body`, per Square's spec.
"""
import base64
import hashlib
import hmac
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from square import Square
from square.core.api_error import ApiError
from square.environment import SquareEnvironment

from auth import get_current_user_optional, require_admin
from db import db

logger = logging.getLogger('ghp.square')
router = APIRouter(prefix='/square', tags=['square'])


def _verify_square_signature(*, body: bytes, header_sig: str, signing_keys: list, notification_urls: list) -> bool:
    """Square's webhook signature is HMAC-SHA256 of (URL + raw body), base64.

    Both the signing key and the notification URL must match what Square
    registered on the subscription. Since we run the same code across two
    pods with two subscriptions (preview URL + live URL), the caller passes
    all candidate keys and URLs — we return True as soon as any pair matches.

    See https://developer.squareup.com/docs/webhooks/step3validate
    """
    if not header_sig:
        return False
    for url in notification_urls:
        if not url:
            continue
        payload = (url + body.decode('utf-8')).encode('utf-8')
        for key in signing_keys:
            if not key:
                continue
            digest = hmac.new(key.encode('utf-8'), payload, hashlib.sha256).digest()
            expected = base64.b64encode(digest).decode('utf-8')
            if hmac.compare_digest(expected, header_sig):
                return True
    return False

_client: Optional[Square] = None
_location_id: Optional[str] = None


def _cfg() -> dict:
    return {
        'env': (os.environ.get('SQUARE_ENV') or 'sandbox').lower(),
        'token': os.environ.get('SQUARE_ACCESS_TOKEN', ''),
        'location': os.environ.get('SQUARE_LOCATION_ID', '').strip() or None,
        'signature_key': os.environ.get('SQUARE_WEBHOOK_SIGNATURE_KEY', ''),
        'webhook_url': os.environ.get('SQUARE_WEBHOOK_URL', '').strip(),
    }


def _client_singleton() -> Square:
    global _client
    if _client is not None:
        return _client
    cfg = _cfg()
    if not cfg['token']:
        raise HTTPException(503, 'Square is not configured on this deploy.')
    _client = Square(
        environment=(SquareEnvironment.PRODUCTION if cfg['env'] == 'production'
                     else SquareEnvironment.SANDBOX),
        token=cfg['token'],
    )
    return _client


async def _resolve_location() -> str:
    """Cache the sandbox/production location ID after first successful lookup."""
    global _location_id
    if _location_id:
        return _location_id
    override = _cfg()['location']
    if override:
        _location_id = override
        return _location_id
    try:
        client = _client_singleton()
        resp = client.locations.list()
        active = [loc for loc in (resp.locations or []) if loc.status == 'ACTIVE']
        if not active:
            raise HTTPException(500, 'No active Square locations on this account.')
        _location_id = active[0].id
        logger.info(f'Square location auto-resolved: {_location_id} ({active[0].name})')
        return _location_id
    except ApiError as e:
        raise HTTPException(502, f'Could not list Square locations: {e}')


# --------------------------------------------------------------- CREATE LINK

class CreateLinkBody(BaseModel):
    order_id: str


@router.post('/create-checkout')
async def create_checkout(body: CreateLinkBody, user=Depends(get_current_user_optional)):
    """Generate a Square hosted payment link for the given order.

    The order MUST already exist in our DB with a pending payment status.
    Returns `{ url }` — frontend redirects the customer to Square.
    """
    order = await db.orders.find_one({'id': body.order_id})
    if not order:
        raise HTTPException(404, 'Order not found')
    if order.get('payment_status') == 'paid':
        raise HTTPException(409, 'Order is already paid')

    total = float(order.get('total') or 0)
    if total <= 0:
        raise HTTPException(400, 'Order total must be positive')
    amount_pence = int(round(total * 100))

    order_number = order.get('order_number') or body.order_id[:8]
    generic_name = f'GHP Order #{order_number}'

    client = _client_singleton()
    location_id = await _resolve_location()
    cfg = _cfg()
    front_base = os.environ.get('PUBLIC_FRONTEND_URL', '').rstrip('/')
    if not front_base:
        # Fall back to the request-time host from the .env — safer than hardcoding.
        front_base = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

    try:
        # `idempotency_key` per order prevents duplicate paylinks on retries.
        resp = client.checkout.payment_links.create(
            idempotency_key=f'ghp-{body.order_id}',
            order={
                'location_id': location_id,
                'line_items': [{
                    'name': generic_name,
                    'quantity': '1',
                    'base_price_money': {'amount': amount_pence, 'currency': 'GBP'},
                }],
                'metadata': {'ghp_order_id': body.order_id, 'ghp_order_number': str(order_number)},
            },
            checkout_options={
                'redirect_url': f'{front_base}/order-confirmation/{body.order_id}',
                'ask_for_shipping_address': False,
                'accepted_payment_methods': {
                    'apple_pay': True,
                    'google_pay': True,
                    'cash_app_pay': False,
                    'afterpay_clearpay': False,
                },
            },
            payment_note=generic_name,
        )
    except ApiError as e:
        logger.exception('Square create_payment_link failed')
        raise HTTPException(502, f'Square error: {e}')

    link = resp.payment_link
    now = datetime.now(timezone.utc)
    await db.orders.update_one(
        {'id': body.order_id},
        {'$set': {
            'square_payment_link_id': link.id,
            'square_order_id': link.order_id,
            'square_checkout_url': link.url,
            'square_amount_pence': amount_pence,
            'square_env': cfg['env'],
            'payment_provider': 'square',
            'payment_status': order.get('payment_status') or 'pending',
            'updated_at': now,
        }},
    )
    logger.info(f'Square paylink created for order {body.order_id}: {link.url}')
    return {'url': link.url, 'payment_link_id': link.id}


# ---------------------------------------------------------------- WEBHOOK

@router.post('/webhook')
async def webhook(request: Request):
    """Square posts here on `payment.created` / `payment.updated`.

    Deduplicate by `event_id`, verify HMAC signature, mark the linked order as
    paid on `payment.status == COMPLETED`.
    """
    cfg = _cfg()
    if not cfg['signature_key']:
        raise HTTPException(503, 'Webhooks not configured')

    raw = await request.body()
    signature = request.headers.get('x-square-hmacsha256-signature', '')
    # Try every URL/key pair — supports two subscriptions (preview + live) on
    # the same code and defends against any ingress URL rewriting.
    urls = [u.strip() for u in cfg['webhook_url'].split(',') if u.strip()] or [str(request.url)]
    urls.append(str(request.url))  # always include the raw request URL as a fallback
    keys = [k.strip() for k in cfg['signature_key'].split(',') if k.strip()]

    valid = _verify_square_signature(
        body=raw,
        header_sig=signature,
        signing_keys=keys,
        notification_urls=urls,
    )

    if not valid:
        logger.warning(f'Rejected Square webhook — bad signature. tried urls={urls}')
        raise HTTPException(401, 'Invalid signature')

    event = await request.json()
    event_id = event.get('event_id')
    event_type = event.get('type', '')
    if not event_id:
        raise HTTPException(400, 'Missing event_id')

    # Deduplicate — Square retries deliveries. Race-safe via unique index.
    try:
        await db.square_webhook_events.insert_one({
            'id': str(uuid.uuid4()),
            'event_id': event_id,
            'type': event_type,
            'received_at': datetime.now(timezone.utc),
            'payload': event,
        })
    except Exception:
        return {'ok': 'duplicate'}

    if event_type not in {'payment.created', 'payment.updated'}:
        return {'ok': 'ignored'}

    payment = (event.get('data') or {}).get('object', {}).get('payment', {})
    if payment.get('status') != 'COMPLETED':
        return {'ok': 'not_completed'}

    square_order_id = payment.get('order_id')
    payment_id = payment.get('id')
    money = payment.get('amount_money') or {}

    if not square_order_id or not payment_id:
        return {'ok': 'missing_payment_linkage'}

    now = datetime.now(timezone.utc)
    # Match by square_order_id AND expected amount to defend against replay attacks
    # against a different order.
    result = await db.orders.update_one(
        {
            'square_order_id': square_order_id,
            'payment_status': {'$ne': 'paid'},
            'square_amount_pence': money.get('amount'),
        },
        {'$set': {
            'payment_status': 'paid',
            'paid_at': payment.get('updated_at') or payment.get('created_at'),
            'square_payment_id': payment_id,
            'payment_provider': 'square',
            'updated_at': now,
        }},
    )
    if result.modified_count:
        logger.info(f'Order marked paid via Square webhook: sq_order={square_order_id} payment={payment_id}')
        # Fire the same email/comms hooks used for Wallid — reuse existing service.
        try:
            from email_service import send_order_emails
            order = await db.orders.find_one({'square_order_id': square_order_id})
            if order:
                await send_order_emails(order)
        except Exception as e:
            logger.warning(f'Email send after Square payment failed (non-fatal): {e}')
    return {'ok': 'paid' if result.modified_count else 'already_processed_or_mismatch'}


# ------------------------------------------------------------- SYNC PENDING

@router.post('/sync-pending')
async def sync_pending(_=Depends(require_admin)):
    """Admin utility — poll Square for every order that is still pending +
    has a `square_order_id`, then reconcile using the same rules the webhook
    and per-order reconciler apply.

    Returns a summary so the admin UI can toast the number of orders now paid.
    """
    pending = await db.orders.find({
        'payment_status': {'$in': ['pending', 'processing', 'failed']},
        'square_order_id': {'$exists': True, '$ne': None},
    }).to_list(500)

    client = _client_singleton()
    now = datetime.now(timezone.utc)
    checked = len(pending)
    updated = 0
    now_paid = 0
    changes: list = []

    for order in pending:
        sq_order_id = order.get('square_order_id')
        expected_pence = order.get('square_amount_pence')
        try:
            sq_order = client.orders.get(order_id=sq_order_id).order
        except ApiError as e:
            logger.warning(f'sync-pending: fetch failed for {sq_order_id}: {e}')
            continue

        tenders = sq_order.tenders or []
        if not tenders or not tenders[0].payment_id:
            continue
        payment_id = tenders[0].payment_id
        try:
            payment = client.payments.get(payment_id=payment_id).payment
        except ApiError as e:
            logger.warning(f'sync-pending: payment fetch failed {payment_id}: {e}')
            continue

        if payment.status != 'COMPLETED':
            continue
        if expected_pence and payment.amount_money.amount != expected_pence:
            logger.warning(
                f'sync-pending: amount mismatch on {order.get("order_number")}: '
                f'expected {expected_pence}, Square says {payment.amount_money.amount}'
            )
            continue

        r = await db.orders.update_one(
            {'id': order['id'], 'payment_status': {'$ne': 'paid'}},
            {'$set': {
                'payment_status': 'paid',
                'paid_at': now.isoformat(),
                'square_payment_id': payment_id,
                'payment_provider': 'square',
                'updated_at': now,
                'reconciled_via': 'admin-sync',
            }},
        )
        if r.modified_count:
            updated += 1
            now_paid += 1
            changes.append({
                'order_number': order.get('order_number'),
                'from': order.get('payment_status'),
                'to': 'paid',
            })
            try:
                from email_service import send_order_emails
                fresh = await db.orders.find_one({'id': order['id']})
                if fresh:
                    await send_order_emails(fresh)
            except Exception as e:
                logger.warning(f'sync-pending: email send failed for {order.get("order_number")} (non-fatal): {e}')

    return {
        'checked': checked,
        'updated': updated,
        'now_paid': now_paid,
        'changes': changes,
    }


# ------------------------------------------------------------- CONFIG PROBE

@router.get('/config')
async def public_config():
    """Frontend calls this to know whether the Pay-by-Card button should appear."""
    cfg = _cfg()
    configured = bool(cfg['token'] and cfg['signature_key'])
    return {'configured': configured, 'env': cfg['env']}


# ------------------------------------------------------------- RECONCILE

class ReconcileBody(BaseModel):
    order_id: str


@router.post('/reconcile')
async def reconcile(body: ReconcileBody):
    """Safety-net poller — called by the order-confirmation page on load if the
    order still looks unpaid. Fetches the Square order + payment directly and
    marks the local order paid if Square confirms COMPLETED. Idempotent."""
    order = await db.orders.find_one({'id': body.order_id})
    if not order:
        raise HTTPException(404, 'Order not found')
    if order.get('payment_status') == 'paid':
        return {'status': 'paid', 'source': 'already-paid'}
    sq_order_id = order.get('square_order_id')
    if not sq_order_id:
        # No Square link on this order — nothing to reconcile against.
        return {'status': order.get('payment_status') or 'pending', 'source': 'no-square-link'}

    try:
        client = _client_singleton()
        sq_order = client.orders.get(order_id=sq_order_id).order
    except ApiError as e:
        logger.warning(f'reconcile: could not fetch Square order {sq_order_id}: {e}')
        return {'status': 'pending', 'source': 'square-fetch-failed'}

    # tender[0].payment_id is populated once Square has authorised the card.
    tenders = sq_order.tenders or []
    if not tenders or not tenders[0].payment_id:
        return {'status': 'pending', 'source': 'no-tender-yet'}

    payment_id = tenders[0].payment_id
    try:
        payment = client.payments.get(payment_id=payment_id).payment
    except ApiError as e:
        logger.warning(f'reconcile: could not fetch payment {payment_id}: {e}')
        return {'status': 'pending', 'source': 'payment-fetch-failed'}

    if payment.status != 'COMPLETED':
        return {'status': 'pending', 'source': f'square-status={payment.status}'}

    # Amount tamper check — same rule as the webhook path.
    expected_pence = order.get('square_amount_pence')
    if expected_pence and payment.amount_money.amount != expected_pence:
        logger.warning(
            f'reconcile: amount mismatch — expected {expected_pence}, '
            f'Square says {payment.amount_money.amount} for order {body.order_id}'
        )
        return {'status': 'pending', 'source': 'amount-mismatch'}

    now = datetime.now(timezone.utc)
    r = await db.orders.update_one(
        {'id': body.order_id, 'payment_status': {'$ne': 'paid'}},
        {'$set': {
            'payment_status': 'paid',
            'paid_at': now.isoformat(),
            'square_payment_id': payment_id,
            'payment_provider': 'square',
            'updated_at': now,
            'reconciled_via': 'poll',
        }},
    )
    if r.modified_count:
        logger.info(f'reconcile: order {body.order_id} marked paid via poll (payment {payment_id})')
        try:
            from email_service import send_order_emails
            fresh = await db.orders.find_one({'id': body.order_id})
            if fresh:
                await send_order_emails(fresh)
        except Exception as e:
            logger.warning(f'reconcile: post-payment email failed (non-fatal): {e}')
    return {'status': 'paid', 'source': 'poll-reconciled', 'payment_id': payment_id}
