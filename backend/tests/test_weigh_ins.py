"""Tests for weigh-in tracker endpoints (customer + coach).

Covers:
  (a) upsert (2 POSTs same date → 1 row, id unchanged)
  (b) delete own weigh-in only
  (c) target-weight patch persists on coaching_clients
  (d) authz: user with no active coaching relationship → 404 on write, empty on GET
  (e) coach read + target-set for their client
  (f) coach 404 for foreign client
  (g) validation: empty payload → 422
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


# ---------- Fixtures: customer with active coaching relationship ------
@pytest.fixture(scope='module')
def flow():
    coach = _login(*COACH)
    ts = int(time.time())

    email = f"test_weigh+{ts}@example.com"
    r = requests.post(f"{API}/auth/register", json={
        'email': email, 'password': 'Passw0rd!',
        'first_name': 'TEST', 'last_name': 'Weigh',
    })
    assert r.status_code == 200, r.text
    cust = r.json()['access_token']

    # Submit + accept coaching request
    r = requests.post(f"{API}/coaching/requests", json={
        'first_name': 'TEST', 'last_name': 'Weigh', 'email': email,
        'phone': '+441234567890', 'area': 'weightloss',
        'message': 'weigh test', 'waiver_accepted': True,
    })
    assert r.status_code == 200
    req_id = r.json()['id']

    r = requests.patch(f"{API}/coaching/coach/requests/{req_id}",
                       headers=_h(coach), json={'status': 'accepted'})
    assert r.status_code == 200

    r = requests.get(f"{API}/coaching/coach/clients", headers=_h(coach))
    client_id = [c for c in r.json() if c.get('customer_email', '').lower() == email.lower()][0]['id']

    yield {'coach': coach, 'cust': cust, 'client_id': client_id, 'email': email}


@pytest.fixture(scope='module')
def no_coaching_user():
    """A registered user with no coaching relationship."""
    ts = int(time.time())
    email = f"test_nocoach+{ts}@example.com"
    r = requests.post(f"{API}/auth/register", json={
        'email': email, 'password': 'Passw0rd!', 'first_name': 'NO', 'last_name': 'COACH',
    })
    assert r.status_code == 200
    return r.json()['access_token']


# ---------- (a) upsert ------------------------------------------------
def test_upsert_same_date_updates_same_row(flow):
    date = '2026-09-01'
    r = requests.post(f"{API}/coaching/my/weigh-ins", headers=_h(flow['cust']),
                      json={'date': date, 'weight_kg': 82.5})
    assert r.status_code == 200, r.text
    first = r.json()
    assert first['weight_kg'] == 82.5
    assert first['date'] == date
    first_id = first['id']

    r = requests.post(f"{API}/coaching/my/weigh-ins", headers=_h(flow['cust']),
                      json={'date': date, 'weight_kg': 81.0})
    assert r.status_code == 200
    second = r.json()
    assert second['weight_kg'] == 81.0
    assert second['id'] == first_id, "upsert must reuse id"

    # GET must show only one row for that date with the updated weight
    r = requests.get(f"{API}/coaching/my/weigh-ins", headers=_h(flow['cust']))
    assert r.status_code == 200
    data = r.json()
    matching = [e for e in data['entries'] if e['date'] == date]
    assert len(matching) == 1, f"expected 1 row for {date}, got {len(matching)}"
    assert matching[0]['weight_kg'] == 81.0
    assert matching[0]['id'] == first_id


# ---------- (b) delete -----------------------------------------------
def test_delete_removes_row(flow):
    r = requests.post(f"{API}/coaching/my/weigh-ins", headers=_h(flow['cust']),
                      json={'date': '2026-09-02', 'weight_kg': 80.0})
    assert r.status_code == 200
    entry_id = r.json()['id']

    r = requests.delete(f"{API}/coaching/my/weigh-ins/{entry_id}", headers=_h(flow['cust']))
    assert r.status_code == 200
    assert r.json().get('ok') is True

    r = requests.get(f"{API}/coaching/my/weigh-ins", headers=_h(flow['cust']))
    assert entry_id not in [e['id'] for e in r.json()['entries']]

    # Deleting again → 404
    r = requests.delete(f"{API}/coaching/my/weigh-ins/{entry_id}", headers=_h(flow['cust']))
    assert r.status_code == 404


# ---------- (c) target-weight patch ---------------------------------
def test_target_weight_patch_persists(flow):
    r = requests.patch(f"{API}/coaching/my/target-weight", headers=_h(flow['cust']),
                       json={'target_weight_kg': 72.0})
    assert r.status_code == 200
    assert r.json()['target_weight_kg'] == 72.0

    r = requests.get(f"{API}/coaching/my/weigh-ins", headers=_h(flow['cust']))
    assert r.json()['target_weight_kg'] == 72.0

    # Clear it
    r = requests.patch(f"{API}/coaching/my/target-weight", headers=_h(flow['cust']),
                       json={'target_weight_kg': None})
    assert r.status_code == 200
    r = requests.get(f"{API}/coaching/my/weigh-ins", headers=_h(flow['cust']))
    assert r.json()['target_weight_kg'] is None

    # Restore for coach read test
    requests.patch(f"{API}/coaching/my/target-weight", headers=_h(flow['cust']),
                   json={'target_weight_kg': 72.0})


# ---------- (d) authz: no coaching relationship ---------------------
def test_no_coaching_get_returns_empty(no_coaching_user):
    r = requests.get(f"{API}/coaching/my/weigh-ins", headers=_h(no_coaching_user))
    assert r.status_code == 200
    data = r.json()
    assert data == {'entries': [], 'target_weight_kg': None}


def test_no_coaching_post_returns_404(no_coaching_user):
    r = requests.post(f"{API}/coaching/my/weigh-ins", headers=_h(no_coaching_user),
                      json={'date': '2026-09-05', 'weight_kg': 80})
    assert r.status_code == 404


def test_no_coaching_patch_target_returns_404(no_coaching_user):
    r = requests.patch(f"{API}/coaching/my/target-weight", headers=_h(no_coaching_user),
                      json={'target_weight_kg': 72})
    assert r.status_code == 404


def test_no_coaching_delete_returns_404(no_coaching_user):
    r = requests.delete(f"{API}/coaching/my/weigh-ins/nonexistent-id", headers=_h(no_coaching_user))
    assert r.status_code == 404


# ---------- (e) coach read + target-set for their client -----------
def test_coach_can_read_client_weigh_ins(flow):
    r = requests.get(f"{API}/coaching/coach/clients/{flow['client_id']}/weigh-ins",
                     headers=_h(flow['coach']))
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data.get('entries'), list)
    # Client had 81.0 kg entry from test (a); plus target=72
    assert data.get('target_weight_kg') == 72.0
    dates = [e['date'] for e in data['entries']]
    assert '2026-09-01' in dates


def test_coach_can_set_target_for_client(flow):
    r = requests.patch(f"{API}/coaching/coach/clients/{flow['client_id']}/target-weight",
                       headers=_h(flow['coach']), json={'target_weight_kg': 70.0})
    assert r.status_code == 200
    assert r.json()['target_weight_kg'] == 70.0

    # Customer sees the coach-set target
    r = requests.get(f"{API}/coaching/my/weigh-ins", headers=_h(flow['cust']))
    assert r.json()['target_weight_kg'] == 70.0


# ---------- (f) coach 404 on foreign client ------------------------
def test_coach_404_on_foreign_client(flow):
    r = requests.get(f"{API}/coaching/coach/clients/not-a-real-client-id/weigh-ins",
                     headers=_h(flow['coach']))
    assert r.status_code == 404

    r = requests.patch(f"{API}/coaching/coach/clients/not-a-real-client-id/target-weight",
                       headers=_h(flow['coach']), json={'target_weight_kg': 60.0})
    assert r.status_code == 404


# ---------- (g) validation ----------------------------------------
def test_empty_payload_is_422(flow):
    r = requests.post(f"{API}/coaching/my/weigh-ins", headers=_h(flow['cust']), json={})
    assert r.status_code == 422


def test_missing_weight_is_422(flow):
    r = requests.post(f"{API}/coaching/my/weigh-ins", headers=_h(flow['cust']),
                      json={'date': '2026-09-06'})
    assert r.status_code == 422


# ---------- (h) sanity: Sarah's seeded data still intact -----------
def test_sarah_seeded_weigh_ins_present():
    r = requests.post(f"{API}/auth/login",
                      json={'email': 'sarah.bennett.demo@example.com', 'password': 'GHPHEALTH'})
    if r.status_code != 200:
        pytest.skip('Sarah account not available')
    tok = r.json()['access_token']
    r = requests.get(f"{API}/coaching/my/weigh-ins", headers=_h(tok))
    assert r.status_code == 200
    data = r.json()
    dates = {e['date']: e['weight_kg'] for e in data['entries']}
    assert '2026-08-11' in dates, f"missing seeded 2026-08-11, got dates={list(dates)}"
    assert '2026-08-14' in dates, f"missing seeded 2026-08-14, got dates={list(dates)}"
    assert dates['2026-08-11'] == 83.0
    assert dates['2026-08-14'] == 81.5
    assert data['target_weight_kg'] == 72.0
