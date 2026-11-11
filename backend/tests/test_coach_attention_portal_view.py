# Coach tools: attention feed, view-as-client portal bundle, protocol next_review_date
import os
import uuid
from datetime import datetime, timedelta

import pytest
import requests
from dotenv import dotenv_values

BASE_URL = (os.environ.get('REACT_APP_BACKEND_URL') or dotenv_values('/app/frontend/.env').get('REACT_APP_BACKEND_URL')).rstrip('/')
API = f"{BASE_URL}/api"
COACH = ('coachghp@gmail.com', 'CoachGHP26')
ADMIN = ('admin@ghp-health.com', 'GHP-Health26')
S = {}


def login(e, p):
    r = requests.post(f"{API}/auth/login", json={'email': e, 'password': p}, timeout=30)
    assert r.status_code == 200, r.text
    return {'Authorization': f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope='module')
def coach_h():
    return login(*COACH)


@pytest.fixture(scope='module')
def admin_h():
    return login(*ADMIN)


@pytest.fixture(scope='module', autouse=True)
def member(coach_h, admin_h):
    email = f"test_attn_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={'email': email, 'password': 'Test1234!', 'first_name': 'TEST_Attn', 'last_name': 'Member'}, timeout=30)
    assert r.status_code in (200, 201), r.text
    S['cust_h'] = {'Authorization': f"Bearer {r.json()['access_token']}"}
    rq = requests.post(f"{API}/coaching/requests", json={'first_name': 'TEST_Attn', 'last_name': 'Member', 'email': email,
                       'area': 'weightloss', 'waiver_accepted': True, 'tier': 'gold'}, timeout=30).json()
    requests.patch(f"{API}/coaching/coach/requests/{rq['id']}", json={'status': 'accepted'}, headers=coach_h, timeout=30)
    cid = next(c['id'] for c in requests.get(f"{API}/coaching/coach/clients", headers=coach_h).json() if c['request_id'] == rq['id'])
    S['cid'] = cid
    # activate membership directly (no payment)
    r = requests.patch(f"{API}/coaching/coach/clients/{cid}/membership",
                       json={'tier': 'gold', 'paid_until': (datetime.utcnow() + timedelta(days=20)).isoformat()}, headers=coach_h)
    assert r.status_code == 200 and r.json()['active'] is True, r.text
    yield
    requests.delete(f"{API}/coaching/coach/clients/{cid}", headers=coach_h, timeout=30)


def attention(coach_h):
    r = requests.get(f"{API}/coaching/coach/attention", headers=coach_h, timeout=60)
    assert r.status_code == 200, r.text
    return r.json()


class TestAttention:
    def test_keys(self, coach_h):
        d = attention(coach_h)
        for k in ('pending_checkins', 'unanswered_messages', 'expiring', 'lapsed', 'unpaid_first_month'):
            assert isinstance(d[k], list), k
        assert not any(r['client_id'] == S['cid'] for r in d['expiring'] + d['lapsed'])

    def test_customer_forbidden(self):
        r = requests.get(f"{API}/coaching/coach/attention", headers=S['cust_h'])
        assert r.status_code in (401, 403)

    def test_unanswered_message_cycle(self, coach_h):
        r = requests.post(f"{API}/coaching/my/messages", json={'body': 'TEST_ hello coach'}, headers=S['cust_h'])
        assert r.status_code == 200, r.text
        rows = [x for x in attention(coach_h)['unanswered_messages'] if x['client_id'] == S['cid']]
        assert rows and rows[0]['body'] == 'TEST_ hello coach'
        r = requests.post(f"{API}/coaching/coach/clients/{S['cid']}/messages", json={'body': 'TEST_ reply'}, headers=coach_h)
        assert r.status_code == 200
        assert not any(x['client_id'] == S['cid'] for x in attention(coach_h)['unanswered_messages'])
        msgs = requests.get(f"{API}/coaching/my/messages", headers=S['cust_h']).json()
        assert msgs[-1]['from_role'] == 'coach' and msgs[-1]['body'] == 'TEST_ reply'

    def test_pending_checkin_cycle(self, coach_h):
        r = requests.post(f"{API}/coaching/my/checkins", json={'week_ending': datetime.utcnow().date().isoformat(), 'energy': 7,
                          'sleep': 6, 'training': 5, 'notes': 'TEST_ note'}, headers=S['cust_h'])
        assert r.status_code == 200, r.text
        ck = r.json()['id']
        rows = [x for x in attention(coach_h)['pending_checkins'] if x['client_id'] == S['cid']]
        assert rows and rows[0]['id'] == ck and rows[0]['customer_name']
        r = requests.patch(f"{API}/coaching/coach/checkins/{ck}", json={'coach_reply': 'TEST_ great'}, headers=coach_h)
        assert r.status_code == 200 and r.json()['reviewed'] is True
        assert not any(x['id'] == ck for x in attention(coach_h)['pending_checkins'])

    def test_expiring_then_lapsed(self, coach_h):
        r = requests.patch(f"{API}/coaching/coach/clients/{S['cid']}/membership",
                           json={'paid_until': (datetime.utcnow() + timedelta(days=2, hours=1)).isoformat()}, headers=coach_h)
        assert r.status_code == 200
        d = attention(coach_h)
        exp = [x for x in d['expiring'] if x['client_id'] == S['cid']]
        assert exp and exp[0]['days_left'] == 2
        assert not any(x['client_id'] == S['cid'] for x in d['lapsed'])
        r = requests.patch(f"{API}/coaching/coach/clients/{S['cid']}/membership",
                           json={'paid_until': (datetime.utcnow() - timedelta(days=1)).isoformat()}, headers=coach_h)
        assert r.status_code == 200 and r.json()['active'] is False
        d = attention(coach_h)
        assert any(x['client_id'] == S['cid'] for x in d['lapsed'])
        assert not any(x['client_id'] == S['cid'] for x in d['expiring'])
        # restore active for later tests
        requests.patch(f"{API}/coaching/coach/clients/{S['cid']}/membership",
                       json={'paid_until': (datetime.utcnow() + timedelta(days=20)).isoformat()}, headers=coach_h)


class TestPortalView:
    def test_bundle(self, coach_h):
        r = requests.get(f"{API}/coaching/coach/clients/{S['cid']}/portal-view", headers=coach_h)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ('client', 'membership', 'protocol', 'checkins', 'messages', 'resources'):
            assert k in d, k
        assert d['client']['id'] == S['cid'] and '_id' not in d['client']
        assert d['membership']['client_name'].startswith('TEST_Attn')
        assert d['membership']['coach_name']
        assert d['protocol'] is None
        assert len(d['messages']) >= 2 and len(d['checkins']) >= 1
        assert isinstance(d['resources'], list)

    def test_unknown_404(self, coach_h):
        r = requests.get(f"{API}/coaching/coach/clients/{uuid.uuid4()}/portal-view", headers=coach_h)
        assert r.status_code == 404

    def test_customer_403(self):
        r = requests.get(f"{API}/coaching/coach/clients/{S['cid']}/portal-view", headers=S['cust_h'])
        assert r.status_code in (401, 403)


class TestProtocolReviewDate:
    def test_next_review_date_persists(self, coach_h):
        r = requests.post(f"{API}/coaching/coach/clients/{S['cid']}/protocol", json={'title': 'TEST_ proto', 'duration_weeks': 4}, headers=coach_h)
        assert r.status_code == 200, r.text
        pid = r.json()['id']
        r = requests.put(f"{API}/coaching/coach/protocols/{pid}", json={'next_review_date': '2026-12-01', 'supplement_plan': 'TEST_ omega 3',
                         'notes': 'TEST_ coach notes'}, headers=coach_h)
        assert r.status_code == 200, r.text
        assert r.json()['next_review_date'] == '2026-12-01'
        p = requests.get(f"{API}/coaching/coach/clients/{S['cid']}", headers=coach_h).json()['protocol']
        assert p['next_review_date'] == '2026-12-01' and p['supplement_plan'] == 'TEST_ omega 3'
        pv = requests.get(f"{API}/coaching/coach/clients/{S['cid']}/portal-view", headers=coach_h).json()
        assert pv['protocol']['id'] == pid and pv['protocol']['next_review_date'] == '2026-12-01'
        mp = requests.get(f"{API}/coaching/my/protocol", headers=S['cust_h'])
        if mp.status_code == 200 and mp.json():
            assert (mp.json().get('protocol') or mp.json()).get('next_review_date') == '2026-12-01'
