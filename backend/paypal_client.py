"""PayPal REST API client (Smart Buttons - order create/capture)."""
import os
import base64
import httpx
from fastapi import HTTPException

PAYPAL_CLIENT_ID = os.environ.get('PAYPAL_CLIENT_ID', '')
PAYPAL_CLIENT_SECRET = os.environ.get('PAYPAL_CLIENT_SECRET', '')
PAYPAL_API_BASE = os.environ.get('PAYPAL_API_BASE', 'https://api-m.sandbox.paypal.com')


async def get_access_token() -> str:
    if not PAYPAL_CLIENT_ID or not PAYPAL_CLIENT_SECRET:
        raise HTTPException(503, 'PayPal credentials not configured on server. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in backend/.env')
    auth = base64.b64encode(f'{PAYPAL_CLIENT_ID}:{PAYPAL_CLIENT_SECRET}'.encode()).decode()
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f'{PAYPAL_API_BASE}/v1/oauth2/token',
            headers={'Authorization': f'Basic {auth}', 'Content-Type': 'application/x-www-form-urlencoded'},
            data={'grant_type': 'client_credentials'}
        )
    if r.status_code != 200:
        raise HTTPException(502, f'PayPal auth failed: {r.text}')
    return r.json()['access_token']


async def create_paypal_order(amount: float, currency: str = 'GBP', reference_id: str = '') -> dict:
    token = await get_access_token()
    payload = {
        'intent': 'CAPTURE',
        'purchase_units': [{
            'reference_id': reference_id or 'default',
            'amount': {'currency_code': currency, 'value': f'{amount:.2f}'}
        }]
    }
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f'{PAYPAL_API_BASE}/v2/checkout/orders',
            headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
            json=payload
        )
    if r.status_code not in (200, 201):
        raise HTTPException(502, f'PayPal create order failed: {r.text}')
    return r.json()


async def capture_paypal_order(order_id: str) -> dict:
    token = await get_access_token()
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f'{PAYPAL_API_BASE}/v2/checkout/orders/{order_id}/capture',
            headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
        )
    if r.status_code not in (200, 201):
        raise HTTPException(502, f'PayPal capture failed: {r.text}')
    return r.json()
