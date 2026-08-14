"""Backend tests for PATCH /api/coaching/coach/protocols/{proto_id}/calendar/{entry_id}?done=true|false.

Verifies:
    (a) coach can toggle their own entry (done + done_at persisted)
    (b) other/foreign coach receives 404
    (c) unauth returns 401/403
    (d) toggle is reflected in _hydrate_protocol return via GET /coaching/coach/clients/{client_id}
    (e) customer PATCH /my/calendar reflects same doc (regression w/ iteration 8)
"""
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
def ctx():
    admin = _login(*ADMIN)
    coach = _login(*COACH)

    # create product
    slug = f"test-toggle-{int(time.time())}"
    r = requests.post(f"{API}/products", headers=_h(admin), json={
        'slug': slug,
        'name': 'TEST Toggle Peptide',
        'category': 'peptides',
        'price': 20.00,
        'description': '', 'stock': 50,
        'image': 'https://example.com/toggle.png',
        'variants': [{'label': '5mg', 'price': 20.00, 'stock': 10, 'vial_strength_mg': 5}],
        'visible': True,
    })
    assert r.status_code == 200, r.text
    prod = r.json()

    # register customer + request + accept
    ts = int(time.time())
    email = f"test_toggle+{ts}@example.com"
    r = requests.post(f"{API}/auth/register", json={
        'email': email, 'password': 'Passw0rd!',
        'first_name': 'TEST', 'last_name': 'Toggle',
    })
    assert r.status_code == 200, r.text
    cust_tok = r.json()['access_token']

    r = requests.post(f"{API}/coaching/requests", json={
        'first_name': 'TEST', 'last_name': 'Toggle',
        'email': email, 'phone': '+441234567890',
        'area': 'peptide_info', 'message': 'toggle test',
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
                      json={'title': 'TEST Toggle Protocol', 'area': 'peptides', 'duration_weeks': 2})
    assert r.status_code == 200
    proto_id = r.json()['id']

    # Add an item that generates calendar entries
    r = requests.post(f"{API}/coaching/coach/protocols/{proto_id}/items",
                      headers=_h(coach),
                      json={'product_id': prod['id'], 'variant_label': '5mg',
                            'name': prod['name'], 'dose_amount': 1, 'dose_unit': 'mg',
                            'vial_strength_mg': 5, 'freq_days': ['Mon', 'Wed', 'Fri'],
                            'freq_time': 'AM'})
    assert r.status_code == 200, r.text

    # Fetch client detail to get calendar entries
    r = requests.get(f"{API}/coaching/coach/clients/{client_id}", headers=_h(coach))
    assert r.status_code == 200, r.text
    detail = r.json()
    proto = detail.get('protocol') or {}
    entries = proto.get('calendar') or []
    assert len(entries) > 0, f"expected calendar entries after add_item, got: {detail}"

    yield {
        'admin': admin, 'coach': coach, 'cust_tok': cust_tok,
        'prod_id': prod['id'], 'client_id': client_id, 'proto_id': proto_id,
        'entry_id': entries[0]['id'], 'email': email,
    }

    # cleanup product
    requests.delete(f"{API}/products/{prod['id']}", headers=_h(admin))


def test_coach_can_toggle_done_true(ctx):
    r = requests.patch(
        f"{API}/coaching/coach/protocols/{ctx['proto_id']}/calendar/{ctx['entry_id']}",
        headers=_h(ctx['coach']), params={'done': 'true'},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get('ok') is True
    assert body.get('done') is True


def test_hydrated_protocol_reflects_done_true(ctx):
    r = requests.get(f"{API}/coaching/coach/clients/{ctx['client_id']}", headers=_h(ctx['coach']))
    assert r.status_code == 200
    proto = r.json().get('protocol') or {}
    entry = next((e for e in (proto.get('calendar') or []) if e['id'] == ctx['entry_id']), None)
    assert entry is not None, "entry missing from hydrated calendar"
    assert entry.get('done') is True
    # done_at should be present (either str or ISO)
    assert entry.get('done_at'), f"done_at not set: {entry}"


def test_customer_sees_same_done_state(ctx):
    """Regression: customer /my/protocol should reflect coach-side toggle (same doc)."""
    r = requests.get(f"{API}/coaching/my/protocol", headers=_h(ctx['cust_tok']))
    assert r.status_code == 200
    proto = r.json()
    assert proto is not None
    entry = next((e for e in (proto.get('calendar') or []) if e['id'] == ctx['entry_id']), None)
    assert entry is not None
    assert entry.get('done') is True


def test_coach_can_toggle_done_false(ctx):
    r = requests.patch(
        f"{API}/coaching/coach/protocols/{ctx['proto_id']}/calendar/{ctx['entry_id']}",
        headers=_h(ctx['coach']), params={'done': 'false'},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get('done') is False

    # verify hydrated view reverts
    r = requests.get(f"{API}/coaching/coach/clients/{ctx['client_id']}", headers=_h(ctx['coach']))
    entry = next(e for e in r.json()['protocol']['calendar'] if e['id'] == ctx['entry_id'])
    assert entry.get('done') is False


def test_unauth_returns_401(ctx):
    r = requests.patch(
        f"{API}/coaching/coach/protocols/{ctx['proto_id']}/calendar/{ctx['entry_id']}",
        params={'done': 'true'},
    )
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}: {r.text}"


def test_customer_token_cannot_use_coach_endpoint(ctx):
    """Non-coach user hitting coach endpoint should be 401/403 (require_coach gate)."""
    r = requests.patch(
        f"{API}/coaching/coach/protocols/{ctx['proto_id']}/calendar/{ctx['entry_id']}",
        headers=_h(ctx['cust_tok']), params={'done': 'true'},
    )
    assert r.status_code in (401, 403), f"expected 401/403 for non-coach, got {r.status_code}"


def test_foreign_proto_id_returns_404(ctx):
    """Coach hitting an entry under a proto_id that doesn't belong to them → 404."""
    fake_proto = 'nonexistent-proto-xyz'
    r = requests.patch(
        f"{API}/coaching/coach/protocols/{fake_proto}/calendar/{ctx['entry_id']}",
        headers=_h(ctx['coach']), params={'done': 'true'},
    )
    assert r.status_code == 404


def test_bogus_entry_id_returns_404(ctx):
    r = requests.patch(
        f"{API}/coaching/coach/protocols/{ctx['proto_id']}/calendar/nope-nope-nope",
        headers=_h(ctx['coach']), params={'done': 'true'},
    )
    assert r.status_code == 404


def test_customer_my_calendar_toggle_still_works(ctx):
    """Iteration 8 regression: customer PATCH /my/calendar toggles same doc."""
    r = requests.patch(
        f"{API}/coaching/my/calendar/{ctx['entry_id']}",
        headers=_h(ctx['cust_tok']), params={'done': 'true'},
    )
    assert r.status_code == 200, r.text
    assert r.json().get('done') is True

    # coach sees it as done
    r = requests.get(f"{API}/coaching/coach/clients/{ctx['client_id']}", headers=_h(ctx['coach']))
    entry = next(e for e in r.json()['protocol']['calendar'] if e['id'] == ctx['entry_id'])
    assert entry.get('done') is True

    # revert
    r = requests.patch(
        f"{API}/coaching/my/calendar/{ctx['entry_id']}",
        headers=_h(ctx['cust_tok']), params={'done': 'false'},
    )
    assert r.status_code == 200
