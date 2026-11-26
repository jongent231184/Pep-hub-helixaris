"""Ambassador pay links: POST /api/ambassadors/paylink, GET /api/ambassadors/paylinks,
admin regression GET /api/orders/paylinks, public /api/orders/pay/{id}."""
import os
from pathlib import Path
import pytest
import requests


def _env():
    for line in Path('/app/frontend/.env').read_text().splitlines():
        if line.startswith('REACT_APP_BACKEND_URL='):
            return line.split('=', 1)[1].strip()


BASE_URL = (os.environ.get('REACT_APP_BACKEND_URL') or _env()).rstrip('/')
API = f"{BASE_URL}/api"
CREATED = []


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={'email': email, 'password': pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code}")
    return {'Authorization': f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope='module')
def amb():
    return _login('amb.test@ghp-health.com', 'Ambassador26!')


@pytest.fixture(scope='module')
def admin():
    return _login('admin@ghp-health.com', 'GHP-Health26')


@pytest.fixture(scope='module')
def product():
    r = requests.get(f"{API}/products")
    assert r.status_code == 200
    data = r.json()
    items = data if isinstance(data, list) else data.get('items', data.get('products', []))
    p = next(x for x in items if float(x.get('price') or 0) > 0)
    return p


@pytest.fixture(scope='module', autouse=True)
def cleanup(admin):
    yield
    for oid in CREATED:
        requests.delete(f"{API}/orders/{oid}", headers=admin)


# Create: promo forced to AMYTEST, 10% discount
def test_create_forces_code_and_discount(amb, product):
    r = requests.post(f"{API}/ambassadors/paylink", headers=amb, json={
        'items': [{'product_id': product['id'], 'qty': 2}],
        'promo_code': 'SOMETHINGELSE', 'shipping': 0, 'customer_name': 'TEST_ Buyer'})
    assert r.status_code == 200, r.text
    o = r.json()
    CREATED.append(o['id'])
    assert o['promo_code'] == 'AMYTEST'
    assert o['source'] == 'paylink'
    exp_sub = round(float(product['price']) * 2, 2)
    assert o['subtotal'] == pytest.approx(exp_sub)
    assert o['discount'] == pytest.approx(round(exp_sub * 0.10, 2))
    assert o['total'] == pytest.approx(round(exp_sub - o['discount'] + o['shipping'], 2))
    # public GET
    g = requests.get(f"{API}/orders/pay/{o['id']}")
    assert g.status_code == 200 and g.json()['total'] == o['total']


# Custom line rejected
def test_custom_line_rejected(amb):
    r = requests.post(f"{API}/ambassadors/paylink", headers=amb, json={
        'items': [{'product_id': None, 'name': 'TEST_custom', 'price': 1, 'qty': 1}]})
    assert r.status_code == 400
    assert 'Only catalogue products' in r.text


def test_no_token_401(product):
    r = requests.post(f"{API}/ambassadors/paylink", json={'items': [{'product_id': product['id'], 'qty': 1}]})
    assert r.status_code == 401


def test_admin_token_cannot_use_ambassador_endpoint(admin, product):
    r = requests.post(f"{API}/ambassadors/paylink", headers=admin, json={'items': [{'product_id': product['id'], 'qty': 1}]})
    print('admin->ambassador paylink', r.status_code)
    if r.status_code == 200:
        CREATED.append(r.json()['id'])
    assert r.status_code in (401, 403)


# Edge: empty items / zero qty / negative qty
@pytest.mark.parametrize('items', [[], 'zero', 'neg'])
def test_invalid_items(amb, product, items):
    if items == 'zero':
        items = [{'product_id': product['id'], 'qty': 0}]
    elif items == 'neg':
        items = [{'product_id': product['id'], 'qty': -3}]
    r = requests.post(f"{API}/ambassadors/paylink", headers=amb, json={'items': items})
    if r.status_code == 200:
        CREATED.append(r.json()['id'])
        print('ACCEPTED invalid items', items, r.json().get('total'))
    assert r.status_code in (400, 422)


def test_list_only_own(amb, admin):
    r = requests.get(f"{API}/ambassadors/paylinks", headers=amb)
    assert r.status_code == 200
    links = r.json()
    nums = [l['order_number'] for l in links]
    assert 'GHP-069' in nums
    for oid in CREATED:
        assert oid in [l['id'] for l in links]
    assert all(l.get('promo_code') == 'AMYTEST' for l in links)
    assert all(l.get('source') == 'paylink' for l in links)
    assert all('_id' not in l for l in links)
    # admin list includes ambassador links
    a = requests.get(f"{API}/orders/paylinks", headers=admin)
    assert a.status_code == 200
    ids = [x['id'] for x in a.json()]
    for l in links:
        assert l['id'] in ids
    # count admin-created links not in ambassador list
    assert len(a.json()) >= len(links)


def test_list_no_token():
    assert requests.get(f"{API}/ambassadors/paylinks").status_code == 401
