"""Verify GET /api/coaching/my/protocol hydrates items with product_slug/name/price/image
and the raw dose/frequency/vial fields needed for client-side vial calc."""
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


@pytest.fixture(scope='module')
def hydrated_ctx():
    admin = _login(*ADMIN)
    coach = _login(*COACH)

    # 1) Admin creates a product with two variants (vial 5mg + vial 10mg)
    slug = f"test-hydra-{int(time.time())}"
    r = requests.post(f"{API}/products", headers=_h(admin), json={
        'slug': slug,
        'name': 'TEST Hydra Peptide',
        'category': 'peptides',
        'price': 42.00,
        'description': '',
        'stock': 100,
        'image': 'https://example.com/hydra.png',
        'variants': [
            {'label': '5mg', 'price': 42.00, 'stock': 10, 'vial_strength_mg': 5},
            {'label': '10mg', 'price': 79.00, 'stock': 10, 'vial_strength_mg': 10},
        ],
        'visible': True,
    })
    assert r.status_code == 200, r.text
    prod = r.json()

    # 2) Register customer + request + coach accept
    ts = int(time.time())
    email = f"test_hydra+{ts}@example.com"
    r = requests.post(f"{API}/auth/register", json={
        'email': email, 'password': 'Passw0rd!',
        'first_name': 'TEST', 'last_name': 'Hydra',
    })
    assert r.status_code == 200, r.text
    cust_tok = r.json()['access_token']

    r = requests.post(f"{API}/coaching/requests", json={
        'first_name': 'TEST', 'last_name': 'Hydra',
        'email': email, 'phone': '+441234567890',
        'area': 'peptide_info', 'message': 'hydration test',
        'waiver_accepted': True,
    })
    assert r.status_code == 200, r.text
    req_id = r.json()['id']

    r = requests.patch(f"{API}/coaching/coach/requests/{req_id}",
                       headers=_h(coach), json={'status': 'accepted'})
    assert r.status_code == 200

    r = requests.get(f"{API}/coaching/coach/clients", headers=_h(coach))
    client_id = [c for c in r.json() if c.get('customer_email', '').lower() == email.lower()][0]['id']

    r = requests.post(f"{API}/coaching/coach/clients/{client_id}/protocol",
                      headers=_h(coach),
                      json={'title': 'TEST Hydra Protocol', 'area': 'peptides', 'duration_weeks': 8})
    assert r.status_code == 200
    proto_id = r.json()['id']

    # 3) Two items
    r1 = requests.post(f"{API}/coaching/coach/protocols/{proto_id}/items",
                       headers=_h(coach),
                       json={'product_id': prod['id'], 'variant_label': '5mg',
                             'name': prod['name'], 'dose_amount': 2, 'dose_unit': 'mg',
                             'vial_strength_mg': 5, 'freq_days': ['Mon', 'Thu'], 'freq_time': 'AM'})
    assert r1.status_code == 200, r1.text
    r2 = requests.post(f"{API}/coaching/coach/protocols/{proto_id}/items",
                       headers=_h(coach),
                       json={'product_id': prod['id'], 'variant_label': '10mg',
                             'name': prod['name'], 'dose_amount': 1, 'dose_unit': 'mg',
                             'vial_strength_mg': 10,
                             'freq_days': ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                             'freq_time': 'AM'})
    assert r2.status_code == 200, r2.text

    # 4) Mark protocol paid so /my/protocol returns it as unlocked
    #    (patch via coach endpoint)
    r = requests.patch(f"{API}/coaching/coach/protocols/{proto_id}",
                       headers=_h(coach), json={'paid': True})
    # Older API may not accept 'paid' — check what fields are allowed. Ignore if 200 or 422.
    yield {
        'admin': admin, 'coach': coach, 'cust_tok': cust_tok,
        'prod_id': prod['id'], 'slug': slug, 'client_id': client_id, 'proto_id': proto_id,
        'email': email,
    }

    # cleanup
    requests.delete(f"{API}/products/{prod['id']}", headers=_h(admin))


def test_my_protocol_hydrates_product_fields(hydrated_ctx):
    r = requests.get(f"{API}/coaching/my/protocol", headers=_h(hydrated_ctx['cust_tok']))
    assert r.status_code == 200, r.text
    proto = r.json()
    assert proto is not None, "protocol should exist"
    items = proto.get('items') or []
    assert len(items) == 2, f"expected 2 items, got {len(items)}: {items}"

    required = {'product_slug', 'product_name', 'product_price',
                'dose_amount', 'dose_unit', 'vial_strength_mg',
                'variant_label', 'freq_days', 'freq_time'}
    for it in items:
        missing = required - set(it.keys())
        assert not missing, f"item missing keys {missing}: {it}"
        assert it['product_slug'] == hydrated_ctx['slug']
        assert it['product_name'] == 'TEST Hydra Peptide'
        assert it['product_price'] == 42.00
        # product_image is optional but should be set here
        assert it.get('product_image') == 'https://example.com/hydra.png', it

    # Verify the two items look correct
    by_variant = {it['variant_label']: it for it in items}
    assert '5mg' in by_variant and '10mg' in by_variant
    a = by_variant['5mg']
    assert a['dose_amount'] == 2 and a['dose_unit'] == 'mg'
    assert a['vial_strength_mg'] == 5
    assert set(a['freq_days']) == {'Mon', 'Thu'}
    b = by_variant['10mg']
    assert b['dose_amount'] == 1 and b['dose_unit'] == 'mg'
    assert b['vial_strength_mg'] == 10
    assert len(b['freq_days']) == 7


def test_cart_context_no_prescribed_endpoint_dependency(hydrated_ctx):
    """CartContext should no longer be responsible for calling /prescribed-cart on mount.
    We just verify the endpoint still exists for backward compat (returns 200)."""
    r = requests.get(f"{API}/coaching/my/prescribed-cart", headers=_h(hydrated_ctx['cust_tok']))
    assert r.status_code == 200
    assert isinstance(r.json(), list)
