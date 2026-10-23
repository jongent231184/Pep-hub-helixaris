# Manual "Pay by bank transfer" feature: settings, choose bank-transfer, invoice PDF, admin mark-paid + stock
import os
import re
import zlib
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL') or open('/app/frontend/.env').read().split('REACT_APP_BACKEND_URL=')[1].split()[0]
BASE_URL = BASE_URL.rstrip('/')
API = f"{BASE_URL}/api"
ADMIN = {'email': 'admin@ghp-health.com', 'password': 'GHP-Health26'}
BANK = {'bank_account_name': 'GHP Health LTD', 'bank_sort_code': '12-34-56', 'bank_account_number': '12345678'}
PRODUCT_SLUG = 'ahkcu-100mg'


def pdf_text(content: bytes) -> str:
    out = [content.decode('latin-1', 'ignore')]
    for m in re.finditer(rb'stream\r?\n(.*?)\r?\n?endstream', content, re.S):
        raw = m.group(1)
        try:
            out.append(zlib.decompress(raw).decode('latin-1', 'ignore'))
        except Exception:
            try:
                import base64
                out.append(zlib.decompress(base64.a85decode(raw.strip(), adobe=True)).decode('latin-1', 'ignore'))
            except Exception:
                pass
    return '\n'.join(out)


@pytest.fixture(scope='module')
def admin():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=ADMIN)
    if r.status_code != 200:
        pytest.skip(f"admin login failed {r.status_code}")
    tok = r.json().get('access_token') or r.json().get('token')
    s.headers['Authorization'] = f"Bearer {tok}"
    return s


@pytest.fixture(scope='module')
def mongo():
    from dotenv import load_dotenv
    load_dotenv('/app/backend/.env')
    c = MongoClient(os.environ['MONGO_URL'])
    return c[os.environ['DB_NAME']]


@pytest.fixture(scope='module')
def product():
    r = requests.get(f"{API}/products/{PRODUCT_SLUG}")
    if r.status_code != 200:
        prods = requests.get(f"{API}/products").json()
        prods = prods if isinstance(prods, list) else prods.get('items', [])
        return next(p for p in prods if p['slug'] == PRODUCT_SLUG)
    return r.json()


def _create_order(product, email='banktest+1@example.com', qty=1):
    payload = {
        'items': [{'product_id': product['id'], 'slug': product['slug'], 'name': product['name'], 'qty': qty, 'price': product['price']}],
        'shipping_address': {'first_name': 'TEST', 'last_name': 'Bank', 'email': email, 'phone': '07000000000',
                             'address1': '1 Test St', 'city': 'London', 'postcode': 'E1 1AA'},
        'subtotal': product['price'] * qty, 'shipping': 4.99, 'total': product['price'] * qty + 4.99,
    }
    r = requests.post(f"{API}/orders", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope='module')
def created_orders(admin):
    ids = []
    yield ids
    for oid in ids:
        admin.delete(f"{API}/orders/{oid}")


class TestSettings:
    def test_public_settings_expose_bank(self):
        d = requests.get(f"{API}/settings").json()
        for k, v in BANK.items():
            assert d.get(k) == v, f"{k}={d.get(k)}"
        assert 'site_password' not in d

    def test_admin_save_persists(self, admin):
        cur = admin.get(f"{API}/settings/admin").json()
        cur.update(BANK)
        r = admin.put(f"{API}/settings", json=cur)
        assert r.status_code == 200
        assert r.json()['bank_account_number'] == '12345678'


class TestBankTransferFlow:
    def test_full_flow(self, admin, mongo, product, created_orders):
        stock_before = mongo.products.find_one({'id': product['id']})['stock']
        order = _create_order(product, 'banktest+10@example.com', qty=1)
        created_orders.append(order['id'])
        try:
            # choose bank transfer
            r = requests.post(f"{API}/orders/{order['id']}/bank-transfer")
            assert r.status_code == 200, r.text
            d = r.json()
            assert d['payment_provider'] == 'bank_transfer'
            assert d['payment_status'] == 'pending'
            # GET persists
            g = requests.get(f"{API}/orders/{order['id']}").json()
            assert g['payment_provider'] == 'bank_transfer' and g['payment_status'] == 'pending'
            # stock not held
            assert mongo.products.find_one({'id': product['id']})['stock'] == stock_before

            # invoice PDF unpaid -> bank block
            p = requests.get(f"{API}/orders/{order['id']}/invoice.pdf")
            assert p.status_code == 200
            assert p.headers['content-type'].startswith('application/pdf')
            assert p.content[:4] == b'%PDF'
            txt = pdf_text(p.content)
            assert 'PAY BY BANK TRANSFER' in txt
            assert '12345678' in txt and '12-34-56' in txt and 'GHP Health LTD' in txt
            assert order['order_number'] in txt

            # admin list badge data
            lst = admin.get(f"{API}/orders/all").json()
            mine = next(o for o in lst if o['id'] == order['id'])
            assert mine['payment_provider'] == 'bank_transfer'

            # admin marks paid
            r = admin.patch(f"{API}/orders/{order['id']}", json={'payment_status': 'paid'})
            assert r.status_code == 200, r.text
            d = r.json()
            assert d['payment_status'] == 'paid'
            assert d['status'] == 'processing'
            assert d.get('payment_source') == 'manual'
            assert d['payment_provider'] == 'bank_transfer'
            s1 = mongo.products.find_one({'id': product['id']})['stock']
            assert s1 == max(0, stock_before - 1)

            # repeat PATCH must not decrement again
            r = admin.patch(f"{API}/orders/{order['id']}", json={'payment_status': 'paid'})
            assert r.status_code == 200
            assert mongo.products.find_one({'id': product['id']})['stock'] == s1

            # paid invoice: no bank block
            p = requests.get(f"{API}/orders/{order['id']}/invoice.pdf")
            assert p.status_code == 200
            assert 'PAY BY BANK TRANSFER' not in pdf_text(p.content)

            # bank-transfer on paid order -> 400
            r = requests.post(f"{API}/orders/{order['id']}/bank-transfer")
            assert r.status_code == 400
        finally:
            mongo.products.update_one({'id': product['id']}, {'$set': {'stock': stock_before}})

    def test_404_unknown_order(self):
        r = requests.post(f"{API}/orders/does-not-exist/bank-transfer")
        assert r.status_code == 404

    def test_mark_paid_with_status_in_same_patch(self, admin, mongo, product, created_orders):
        """UI may send status + payment_status together"""
        stock_before = mongo.products.find_one({'id': product['id']})['stock']
        order = _create_order(product, 'banktest+11@example.com')
        created_orders.append(order['id'])
        try:
            requests.post(f"{API}/orders/{order['id']}/bank-transfer")
            r = admin.patch(f"{API}/orders/{order['id']}", json={'payment_status': 'paid', 'status': 'pending'})
            assert r.status_code == 200
            d = r.json()
            assert d['payment_status'] == 'paid'
            # Admin UI (AdminOrderDetail.save) always sends status too; mark-paid should still move to processing
            assert d['status'] == 'processing', f"status stayed {d['status']} after admin UI-style mark-paid"
        finally:
            mongo.products.update_one({'id': product['id']}, {'$set': {'stock': stock_before}})


class TestBankDisabled:
    def test_blank_account_number_returns_400(self, admin, product, created_orders):
        cur = admin.get(f"{API}/settings/admin").json()
        order = _create_order(product, 'banktest+12@example.com')
        created_orders.append(order['id'])
        try:
            blank = dict(cur, bank_account_number='')
            assert admin.put(f"{API}/settings", json=blank).status_code == 200
            assert requests.get(f"{API}/settings").json()['bank_account_number'] == ''
            r = requests.post(f"{API}/orders/{order['id']}/bank-transfer")
            assert r.status_code == 400
            # PDF has no bank block
            p = requests.get(f"{API}/orders/{order['id']}/invoice.pdf")
            assert 'PAY BY BANK TRANSFER' not in pdf_text(p.content)
        finally:
            restore = dict(cur, **BANK)
            assert admin.put(f"{API}/settings", json=restore).status_code == 200
        assert requests.get(f"{API}/settings").json()['bank_account_number'] == '12345678'
