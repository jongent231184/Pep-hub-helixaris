"""Backend tests for auto-scheduled calendar generation from freq_days
and cascade delete of items.
"""
import os
import time
import requests
import pytest
from datetime import datetime, timedelta
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

COACH_EMAIL = 'coachghp@gmail.com'
COACH_PASSWORD = 'CoachGHP26'


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={'email': email, 'password': password})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()['access_token']


def _auth(t):
    return {'Authorization': f'Bearer {t}'}


@pytest.fixture(scope='module')
def coach_token():
    return _login(COACH_EMAIL, COACH_PASSWORD)


@pytest.fixture(scope='module')
def fresh_client_and_protocol(coach_token):
    """Create a fresh customer, accept as coach, then create a 4-week protocol."""
    ts = int(time.time())
    email = f"TEST_autosched+{ts}@example.com"
    r = requests.post(f"{API}/auth/register", json={
        'email': email, 'password': 'Passw0rd!',
        'first_name': 'TEST', 'last_name': f'AutoSched{ts}',
    })
    assert r.status_code == 200, r.text

    # Public request
    r = requests.post(f"{API}/coaching/requests", json={
        'first_name': 'TEST', 'last_name': 'AutoSched',
        'email': email, 'phone': '+441234567890',
        'area': 'peptide_info', 'message': 'auto-sched test',
        'waiver_accepted': True,
    })
    assert r.status_code == 200, r.text
    req_id = r.json()['id']

    # Coach accepts
    r = requests.patch(
        f"{API}/coaching/coach/requests/{req_id}",
        headers=_auth(coach_token), json={'status': 'accepted'},
    )
    assert r.status_code == 200, r.text

    # Find client
    r = requests.get(f"{API}/coaching/coach/clients", headers=_auth(coach_token))
    assert r.status_code == 200
    mine = [c for c in r.json() if c.get('customer_email', '').lower() == email.lower()]
    assert mine, "client not created"
    client_id = mine[0]['id']

    # Create 4-week protocol
    r = requests.post(
        f"{API}/coaching/coach/clients/{client_id}/protocol",
        headers=_auth(coach_token),
        json={'title': 'TEST AutoSched Protocol', 'area': 'peptides', 'duration_weeks': 4},
    )
    assert r.status_code == 200, r.text
    proto_id = r.json()['id']

    return {'client_id': client_id, 'proto_id': proto_id, 'email': email}


class TestAutoSchedule:
    def test_freq_days_generates_calendar(self, coach_token, fresh_client_and_protocol):
        proto_id = fresh_client_and_protocol['proto_id']
        client_id = fresh_client_and_protocol['client_id']

        r = requests.post(
            f"{API}/coaching/coach/protocols/{proto_id}/items",
            headers=_auth(coach_token),
            json={
                'name': 'TEST AutoItem',
                'dose': '1mg',
                'freq_days': ['Mon', 'Wed', 'Fri'],
                'freq_time': 'AM',
            },
        )
        assert r.status_code == 200, r.text
        item = r.json()
        assert item['name'] == 'TEST AutoItem'
        item_id = item['id']

        # Fetch client detail -> calendar
        r = requests.get(f"{API}/coaching/coach/clients/{client_id}", headers=_auth(coach_token))
        assert r.status_code == 200, r.text
        detail = r.json()
        proto = detail.get('protocol') or {}
        entries = [e for e in proto.get('calendar', []) if e.get('item_id') == item_id]
        assert len(entries) == 12, f"expected 12 (4w×3d), got {len(entries)}"

        # All time_of_day AM, item_name matches
        for e in entries:
            assert e['time_of_day'] == 'AM'
            assert e['item_name'] == 'TEST AutoItem'

        # First date = Monday of current week
        today = datetime.utcnow().date()
        week1_mon = today - timedelta(days=today.weekday())
        dates = sorted(e['date'] for e in entries)
        assert dates[0] == week1_mon.isoformat(), f"first date {dates[0]} != Monday {week1_mon.isoformat()}"

        # Only weekdays 0(Mon),2(Wed),4(Fri) present
        weekdays = {datetime.fromisoformat(d).weekday() for d in dates}
        assert weekdays == {0, 2, 4}, f"unexpected weekdays: {weekdays}"

        # Persist for next test
        TestAutoSchedule.item_id = item_id
        TestAutoSchedule.proto_id = proto_id
        TestAutoSchedule.client_id = client_id

    def test_cascade_delete_removes_calendar(self, coach_token):
        item_id = getattr(TestAutoSchedule, 'item_id', None)
        proto_id = getattr(TestAutoSchedule, 'proto_id', None)
        client_id = getattr(TestAutoSchedule, 'client_id', None)
        if not item_id:
            pytest.skip('needs prior test')

        r = requests.delete(
            f"{API}/coaching/coach/protocols/{proto_id}/items/{item_id}",
            headers=_auth(coach_token),
        )
        assert r.status_code == 200, r.text
        assert r.json().get('ok') is True

        # GET client -> calendar should have no entries with this item_id
        r = requests.get(f"{API}/coaching/coach/clients/{client_id}", headers=_auth(coach_token))
        assert r.status_code == 200
        detail = r.json()
        proto = detail.get('protocol') or {}
        remaining = [e for e in proto.get('calendar', []) if e.get('item_id') == item_id]
        assert remaining == [], f"cascade delete failed; remaining: {remaining}"
        # Item also gone
        item_names = [i['id'] for i in proto.get('items', [])]
        assert item_id not in item_names

    def test_empty_freq_days_creates_no_calendar(self, coach_token, fresh_client_and_protocol):
        proto_id = fresh_client_and_protocol['proto_id']
        client_id = fresh_client_and_protocol['client_id']

        # Empty list
        r = requests.post(
            f"{API}/coaching/coach/protocols/{proto_id}/items",
            headers=_auth(coach_token),
            json={'name': 'TEST NoSched1', 'dose': '2mg', 'freq_days': [], 'freq_time': ''},
        )
        assert r.status_code == 200, r.text
        item1_id = r.json()['id']

        # Omitted entirely
        r = requests.post(
            f"{API}/coaching/coach/protocols/{proto_id}/items",
            headers=_auth(coach_token),
            json={'name': 'TEST NoSched2', 'dose': '3mg'},
        )
        assert r.status_code == 200, r.text
        item2_id = r.json()['id']

        # Neither should have generated calendar entries
        r = requests.get(f"{API}/coaching/coach/clients/{client_id}", headers=_auth(coach_token))
        assert r.status_code == 200
        proto = (r.json() or {}).get('protocol') or {}
        cal = proto.get('calendar', [])
        assert not any(e.get('item_id') == item1_id for e in cal)
        assert not any(e.get('item_id') == item2_id for e in cal)

        # Cleanup
        for iid in (item1_id, item2_id):
            requests.delete(
                f"{API}/coaching/coach/protocols/{proto_id}/items/{iid}",
                headers=_auth(coach_token),
            )
