"""Backend tests for protocol duration_weeks cascade (extending, shortening,
same-duration no-op, preserve done state, foreign-coach authz).

Uses the seeded coach (coachghp@gmail.com). Creates disposable customers
via the public register + coaching request + accept flow so real client
data (Jon Gent) is never touched.
"""
import os
import time
import uuid
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

ADMIN_EMAIL = 'admin@ghp-health.com'
ADMIN_PASSWORD = 'GHP-Health26'
COACH_EMAIL = 'coachghp@gmail.com'
COACH_PASSWORD = 'CoachGHP26'


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={'email': email, 'password': password})
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return r.json()['access_token']


def _auth(t):
    return {'Authorization': f'Bearer {t}'}


@pytest.fixture(scope='session')
def coach_token():
    return _login(COACH_EMAIL, COACH_PASSWORD)


@pytest.fixture(scope='session')
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


def _make_client(coach_token, tag):
    """Register a fresh customer, submit coaching request, accept as coach.
    Returns (client_id, customer_token)."""
    ts = int(time.time() * 1000)
    email = f"testdur+{tag}{ts}@example.com"
    r = requests.post(f"{API}/auth/register", json={
        'email': email, 'password': 'Passw0rd!',
        'first_name': 'TEST', 'last_name': f'Dur{tag}',
    })
    assert r.status_code == 200, r.text
    customer_token = r.json()['access_token']

    r = requests.post(f"{API}/coaching/requests", json={
        'first_name': 'TEST', 'last_name': f'Dur{tag}', 'email': email,
        'phone': '', 'area': 'peptide_info', 'message': 'test',
        'waiver_accepted': True,
    })
    assert r.status_code == 200, r.text
    req_id = r.json()['id']

    r = requests.patch(f"{API}/coaching/coach/requests/{req_id}",
                       headers=_auth(coach_token), json={'status': 'accepted'})
    assert r.status_code == 200, r.text

    r = requests.get(f"{API}/coaching/coach/clients", headers=_auth(coach_token))
    assert r.status_code == 200
    mine = [c for c in r.json() if c.get('customer_email', '').lower() == email.lower()]
    assert mine, f"no client for {email}"
    return mine[0]['id'], customer_token


def _create_proto(coach_token, client_id, weeks):
    r = requests.post(f"{API}/coaching/coach/clients/{client_id}/protocol",
                      headers=_auth(coach_token),
                      json={'title': f'TEST Dur {weeks}w', 'duration_weeks': weeks})
    assert r.status_code == 200, r.text
    return r.json()['id']


def _add_item(coach_token, proto_id, freq_days):
    r = requests.post(f"{API}/coaching/coach/protocols/{proto_id}/items",
                      headers=_auth(coach_token), json={
                          'name': 'TEST item',
                          'dose_amount': 2.5, 'dose_unit': 'mg',
                          'freq_days': freq_days, 'freq_time': 'AM',
                          'frequency': '+'.join(freq_days) + ' · AM',
                      })
    assert r.status_code == 200, r.text
    return r.json()['id']


def _get_proto(coach_token, client_id):
    r = requests.get(f"{API}/coaching/coach/clients/{client_id}",
                     headers=_auth(coach_token))
    assert r.status_code == 200
    return r.json()['protocol']


# ---------------- 1. Extend ----------------
class TestExtend:
    def test_extend_duration_adds_entries_preserves_originals(self, coach_token):
        client_id, _ = _make_client(coach_token, 'ext')
        proto_id = _create_proto(coach_token, client_id, 4)
        _add_item(coach_token, proto_id, ['Mon', 'Wed'])
        proto = _get_proto(coach_token, client_id)
        assert len(proto['calendar']) == 8, f"expected 8 entries for 4w Mon+Wed, got {len(proto['calendar'])}"
        original_ids = {e['id'] for e in proto['calendar']}

        # Extend 4 -> 8
        r = requests.put(f"{API}/coaching/coach/protocols/{proto_id}",
                         headers=_auth(coach_token), json={'duration_weeks': 8})
        assert r.status_code == 200, r.text
        proto2 = r.json()
        assert proto2['duration_weeks'] == 8
        assert len(proto2['calendar']) == 16, f"expected 16, got {len(proto2['calendar'])}"

        # Originals preserved by id
        current_ids = {e['id'] for e in proto2['calendar']}
        assert original_ids.issubset(current_ids), "original entry ids must persist"


# ---------------- 2. Shorten ----------------
class TestShorten:
    def test_shorten_removes_entries_beyond_new_week(self, coach_token):
        client_id, _ = _make_client(coach_token, 'shr')
        proto_id = _create_proto(coach_token, client_id, 8)
        _add_item(coach_token, proto_id, ['Mon'])
        proto = _get_proto(coach_token, client_id)
        assert len(proto['calendar']) == 8, f"expected 8 entries for 8w Mon, got {len(proto['calendar'])}"

        # Shorten 8 -> 3
        r = requests.put(f"{API}/coaching/coach/protocols/{proto_id}",
                         headers=_auth(coach_token), json={'duration_weeks': 3})
        assert r.status_code == 200, r.text
        proto2 = r.json()
        assert proto2['duration_weeks'] == 3
        assert len(proto2['calendar']) == 3, f"expected 3, got {len(proto2['calendar'])}"

        # Verify dates: all remaining entries must be within first 3 weeks.
        # week1_mon <= date < week1_mon + 21 days
        from datetime import datetime as _dt, timedelta
        created = proto2.get('created_at')
        ref = _dt.fromisoformat(str(created).replace('Z', '')) if isinstance(created, str) else _dt.utcnow()
        wk1 = ref.date() - timedelta(days=ref.date().weekday())
        cutoff = (wk1 + timedelta(days=21)).isoformat()
        for e in proto2['calendar']:
            assert e['date'] < cutoff, f"entry {e['date']} is on/after cutoff {cutoff}"


# ---------------- 3. Same-duration no-op ----------------
class TestSameDurationNoCascade:
    def test_title_only_edit_does_not_touch_calendar(self, coach_token):
        client_id, _ = _make_client(coach_token, 'same')
        proto_id = _create_proto(coach_token, client_id, 4)
        _add_item(coach_token, proto_id, ['Mon', 'Wed'])
        proto = _get_proto(coach_token, client_id)
        before_ids = sorted(e['id'] for e in proto['calendar'])
        assert len(before_ids) == 8

        # PUT only title + notes (no duration_weeks in payload)
        r = requests.put(f"{API}/coaching/coach/protocols/{proto_id}",
                         headers=_auth(coach_token),
                         json={'title': 'Renamed TEST', 'notes': 'new notes'})
        assert r.status_code == 200, r.text
        after_ids = sorted(e['id'] for e in r.json()['calendar'])
        assert after_ids == before_ids, "calendar entries must be untouched when duration unchanged"
        assert r.json()['title'] == 'Renamed TEST'


# ---------------- 4. Cascade preserves done state ----------------
class TestCascadePreservesDone:
    def test_extend_preserves_done_and_new_entries_default_false(self, coach_token):
        client_id, _ = _make_client(coach_token, 'done')
        proto_id = _create_proto(coach_token, client_id, 2)
        _add_item(coach_token, proto_id, ['Mon', 'Wed'])
        proto = _get_proto(coach_token, client_id)
        entries = sorted(proto['calendar'], key=lambda e: e['date'])
        assert len(entries) == 4, f"expected 4 for 2w Mon+Wed, got {len(entries)}"

        # Mark first 2 done via coach toggle
        for e in entries[:2]:
            r = requests.patch(
                f"{API}/coaching/coach/protocols/{proto_id}/calendar/{e['id']}?done=true",
                headers=_auth(coach_token),
            )
            assert r.status_code == 200, r.text

        # Extend 2 -> 4
        r = requests.put(f"{API}/coaching/coach/protocols/{proto_id}",
                         headers=_auth(coach_token), json={'duration_weeks': 4})
        assert r.status_code == 200, r.text
        proto2 = r.json()
        assert len(proto2['calendar']) == 8, f"expected 8 after extend, got {len(proto2['calendar'])}"

        entries_by_id = {e['id']: e for e in proto2['calendar']}
        for e in entries[:2]:
            assert entries_by_id[e['id']]['done'] is True, f"originally-done entry {e['id']} lost done state"

        # New entries (dates >= start of week 3) should be done=false
        from datetime import datetime as _dt, timedelta
        created = proto2.get('created_at')
        ref = _dt.fromisoformat(str(created).replace('Z', '')) if isinstance(created, str) else _dt.utcnow()
        wk1 = ref.date() - timedelta(days=ref.date().weekday())
        wk3_start = (wk1 + timedelta(days=14)).isoformat()
        new_entries = [e for e in proto2['calendar'] if e['date'] >= wk3_start]
        assert len(new_entries) == 4, f"expected 4 new entries in weeks 3-4, got {len(new_entries)}"
        for e in new_entries:
            assert e['done'] is False


# ---------------- 5. Foreign-coach authz ----------------
class TestForeignCoachAuthz:
    def test_other_coach_cannot_edit_protocol(self, coach_token, admin_token):
        # Create protocol owned by coach1
        client_id, _ = _make_client(coach_token, 'authz')
        proto_id = _create_proto(coach_token, client_id, 4)

        # Create a second coach via admin
        ts = int(time.time() * 1000)
        other_email = f"coach2+{ts}@example.com"
        other_pw = 'CoachTwo26!'
        r = requests.post(f"{API}/coaching/admin/coaches",
                          headers=_auth(admin_token),
                          json={'email': other_email, 'password': other_pw,
                                'first_name': 'Other', 'last_name': 'Coach',
                                'default_price': 9.99})
        assert r.status_code == 200, r.text
        other_tok = _login(other_email, other_pw)

        # Foreign coach tries to PUT — must 404
        r = requests.put(f"{API}/coaching/coach/protocols/{proto_id}",
                         headers=_auth(other_tok), json={'duration_weeks': 6})
        assert r.status_code == 404, f"expected 404, got {r.status_code} {r.text}"

        # And a totally random proto_id — also 404
        r = requests.put(f"{API}/coaching/coach/protocols/{uuid.uuid4()}",
                         headers=_auth(coach_token), json={'duration_weeks': 6})
        assert r.status_code == 404
