"""Xoala sandbox host-gating: card payments only on preview/localhost when SANDBOX creds are in use."""
import os
import pytest
import requests
from dotenv import load_dotenv

load_dotenv('/app/frontend/.env')
PREVIEW = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
LOCAL = 'http://localhost:8001'
ADMIN = {'email': 'admin@ghp-health.com', 'password': 'GHP-Health26'}


# --- config gating by Host / X-Forwarded-Host
@pytest.mark.parametrize('headers', [
    {'Host': 'www.ghp-health.com'},
    {'Host': 'helixaris.com'},
    {'Host': 'ghp-health.com'},
    {'Host': 'localhost', 'X-Forwarded-Host': 'www.ghp-health.com'},
])
def test_config_disabled_on_live_hosts(headers):
    r = requests.get(f'{LOCAL}/api/xoala/config', headers=headers)
    assert r.status_code == 200
    d = r.json()
    assert d['configured'] is False and d['sandbox'] is True


def test_config_enabled_on_preview():
    d = requests.get(f'{PREVIEW}/api/xoala/config').json()
    assert d['configured'] is True and d['sandbox'] is True


# --- create-payment gating
def test_create_payment_503_on_live_host():
    r = requests.post(f'{LOCAL}/api/xoala/create-payment', json={'order_id': 'anything'}, headers={'Host': 'www.ghp-health.com'})
    assert r.status_code == 503
    assert 'Card payments are not available yet' in r.text


# --- spoofing probes (informational security checks)
@pytest.mark.parametrize('hdr', [
    {'X-Forwarded-Host': 'x.preview.emergentagent.com'},
    {'X-Forwarded-Host': 'localhost.evil.com'},
])
def test_spoofed_forwarded_host_from_live(hdr):
    h = {'Host': 'www.ghp-health.com', **hdr}
    d = requests.get(f'{LOCAL}/api/xoala/config', headers=h).json()
    print('spoof', hdr, '->', d)
    assert d['configured'] is False, f'Spoofed X-Forwarded-Host re-enables sandbox: {hdr}'


@pytest.fixture
def admin_token():
    r = requests.post(f'{PREVIEW}/api/auth/login', json=ADMIN)
    if r.status_code != 200:
        pytest.skip('admin login failed')
    return r.json()['access_token']


def test_create_payment_on_preview_with_real_order(admin_token):
    prods = requests.get(f'{PREVIEW}/api/products').json()
    prods = prods.get('products', prods) if isinstance(prods, dict) else prods
    p = next(x for x in prods if int(x.get('stock', 0) or 0) > 0)
    order_payload = {
        'items': [{'product_id': p['id'], 'slug': p['slug'], 'name': p['name'], 'image': (p.get('images') or [p.get('image', '')])[0] if p.get('images') else p.get('image', ''), 'qty': 1, 'price': p['price']}],
        'shipping_address': {'first_name': 'TEST_X', 'last_name': 'Gate', 'email': 'delivered@resend.dev', 'phone': '07000000000',
                             'address1': '1 Test St', 'city': 'London', 'postcode': 'SW1A 1AA', 'country': 'GB'},
        'subtotal': p['price'], 'shipping': 0, 'total': p['price'],
    }
    r = requests.post(f'{PREVIEW}/api/orders', json=order_payload)
    assert r.status_code in (200, 201), r.text
    order = r.json()
    oid = order.get('id') or order.get('order', {}).get('id')
    try:
        r2 = requests.post(f'{PREVIEW}/api/xoala/create-payment', json={'order_id': oid})
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d['action'].endswith('/transaction/Checkout') and 'sandbox' in d['action']
        assert d['fields']['checksum'] and d['fields']['merchantRedirectUrl'].endswith('/api/xoala/return')
        # same order via live host -> 503
        r3 = requests.post(f'{LOCAL}/api/xoala/create-payment', json={'order_id': oid}, headers={'Host': 'www.ghp-health.com'})
        assert r3.status_code == 503
    finally:
        h = {'Authorization': f'Bearer {admin_token}'}
        rd = requests.delete(f'{PREVIEW}/api/orders/{oid}', headers=h)
        if rd.status_code == 404 or rd.status_code == 405:
            rd = requests.delete(f'{PREVIEW}/api/admin/orders/{oid}', headers=h)
        print('delete', rd.status_code, rd.text[:200])
        rr = requests.post(f'{PREVIEW}/api/orders/reset-counter', json={'next_seq': 44}, headers=h)
        print('reset', rr.status_code, rr.text[:200])
