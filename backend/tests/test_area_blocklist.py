# Area blocklist (country / postcode prefix) — admin CRUD + checkout & paylink enforcement
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')
API = f"{BASE_URL}/api"
AREA_MSG = "we don't currently ship to this area"


@pytest.fixture(scope='module')
def admin():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "admin@ghp-health.com", "password": "GHP-Health26"})
    if r.status_code != 200:
        pytest.skip('admin login failed')
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s


@pytest.fixture(scope='module')
def created():
    ids = {'blocks': [], 'orders': []}
    yield ids


@pytest.fixture(scope='module', autouse=True)
def cleanup(admin, created):
    yield
    for bid in created['blocks']:
        admin.delete(f"{API}/admin/blocklist/{bid}")
    for oid in created['orders']:
        admin.delete(f"{API}/orders/{oid}")


@pytest.fixture(scope='module')
def product():
    r = requests.get(f"{API}/products?limit=5")
    p = [x for x in r.json() if x.get('id')][0]
    return p


def _order(product, postcode, country, email='TEST_area@example.com'):
    return {
        "items": [{"product_id": product['id'], "name": product['name'], "slug": product['slug'],
                   "price": product['price'], "qty": 1}],
        "shipping_address": {"first_name": "TEST_Area", "last_name": "Tester", "email": email,
                             "phone": "07000000000", "address1": "1 Test St", "city": "Testtown",
                             "postcode": postcode, "country": country},
        "subtotal": product['price'], "shipping": 4.99, "total": product['price'] + 4.99,
    }


# --- Admin API ---
class TestAdminAreaApi:
    def test_area_without_criteria_400(self, admin):
        r = admin.post(f"{API}/admin/blocklist", json={"kind": "area", "reason": "TEST_"})
        assert r.status_code == 400
        assert 'prefix' in r.json()['detail'].lower()

    def test_area_prefix_uppercased(self, admin, created):
        r = admin.post(f"{API}/admin/blocklist", json={"kind": "area", "postcode_prefix": " im ", "reason": "TEST_area"})
        assert r.status_code == 200, r.text
        d = r.json()
        created['blocks'].append(d['id'])
        assert d['postcode_prefix'] == 'IM'
        assert d['kind'] == 'area'

    def test_list_includes_area_fields(self, admin):
        r = admin.get(f"{API}/admin/blocklist")
        assert r.status_code == 200
        rows = r.json()
        for row in rows:
            assert 'kind' in row and 'country' in row and 'postcode_prefix' in row
            assert '_id' not in row
        areas = [x for x in rows if x.get('kind') == 'area']
        assert any((x.get('country') or '').lower() == 'ireland' for x in areas)
        assert any(x.get('postcode_prefix') == 'BT' for x in areas)

    def test_customer_block_still_works(self, admin, created):
        r = admin.post(f"{API}/admin/blocklist", json={"first_name": "TEST_Bad", "last_name": "Actor",
                                                       "email": "test_badactor_area@example.com", "reason": "TEST_"})
        assert r.status_code == 200, r.text
        d = r.json()
        created['blocks'].append(d['id'])
        assert d['kind'] == 'customer'
        assert d['email'] == 'test_badactor_area@example.com'
        ids = [x['id'] for x in admin.get(f"{API}/admin/blocklist").json()]
        assert d['id'] in ids

    def test_delete_area_entry(self, admin):
        r = admin.post(f"{API}/admin/blocklist", json={"kind": "area", "postcode_prefix": "ZZ", "reason": "TEST_del"})
        bid = r.json()['id']
        assert admin.delete(f"{API}/admin/blocklist/{bid}").status_code == 200
        ids = [x['id'] for x in admin.get(f"{API}/admin/blocklist").json()]
        assert bid not in ids
        assert admin.delete(f"{API}/admin/blocklist/{bid}").status_code == 404

    def test_requires_admin(self):
        assert requests.get(f"{API}/admin/blocklist").status_code in (401, 403)


# --- Checkout enforcement ---
class TestCheckoutAreaBlock:
    def test_bt_postcode_blocked(self, product):
        r = requests.post(f"{API}/orders", json=_order(product, 'BT1 1AA', 'United Kingdom'))
        assert r.status_code == 403
        assert AREA_MSG in r.json()['detail']

    def test_bt_lowercase_nospace_blocked(self, product):
        r = requests.post(f"{API}/orders", json=_order(product, 'bt11aa', 'United Kingdom'))
        assert r.status_code == 403

    def test_ireland_country_blocked(self, product):
        r = requests.post(f"{API}/orders", json=_order(product, 'D02 X285', 'Ireland'))
        assert r.status_code == 403
        assert AREA_MSG in r.json()['detail']

    def test_customer_block_message_differs(self, product, admin, created):
        r = requests.post(f"{API}/orders", json=_order(product, 'SW1A 1AA', 'United Kingdom',
                                                         email='test_badactor_area@example.com'))
        assert r.status_code == 403
        assert AREA_MSG not in r.json()['detail']

    def test_billing_in_blocked_area(self, product):
        body = _order(product, 'SW1A 1AA', 'United Kingdom')
        body['billing_address'] = dict(body['shipping_address'], postcode='BT9 5AB')
        r = requests.post(f"{API}/orders", json=body)
        assert r.status_code == 403

    def test_uk_sw1a_allowed(self, product, created):
        r = requests.post(f"{API}/orders", json=_order(product, 'SW1A 1AA', 'United Kingdom'))
        assert r.status_code == 200, r.text
        created['orders'].append(r.json()['id'])
        assert r.json()['order_number'].startswith('GHP-')
