"""Tests for _infer_vial_strength_mg helper + _hydrate_protocol backfill +
add_item inference at write-time (bug fix: TB-500 was saved with vial_strength_mg=null
because product had no variants carrying vial_strength_mg; UI dropped the 'Add to cart'
button because computeVials returned null → canAdd=false)."""
import os
import time
import requests
import pytest
from pathlib import Path


def _load_frontend_env():
    env_file = Path('/app/frontend/.env')
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith('REACT_APP_BACKEND_URL='):
                return line.split('=', 1)[1].strip().strip('"').strip("'")
    return None


BASE_URL = (os.environ.get('REACT_APP_BACKEND_URL') or _load_frontend_env()).rstrip('/')
API = f"{BASE_URL}/api"

ADMIN = ('admin@ghp-health.com', 'GHP-Health26')
COACH = ('coachghp@gmail.com', 'CoachGHP26')


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={'email': email, 'password': pw})
    assert r.status_code == 200, r.text
    return r.json()['access_token']


def _h(t):
    return {'Authorization': f'Bearer {t}'}


# ---- unit tests for the pure helper ----------------------------------
def test_helper_variant_matches_first():
    from routes.coaching_routes import _infer_vial_strength_mg
    prod = {'name': 'Nothing 99mg',
            'variants': [{'label': '5mg', 'vial_strength_mg': 5},
                         {'label': '10mg', 'vial_strength_mg': 10}]}
    assert _infer_vial_strength_mg(prod, '10mg') == 10.0
    assert _infer_vial_strength_mg(prod, '5mg') == 5.0


def test_helper_falls_back_to_any_variant():
    from routes.coaching_routes import _infer_vial_strength_mg
    prod = {'name': 'X 99mg',
            'variants': [{'label': 'only', 'vial_strength_mg': 7}]}
    # no matching variant label → first variant wins over regex
    assert _infer_vial_strength_mg(prod, 'nomatch') == 7.0


def test_helper_regex_on_variant_label():
    from routes.coaching_routes import _infer_vial_strength_mg
    prod = {'name': 'Something', 'variants': []}
    assert _infer_vial_strength_mg(prod, '5mg') == 5.0


def test_helper_regex_on_product_name():
    from routes.coaching_routes import _infer_vial_strength_mg
    prod = {'name': 'TB-500 10mg', 'variants': []}
    assert _infer_vial_strength_mg(prod, None) == 10.0


def test_helper_none_when_no_signal():
    from routes.coaching_routes import _infer_vial_strength_mg
    assert _infer_vial_strength_mg(None) is None
    assert _infer_vial_strength_mg({'name': 'Cream', 'variants': []}) is None


def test_helper_precedence_variant_wins_over_name_regex():
    from routes.coaching_routes import _infer_vial_strength_mg
    prod = {'name': 'Product 99mg',
            'variants': [{'label': '5mg', 'vial_strength_mg': 5}]}
    # even when matching by irrelevant label, variant vial wins over 99mg regex
    assert _infer_vial_strength_mg(prod, None) == 5.0


# ---- integration: add_item stores inferred strength ------------------
@pytest.fixture(scope='module')
def flow():
    admin = _login(*ADMIN)
    coach = _login(*COACH)
    ts = int(time.time())

    # Product A: no variants, name has 10mg → regex path
    r = requests.post(f"{API}/products", headers=_h(admin), json={
        'slug': f'test-tb500-{ts}',
        'name': 'TEST TB-500 10mg',
        'category': 'peptides',
        'price': 37.50, 'description': '', 'stock': 100,
        'image': 'https://example.com/tb.png',
        'variants': [],
        'visible': True,
    })
    assert r.status_code == 200, r.text
    prod_regex = r.json()

    # Product B: variant carries vial_strength_mg, but name also has a red-herring number
    r = requests.post(f"{API}/products", headers=_h(admin), json={
        'slug': f'test-bpc-{ts}',
        'name': 'TEST BPC 999mg',  # red herring
        'category': 'peptides',
        'price': 30.0, 'description': '', 'stock': 100,
        'image': 'https://example.com/bpc.png',
        'variants': [{'label': '10mg', 'price': 30.0, 'stock': 10, 'vial_strength_mg': 10}],
        'visible': True,
    })
    assert r.status_code == 200, r.text
    prod_var = r.json()

    # Register customer + accept
    email = f"test_vial+{ts}@example.com"
    r = requests.post(f"{API}/auth/register", json={
        'email': email, 'password': 'Passw0rd!',
        'first_name': 'TEST', 'last_name': 'Vial',
    })
    assert r.status_code == 200
    cust = r.json()['access_token']

    r = requests.post(f"{API}/coaching/requests", json={
        'first_name': 'TEST', 'last_name': 'Vial', 'email': email,
        'phone': '+441234567890', 'area': 'peptide_info',
        'message': 'vial test', 'waiver_accepted': True,
    })
    assert r.status_code == 200
    req_id = r.json()['id']

    r = requests.patch(f"{API}/coaching/coach/requests/{req_id}",
                       headers=_h(coach), json={'status': 'accepted'})
    assert r.status_code == 200

    r = requests.get(f"{API}/coaching/coach/clients", headers=_h(coach))
    client_id = [c for c in r.json() if c.get('customer_email', '').lower() == email.lower()][0]['id']

    r = requests.post(f"{API}/coaching/coach/clients/{client_id}/protocol",
                      headers=_h(coach),
                      json={'title': 'TEST Vial Protocol', 'area': 'peptides', 'duration_weeks': 12})
    assert r.status_code == 200
    proto_id = r.json()['id']

    yield {
        'admin': admin, 'coach': coach, 'cust': cust,
        'prod_regex_id': prod_regex['id'], 'prod_var_id': prod_var['id'],
        'proto_id': proto_id, 'client_id': client_id,
    }
    for pid in (prod_regex['id'], prod_var['id']):
        requests.delete(f"{API}/products/{pid}", headers=_h(admin))


def test_add_item_infers_from_name_regex_when_no_variants(flow):
    """Coach POSTs an item with vial_strength_mg omitted for a product that
    has no variants but 'Xmg' in the name → backend must persist X."""
    r = requests.post(f"{API}/coaching/coach/protocols/{flow['proto_id']}/items",
                      headers=_h(flow['coach']), json={
                          'product_id': flow['prod_regex_id'],
                          'name': 'TEST TB-500 10mg',
                          'dose_amount': 1, 'dose_unit': 'mg',
                          # NO vial_strength_mg
                          'freq_days': ['Mon', 'Wed', 'Fri'], 'freq_time': 'AM',
                      })
    assert r.status_code == 200, r.text
    item = r.json()
    assert item['vial_strength_mg'] == 10.0, f"expected 10 inferred, got {item.get('vial_strength_mg')}"


def test_add_item_infers_from_variant_vial(flow):
    """Variant with vial_strength_mg wins over name regex."""
    r = requests.post(f"{API}/coaching/coach/protocols/{flow['proto_id']}/items",
                      headers=_h(flow['coach']), json={
                          'product_id': flow['prod_var_id'],
                          'variant_label': '10mg',
                          'name': 'TEST BPC 999mg',
                          'dose_amount': 2, 'dose_unit': 'mg',
                          # NO vial_strength_mg
                          'freq_days': ['Mon'], 'freq_time': 'AM',
                      })
    assert r.status_code == 200, r.text
    item = r.json()
    assert item['vial_strength_mg'] == 10.0, f"variant should give 10, got {item.get('vial_strength_mg')}"


def test_hydrate_backfills_null_vial_strength(flow):
    """Simulate a legacy record: item saved with vial_strength_mg=None (from before the
    fix). GET /my/protocol must patch it on read via _hydrate_protocol → 10.0."""
    from motor.motor_asyncio import AsyncIOMotorClient
    import asyncio, uuid
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME')
    assert mongo_url and db_name
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    legacy_id = str(uuid.uuid4())

    async def insert_legacy():
        from datetime import datetime
        await db.protocol_items.insert_one({
            'id': legacy_id,
            'protocol_id': flow['proto_id'],
            'product_id': flow['prod_regex_id'],  # 'TEST TB-500 10mg', no variants
            'variant_label': None,
            'name': 'TEST TB-500 10mg',
            'dose': '', 'dose_amount': 1, 'dose_unit': 'mg',
            'vial_strength_mg': None,  # <-- legacy null
            'frequency': '', 'freq_days': ['Mon'], 'freq_time': 'AM',
            'notes': '', 'created_at': datetime.utcnow(),
        })
        return await db.protocol_items.find_one({'id': legacy_id})

    raw_doc = asyncio.run(insert_legacy())
    assert raw_doc['vial_strength_mg'] is None, \
        f"DB record should stay null (patched only on read), got {raw_doc['vial_strength_mg']}"

    # Now hit the API from the customer perspective
    r = requests.get(f"{API}/coaching/my/protocol", headers=_h(flow['cust']))
    assert r.status_code == 200, r.text
    proto = r.json()
    assert proto is not None
    match = [i for i in proto['items'] if i['id'] == legacy_id]
    assert len(match) == 1, f"legacy item not in protocol response"
    assert match[0]['vial_strength_mg'] == 10.0, \
        f"hydration should have backfilled to 10, got {match[0]['vial_strength_mg']}"


def test_sarah_tb500_hydrated_to_10():
    """The bug report: Sarah Bennett's TB-500 must now show vial_strength_mg=10
    when she fetches /my/protocol, even though DB may still hold null."""
    # login as Sarah
    r = requests.post(f"{API}/auth/login",
                      json={'email': 'sarah.bennett.demo@example.com', 'password': 'GHPHEALTH'})
    if r.status_code != 200:
        pytest.skip(f"Sarah account not available: {r.status_code}")
    tok = r.json()['access_token']
    r = requests.get(f"{API}/coaching/my/protocol", headers=_h(tok))
    assert r.status_code == 200, r.text
    proto = r.json()
    if not proto or not proto.get('items'):
        pytest.skip("Sarah has no active protocol / items")
    tb = [i for i in proto['items'] if 'TB-500' in (i.get('product_name') or '') or 'TB-500' in (i.get('name') or '')]
    if not tb:
        pytest.skip("No TB-500 line on Sarah's protocol")
    for item in tb:
        assert item.get('vial_strength_mg') == 10.0, \
            f"Sarah's TB-500 vial_strength_mg={item.get('vial_strength_mg')}, expected 10.0"
    # BPC check
    bpc = [i for i in proto['items'] if 'BPC' in (i.get('product_name') or '') or 'BPC' in (i.get('name') or '')]
    for item in bpc:
        assert item.get('vial_strength_mg'), f"BPC vial_strength_mg missing: {item}"
