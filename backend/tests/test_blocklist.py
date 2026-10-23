"""Backend tests for admin customer blocklist + checkout/paylink enforcement."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://dual-brand-store.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

ADMIN_EMAIL = 'admin@ghp-health.com'
ADMIN_PASS = 'GHP-Health26'


# ------- fixtures -------
@pytest.fixture(scope='module')
def admin_token():
    r = requests.post(f"{API}/auth/login", json={'email': ADMIN_EMAIL, 'password': ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()['access_token']


@pytest.fixture(scope='module')
def admin_headers(admin_token):
    return {'Authorization': f'Bearer {admin_token}'}


@pytest.fixture(scope='module')
def sample_item():
    r = requests.get(f"{API}/products", timeout=30)
    assert r.status_code == 200, r.text
    prods = [p for p in r.json() if p.get('price')]
    assert prods, 'no products'
    p = prods[0]
    return {
        'product_id': p['id'],
        'slug': p.get('slug') or p['id'],
        'name': p['name'],
        'image': (p.get('images') or [''])[0] or '',
        'qty': 1,
        'price': float(p['price']),
    }


@pytest.fixture(scope='module')
def created_state():
    """Shared mutable state across tests — list of ids to clean up at the end."""
    return {'block_ids': [], 'order_ids': [], 'baseline_seq': None}


def _ship(**overrides):
    base = {
        'first_name': 'Clean',
        'last_name': 'Buyer',
        'email': 'clean@example.com',
        'phone': '07000000000',
        'address1': '1 Clean Street',
        'address2': '',
        'city': 'London',
        'postcode': 'E1 6AN',
        'country': 'United Kingdom',
    }
    base.update(overrides)
    return base


# ------- baseline (so we can reset counter at the end) -------
def test_capture_baseline_seq(admin_headers, created_state):
    r = requests.get(f"{API}/orders/all", headers=admin_headers, timeout=30)
    assert r.status_code == 200, r.text
    nums = []
    for o in r.json():
        n = (o.get('order_number') or '')
        if n.startswith('GHP-'):
            try:
                nums.append(int(n.split('-')[1]))
            except Exception:
                pass
    created_state['baseline_seq'] = max(nums) if nums else 0
    print('baseline max seq =', created_state['baseline_seq'])
    # Pre-align the counter so order creation won't hit duplicate key errors
    requests.post(f"{API}/orders/reset-counter",
                  json={'next_seq': created_state['baseline_seq'] + 1},
                  headers=admin_headers, timeout=30)


# ------- blocklist CRUD + validation -------
def test_blocklist_requires_auth():
    r = requests.get(f"{API}/admin/blocklist", timeout=30)
    assert r.status_code in (401, 403), r.status_code


def test_create_block_valid(admin_headers, created_state):
    payload = {
        'first_name': 'Test',
        'last_name': 'Fraudster',
        'email': 'fraud+test@example.com',
        'address1': '12 High Street',
        'postcode': 'SW1A 1AA',
        'reason': 'automated test',
    }
    r = requests.post(f"{API}/admin/blocklist", json=payload, headers=admin_headers, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data['id'] and data['hits'] == 0
    assert data['email'] == payload['email']
    created_state['block_ids'].append(data['id'])
    created_state['main_block_id'] = data['id']


def test_create_block_postcode_only_rejected(admin_headers):
    r = requests.post(f"{API}/admin/blocklist", json={'postcode': 'SW1A 1AA'}, headers=admin_headers, timeout=30)
    assert r.status_code == 400, r.text


def test_create_block_all_empty_rejected(admin_headers):
    r = requests.post(f"{API}/admin/blocklist", json={}, headers=admin_headers, timeout=30)
    assert r.status_code == 400, r.text


def test_list_blocklist(admin_headers, created_state):
    r = requests.get(f"{API}/admin/blocklist", headers=admin_headers, timeout=30)
    assert r.status_code == 200, r.text
    ids = [e['id'] for e in r.json()]
    assert created_state['main_block_id'] in ids


# ------- enforcement on POST /api/orders -------
def _order_payload(ship, item, billing=None):
    sub = item['price'] * item['qty']
    body = {
        'items': [item],
        'shipping_address': ship,
        'subtotal': sub,
        'shipping': 0,
        'total': sub,
    }
    if billing:
        body['billing_address'] = billing
    return body


def test_order_blocked_by_email_case_insensitive(sample_item, created_state):
    ship = _ship(email='FRAUD+TEST@Example.com', first_name='Alice', last_name='Clean', address1='99 Nowhere', postcode='AB1 2CD')
    r = requests.post(f"{API}/orders", json=_order_payload(ship, sample_item), timeout=30)
    assert r.status_code == 403, r.text
    assert 'unable to accept' in r.json().get('detail', '').lower()


def test_order_blocked_by_postcode_plus_address(sample_item):
    ship = _ship(
        first_name='Someone', last_name='Else',
        email='someone@else.com',
        address1='12, high street', postcode='sw1a1aa',
    )
    r = requests.post(f"{API}/orders", json=_order_payload(ship, sample_item), timeout=30)
    assert r.status_code == 403, r.text


def test_order_blocked_by_billing_match(sample_item):
    clean_ship = _ship(email='totally@clean.com', first_name='Clean', last_name='Guy', address1='1 Clean St', postcode='E1 6AN')
    billing = _ship(first_name='Test', last_name='Fraudster', email='other@mail.com', address1='Some Other Rd', postcode='SW1A 1AA')
    r = requests.post(f"{API}/orders", json=_order_payload(clean_ship, sample_item, billing=billing), timeout=30)
    assert r.status_code == 403, r.text


def test_order_neighbour_allowed(sample_item, created_state):
    ship = _ship(
        first_name='Nicely', last_name='Neighbour',
        email='nice.neighbour@example.com',
        address1='14 High Street', postcode='SW1A 1AA',
    )
    r = requests.post(f"{API}/orders", json=_order_payload(ship, sample_item), timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    created_state['order_ids'].append(data['id'])
    created_state['neighbour_order_id'] = data['id']
    created_state['neighbour_order_number'] = data['order_number']


def test_hits_incremented_on_blocked_entry(admin_headers, created_state):
    r = requests.get(f"{API}/admin/blocklist", headers=admin_headers, timeout=30)
    entry = next(e for e in r.json() if e['id'] == created_state['main_block_id'])
    assert entry['hits'] >= 3, f"expected >=3 hits, got {entry['hits']}"
    assert entry.get('last_hit_at')
    assert entry.get('last_hit_details')


# ------- from-order + matching-orders -------
def test_create_block_from_order(admin_headers, created_state, sample_item):
    # create a fresh clean order to ban
    ship = _ship(
        first_name='Victor', last_name='Target',
        email='victor.target@example.com',
        address1='500 Target Road', postcode='TA1 2GT',
    )
    r = requests.post(f"{API}/orders", json=_order_payload(ship, sample_item), timeout=30)
    assert r.status_code == 200, r.text
    order = r.json()
    created_state['order_ids'].append(order['id'])

    r2 = requests.post(f"{API}/admin/blocklist/from-order/{order['id']}",
                       json={'reason': 'from-order test'}, headers=admin_headers, timeout=30)
    assert r2.status_code == 200, r2.text
    entry = r2.json()
    assert entry['email'] == ship['email']
    assert entry['source_order_number'] == order['order_number']
    created_state['block_ids'].append(entry['id'])

    r3 = requests.get(f"{API}/admin/blocklist/matching-orders", headers=admin_headers, timeout=30)
    assert r3.status_code == 200, r3.text
    assert order['id'] in r3.json()['order_ids']


def test_delete_block_unknown(admin_headers):
    r = requests.delete(f"{API}/admin/blocklist/does-not-exist", headers=admin_headers, timeout=30)
    assert r.status_code == 404


# ------- paylink flow -------
def test_paylink_flow(admin_headers, sample_item, created_state):
    r = requests.post(f"{API}/orders/paylink",
                      json={'items': [{'product_id': sample_item['product_id'], 'qty': 1}]},
                      headers=admin_headers, timeout=30)
    assert r.status_code == 200, r.text
    order = r.json()
    created_state['order_ids'].append(order['id'])
    oid = order['id']

    # blocked email
    blocked_addr = _ship(email='fraud+test@example.com', first_name='X', last_name='Y',
                         address1='1 blah', postcode='AB1 2CD')
    r2 = requests.put(f"{API}/orders/pay/{oid}/address", json=blocked_addr, timeout=30)
    assert r2.status_code == 403, r2.text

    # clean address
    clean_addr = _ship(email='clean.paylink@example.com', first_name='Pay', last_name='Link',
                       address1='7 Clean Lane', postcode='CL1 2AN')
    r3 = requests.put(f"{API}/orders/pay/{oid}/address", json=clean_addr, timeout=30)
    assert r3.status_code == 200, r3.text


# ------- cleanup -------
def test_cleanup(admin_headers, created_state):
    # delete block entries
    for bid in created_state['block_ids']:
        requests.delete(f"{API}/admin/blocklist/{bid}", headers=admin_headers, timeout=30)
    # delete test orders
    for oid in created_state['order_ids']:
        requests.delete(f"{API}/orders/{oid}", headers=admin_headers, timeout=30)
    # reset counter so no gap
    baseline = created_state.get('baseline_seq') or 0
    next_seq = baseline + 1
    r = requests.post(f"{API}/orders/reset-counter", json={'next_seq': next_seq},
                      headers=admin_headers, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()['ok'] is True
