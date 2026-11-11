# Coach broadcasts (post/list/delete/member view/portal-view) + Sunday check-in nudge cron
import os
import time
import uuid
import subprocess
from datetime import datetime, timedelta

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

BASE_URL = (os.environ.get('REACT_APP_BACKEND_URL') or dotenv_values('/app/frontend/.env').get('REACT_APP_BACKEND_URL')).rstrip('/')
API = f"{BASE_URL}/api"
BENV = dotenv_values('/app/backend/.env')
SECRET = BENV.get('WEBHOOK_CRON_SECRET')
mdb = MongoClient(BENV['MONGO_URL'])[BENV['DB_NAME']]
COACH = ('coachghp@gmail.com', 'CoachGHP26')
ADMIN = ('admin@ghp-health.com', 'GHP-Health26')
S = {'cids': [], 'bids': []}


def login(e, p):
    r = requests.post(f"{API}/auth/login", json={'email': e, 'password': p}, timeout=30)
    assert r.status_code == 200, r.text
    return {'Authorization': f"Bearer {r.json()['access_token']}"}


def make_member(coach_h, admin_h, tier, email=None, activate='paylink'):
    email = email or f"test_bc_{tier}_{uuid.uuid4().hex[:6]}@example.com"
    r = requests.post(f"{API}/auth/register", json={'email': email, 'password': 'Test1234!', 'first_name': f'TEST_{tier}', 'last_name': 'Nudge'}, timeout=30)
    assert r.status_code in (200, 201), r.text
    h = {'Authorization': f"Bearer {r.json()['access_token']}"}
    rq = requests.post(f"{API}/coaching/requests", json={'first_name': f'TEST_{tier}', 'last_name': 'Nudge', 'email': email,
                       'area': 'weightloss', 'waiver_accepted': True, 'tier': tier}, timeout=30).json()
    requests.patch(f"{API}/coaching/coach/requests/{rq['id']}", json={'status': 'accepted'}, headers=coach_h, timeout=30)
    cid = next(c['id'] for c in requests.get(f"{API}/coaching/coach/clients", headers=coach_h, timeout=30).json() if c.get('request_id') == rq['id'])
    S['cids'].append(cid)
    if activate == 'paylink':
        pl = requests.post(f"{API}/coaching/coach/clients/{cid}/membership-paylink", json={'tier': tier, 'send_email': False}, headers=coach_h, timeout=30).json()
        r = requests.patch(f"{API}/orders/{pl['order_id']}", json={'payment_status': 'paid'}, headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text
        m = requests.get(f"{API}/coaching/my/membership", headers=h, timeout=30).json()
        assert m['active'] is True, m
    return {'email': email, 'h': h, 'cid': cid}


@pytest.fixture(scope='module')
def coach_h():
    return login(*COACH)


@pytest.fixture(scope='module')
def admin_h():
    return login(*ADMIN)


@pytest.fixture(scope='module', autouse=True)
def cleanup(coach_h):
    yield
    for bid in S['bids']:
        requests.delete(f"{API}/coaching/coach/broadcasts/{bid}", headers=coach_h, timeout=30)
    for cid in S['cids']:
        requests.delete(f"{API}/coaching/coach/clients/{cid}", headers=coach_h, timeout=30)


class TestBroadcasts:
    def test_empty_title_400(self, coach_h):
        r = requests.post(f"{API}/coaching/coach/broadcasts", json={'title': '   ', 'body': 'x'}, headers=coach_h)
        assert r.status_code == 400

    def test_post_and_list_pinned_first(self, coach_h):
        r1 = requests.post(f"{API}/coaching/coach/broadcasts", json={'title': 'TEST_unpinned', 'body': 'b1', 'pinned': False}, headers=coach_h)
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1['title'] == 'TEST_unpinned' and d1['coach_name'] and '_id' not in d1
        S['bids'].append(d1['id']); S['unpinned'] = d1['id']
        time.sleep(0.5)
        r2 = requests.post(f"{API}/coaching/coach/broadcasts", json={'title': ' TEST_pinned ', 'body': 'b2', 'pinned': True}, headers=coach_h)
        d2 = r2.json(); S['bids'].append(d2['id']); S['pinned'] = d2['id']
        assert d2['title'] == 'TEST_pinned' and d2['pinned'] is True
        lst = requests.get(f"{API}/coaching/coach/broadcasts", headers=coach_h).json()
        ids = [b['id'] for b in lst]
        assert d1['id'] in ids and d2['id'] in ids
        # pinned items precede all unpinned
        pins = [b['pinned'] for b in lst]
        assert pins == sorted(pins, reverse=True)

    def test_customer_cannot_post(self):
        email = f"test_bc_plain_{uuid.uuid4().hex[:6]}@example.com"
        t = requests.post(f"{API}/auth/register", json={'email': email, 'password': 'Test1234!', 'first_name': 'TEST_p', 'last_name': 'x'}).json()['access_token']
        h = {'Authorization': f'Bearer {t}'}
        assert requests.post(f"{API}/coaching/coach/broadcasts", json={'title': 'x'}, headers=h).status_code in (401, 403)
        assert requests.get(f"{API}/coaching/my/broadcasts", headers=h).status_code == 403

    def test_member_sees_and_unpaid_402(self, coach_h, admin_h):
        m = make_member(coach_h, admin_h, 'silver')
        S['silver_bc'] = m
        lst = requests.get(f"{API}/coaching/my/broadcasts", headers=m['h']).json()
        ids = [b['id'] for b in lst]
        assert S['pinned'] in ids and S['unpinned'] in ids
        assert ids.index(S['pinned']) < ids.index(S['unpinned'])
        pv = requests.get(f"{API}/coaching/coach/clients/{m['cid']}/portal-view", headers=coach_h).json()
        assert S['pinned'] in [b['id'] for b in pv['broadcasts']]
        unpaid = make_member(coach_h, admin_h, 'gold', activate=None)
        assert requests.get(f"{API}/coaching/my/broadcasts", headers=unpaid['h']).status_code == 402

    def test_delete(self, coach_h):
        r = requests.delete(f"{API}/coaching/coach/broadcasts/{S['unpinned']}", headers=coach_h)
        assert r.status_code == 200
        assert requests.delete(f"{API}/coaching/coach/broadcasts/{S['unpinned']}", headers=coach_h).status_code == 404
        ids = [b['id'] for b in requests.get(f"{API}/coaching/my/broadcasts", headers=S['silver_bc']['h']).json()]
        assert S['unpinned'] not in ids


def run_cron(rid):
    r = requests.post(f"{API}/coaching/cron/checkin-nudges", json={'run_id': rid}, headers={'Authorization': f'Bearer {SECRET}'}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def wait_run(rid, t=60):
    for _ in range(t):
        doc = mdb.cron_runs.find_one({'run_id': rid})
        if doc and 'nudges_sent' in doc:
            return doc
        time.sleep(1)
    raise AssertionError('cron run did not finish')


class TestNudges:
    def test_auth(self):
        assert requests.post(f"{API}/coaching/cron/checkin-nudges", json={}).status_code == 401
        assert requests.post(f"{API}/coaching/cron/checkin-nudges", json={}, headers={'Authorization': 'Bearer wrong'}).status_code == 401

    def test_duplicate(self):
        rid = f"TEST_dup_{uuid.uuid4().hex[:8]}"
        d = run_cron(rid)
        assert d['queued'] is True and d['run_id'] == rid
        assert run_cron(rid).get('duplicate') is True
        wait_run(rid)

    def test_positive_and_exclusions(self, coach_h, admin_h):
        target = make_member(coach_h, admin_h, 'gold', email=f"nudgetest+{uuid.uuid4().hex[:6]}@ghp-health.com")
        checked = make_member(coach_h, admin_h, 'silver')
        r = requests.post(f"{API}/coaching/my/checkins", json={'week_ending': datetime.utcnow().date().isoformat(), 'energy': 4, 'sleep': 4, 'training': 4}, headers=checked['h'])
        assert r.status_code == 200, r.text
        bronze = make_member(coach_h, admin_h, 'bronze')
        rid = f"TEST_nudge_{uuid.uuid4().hex[:8]}"
        run_cron(rid)
        doc = wait_run(rid)
        time.sleep(1)
        log = subprocess.run("tail -n 400 /var/log/supervisor/backend.err.log", shell=True, capture_output=True, text=True).stdout
        sent_ok = f"checkin nudge sent to {target['email']}" in log
        failed = f"nudge email failed for {target['cid']}" in log
        print('run doc', doc, 'sent_ok', sent_ok, 'failed', failed)
        assert sent_ok or failed, 'target member was not attempted'
        tdoc = mdb.coaching_clients.find_one({'id': target['cid']})
        if sent_ok:
            assert tdoc.get('last_nudge_at') is not None and doc['nudges_sent'] >= 1
        else:
            assert tdoc.get('last_nudge_at') is None
        for m in (checked, bronze):
            assert mdb.coaching_clients.find_one({'id': m['cid']}).get('last_nudge_at') is None
        assert f"nudge email failed for {checked['cid']}" not in log and f"nudge email failed for {bronze['cid']}" not in log
        S['target'] = target; S['sent_ok'] = sent_ok

    def test_no_renudge_within_6_days(self):
        if not S.get('sent_ok'):
            pytest.skip('first nudge did not succeed')
        rid = f"TEST_nudge2_{uuid.uuid4().hex[:8]}"
        before = mdb.coaching_clients.find_one({'id': S['target']['cid']})['last_nudge_at']
        run_cron(rid)
        wait_run(rid)
        after = mdb.coaching_clients.find_one({'id': S['target']['cid']})['last_nudge_at']
        assert before == after
