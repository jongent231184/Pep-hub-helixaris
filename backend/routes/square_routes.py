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

from auth import get_current_user_optional
from db import db

logger = logging.getLogger('ghp.square')
router = APIRouter(prefix='/square', tags=['square'])


def _verify_square_signature(*, body: bytes, header_sig: str, signing_key: str, notification_url: str) -> bool:
    """Square's webhook signature is HMAC-SHA256 of (URL + raw body), base64.

    See https://developer.squareup.com/docs/webhooks/step3validate — we do the
    HMAC ourselves so we don't depend on the SDK helper module path (which has
    moved between SDK versions).
    """
    if not header_sig or not signing_key or not notification_url:
        return False
    payload = (notification_url + body.decode('utf-8')).encode('utf-8')
    digest = hmac.new(signing_key.encode('utf-8'), payload, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode('utf-8')
    return hmac.compare_digest(expected, header_sig)

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
    # The exact notification URL registered in Square — must match byte-for-byte.
    notification_url = cfg['webhook_url'] or str(request.url)

    valid = _verify_square_signature(
        body=raw,
        header_sig=signature,
        signing_key=cfg['signature_key'],
        notification_url=notification_url,
    )

    if not valid:
        logger.warning(f'Rejected Square webhook — bad signature. url={notification_url}')
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


# ------------------------------------------------------------- CONFIG PROBE

@router.get('/config')
async def public_config():
    """Frontend calls this to know whether the Pay-by-Card button should appear."""
    cfg = _cfg()
    configured = bool(cfg['token'] and cfg['signature_key'])
    return {'configured': configured, 'env': cfg['env']}
