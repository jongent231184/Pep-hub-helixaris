# Coaching tiers (Bronze/Silver/Gold), monthly membership, check-ins, resources, renewal cron
import os
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

FE_ENV = dotenv_values('/app/frontend/.env')
BASE_URL = (os.environ.get('REACT_APP_BACKEND_URL') or FE_ENV.get('REACT_APP_BACKEND_URL')).rstrip('/')
API = f"{BASE_URL}/api"
CRON_SECRET = dotenv_values(Path('/app/backend/.env')).get('WEBHOOK_CRON_SECRET')

ADMIN = ('admin@ghp-health.com', 'GHP-Health26')
COACH = ('coachghp@gmail.com', 'CoachGHP26')
S = {}  # shared state across ordered tests


def login(email, pw):
    r = requests.post(f"{API}/auth/login", json={'email': email, 'password': pw}, timeout=30)
    assert r.status_code == 200, r.text
    return {'Authorization': f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope='module')
def admin_h():
    return login(*ADMIN)


@pytest.fixture(scope='module')
def coach_h():
    return login(*COACH)


@pytest.fixture(scope='module', autouse=True)
def cleanup(admin_h, coach_h):
    yield
    for oid in S.get('orders', []):
        requests.delete(f"{API}/orders/{oid}", headers=admin_h, timeout=30)
    if S.get('res_id'):
        requests.delete(f"{API}/coaching/admin/resources/{S['res_id']}", headers=admin_h, timeout=30)
    if S.get('cid'):
        requests.delete(f"{API}/coaching/coach/clients/{S['cid']}", headers=coach_h, timeout=30)


def ch():
    return S['cust_h']


# ---- plans ----
class TestPlans:
    def test_list_plans(self):
        r = requests.get(f"{API}/coaching/plans", timeout=30)
        assert r.status_code == 200
        plans = r.json()
        assert [p['tier'] for p in plans] == ['bronze', 'silver', 'gold']
        for p in plans:
            assert p['price_monthly'] > 0 and isinstance(p['features'], list) and p['modules']
            assert '_id' not in p
        S['plans'] = plans

    def test_admin_save_plans_roundtrip(self, admin_h):
        plans = S['plans']
        payload = [{k: p[k] for k in ('tier', 'name', 'price_monthly', 'tagline', 'features', 'modules')} for p in plans]
        r = requests.put(f"{API}/coaching/admin/plans", json=payload, headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text
        assert [p['price_monthly'] for p in r.json()] == [p['price_monthly'] for p in plans]

    def test_admin_save_plans_missing_tier(self, admin_h):
        payload = [{k: p[k] for k in ('tier', 'name', 'price_monthly', 'features', 'modules')} for p in S['plans'][:2]]
        r = requests.put(f"{API}/coaching/admin/plans", json=payload, headers=admin_h, timeout=30)
        assert r.status_code == 400

    def test_admin_save_plans_zero_price(self, admin_h):
        payload = [{k: p[k] for k in ('tier', 'name', 'price_monthly', 'features', 'modules')} for p in S['plans']]
        payload[0]['price_monthly'] = 0
        r = requests.put(f"{API}/coaching/admin/plans", json=payload, headers=admin_h, timeout=30)
        assert r.status_code == 400
        # verify nothing persisted
        assert requests.get(f"{API}/coaching/plans").json()[0]['price_monthly'] == S['plans'][0]['price_monthly']

    def test_admin_save_plans_requires_admin(self, coach_h):
        r = requests.put(f"{API}/coaching/admin/plans", json=[], headers=coach_h, timeout=30)
        assert r.status_code in (401, 403)


# ---- E2E membership ----
class TestMembershipE2E:
    def test_register_and_request_gold(self, coach_h):
        email = f"test_tier_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/auth/register", json={'email': email, 'password': 'Test1234!', 'first_name': 'TEST_Gold', 'last_name': 'Member'}, timeout=30)
        assert r.status_code in (200, 201), r.text
        S['email'] = email
        S['cust_h'] = {'Authorization': f"Bearer {r.json()['access_token']}"}
        r = requests.post(f"{API}/coaching/requests", json={'first_name': 'TEST_Gold', 'last_name': 'Member', 'email': email,
                          'area': 'weightloss', 'message': 'TEST', 'waiver_accepted': True, 'tier': 'gold'}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()['tier'] == 'gold'
        S['req_id'] = r.json()['id']
        m = requests.get(f"{API}/coaching/my/membership", headers=ch()).json()
        assert m['client_id'] is None and m['request']['tier'] == 'gold'

    def test_accept_creates_client(self, coach_h):
        r = requests.patch(f"{API}/coaching/coach/requests/{S['req_id']}", json={'status': 'accepted'}, headers=coach_h, timeout=30)
        assert r.status_code == 200, r.text
        clients = requests.get(f"{API}/coaching/coach/clients", headers=coach_h).json()
        c = next(c for c in clients if c['request_id'] == S['req_id'])
        assert c['tier'] == 'gold'
        S['cid'] = c['id']

    def test_paylink_and_replace(self, coach_h):
        r1 = requests.post(f"{API}/coaching/coach/clients/{S['cid']}/membership-paylink", json={'tier': 'gold', 'send_email': False}, headers=coach_h)
        assert r1.status_code == 200, r1.text
        r2 = requests.post(f"{API}/coaching/coach/clients/{S['cid']}/membership-paylink", json={'tier': 'gold', 'send_email': False}, headers=coach_h)
        assert r2.status_code == 200
        d = r2.json()
        assert d['payment_link'] == f"/paylink/{d['order_id']}" and d['amount'] == S['plans'][2]['price_monthly']
        S['orders'] = [r1.json()['order_id'], d['order_id']]
        S['order_id'] = d['order_id']
        # first order removed
        m = requests.get(f"{API}/coaching/my/membership", headers=ch()).json()
        assert m['active'] is False and m['pending_order']['id'] == d['order_id']

    def test_checkins_402_when_unpaid(self):
        r = requests.get(f"{API}/coaching/my/checkins", headers=ch())
        assert r.status_code == 402

    def test_mark_paid_activates(self, admin_h):
        r = requests.patch(f"{API}/orders/{S['order_id']}", json={'payment_status': 'paid'}, headers=admin_h)
        assert r.status_code == 200, r.text
        m = requests.get(f"{API}/coaching/my/membership", headers=ch()).json()
        assert m['active'] is True and m['tier'] == 'gold'
        assert 29 <= m['days_left'] <= 30
        assert 'resources' in m['modules'] and m['pending_order'] is None

    def test_submit_checkin_and_weighin(self):
        r = requests.post(f"{API}/coaching/my/checkins", json={'week_ending': '2026-06-14', 'weight_kg': 80, 'energy': 7, 'sleep': 6, 'training': 8, 'notes': 'ok'}, headers=ch())
        assert r.status_code == 200, r.text
        S['checkin_id'] = r.json()['id']
        assert r.json()['reviewed'] is False
        bad = requests.post(f"{API}/coaching/my/checkins", json={'week_ending': '2026-06-14', 'energy': 11}, headers=ch())
        assert bad.status_code == 400
        w = requests.get(f"{API}/coaching/my/weigh-ins", headers=ch()).json()
        assert any(e['date'] == '2026-06-14' and e['weight_kg'] == 80 for e in w['entries'])

    def test_coach_review_checkin(self, coach_h):
        lst = requests.get(f"{API}/coaching/coach/clients/{S['cid']}/checkins", headers=coach_h).json()
        assert any(c['id'] == S['checkin_id'] for c in lst)
        pend = requests.get(f"{API}/coaching/coach/checkins/pending", headers=coach_h).json()
        assert any(c['id'] == S['checkin_id'] for c in pend)
        r = requests.patch(f"{API}/coaching/coach/checkins/{S['checkin_id']}", json={'coach_reply': 'Great'}, headers=coach_h)
        assert r.status_code == 200 and r.json()['reviewed'] is True and r.json()['coach_reply'] == 'Great'
        pend = requests.get(f"{API}/coaching/coach/checkins/pending", headers=coach_h).json()
        assert not any(c['id'] == S['checkin_id'] for c in pend)
        mine = requests.get(f"{API}/coaching/my/checkins", headers=ch()).json()
        assert mine[0]['coach_reply'] == 'Great'

    def test_resources_gold(self, admin_h):
        r = requests.post(f"{API}/coaching/admin/resources", json={'title': 'TEST_Guide 1'}, headers=admin_h)
        assert r.status_code == 200, r.text
        S['res_id'] = r.json()['id']
        lst = requests.get(f"{API}/coaching/my/resources", headers=ch())
        assert lst.status_code == 200 and any(x['id'] == S['res_id'] for x in lst.json())

    def test_add_days(self, coach_h):
        before = requests.get(f"{API}/coaching/coach/clients/{S['cid']}/membership", headers=coach_h).json()
        r = requests.patch(f"{API}/coaching/coach/clients/{S['cid']}/membership", json={'add_days': 7}, headers=coach_h)
        assert r.status_code == 200
        b = datetime.fromisoformat(str(before['paid_until']).replace('Z', ''))
        a = datetime.fromisoformat(str(r.json()['paid_until']).replace('Z', ''))
        assert abs((a - b) - timedelta(days=7)) < timedelta(seconds=5)

    def test_silver_member_403_resources(self, coach_h):
        r = requests.patch(f"{API}/coaching/coach/clients/{S['cid']}/membership", json={'tier': 'silver'}, headers=coach_h)
        assert r.status_code == 200 and 'resources' not in r.json()['modules']
        assert requests.get(f"{API}/coaching/my/resources", headers=ch()).status_code == 403
        assert requests.get(f"{API}/coaching/my/checkins", headers=ch()).status_code == 200
        r = requests.patch(f"{API}/coaching/coach/clients/{S['cid']}/membership", json={'tier': 'bronze'}, headers=coach_h)
        assert requests.get(f"{API}/coaching/my/checkins", headers=ch()).status_code == 403
        requests.patch(f"{API}/coaching/coach/clients/{S['cid']}/membership", json={'tier': 'gold'}, headers=coach_h)


# ---- cron ----
class TestCron:
    def test_unauth(self):
        assert requests.post(f"{API}/coaching/cron/renewals", json={'run_id': 'x'}).status_code == 401
        assert requests.post(f"{API}/coaching/cron/renewals", json={'run_id': 'x'}, headers={'Authorization': 'Bearer wrong'}).status_code == 401

    def test_idempotent(self):
        h = {'Authorization': f"Bearer {CRON_SECRET}"}
        rid = f"TEST_{uuid.uuid4().hex}"
        r = requests.post(f"{API}/coaching/cron/renewals", json={'run_id': rid}, headers=h)
        assert r.status_code == 200 and r.json().get('queued') is True
        r = requests.post(f"{API}/coaching/cron/renewals", json={'run_id': rid}, headers=h)
        assert r.status_code == 200 and r.json().get('duplicate') is True

    def test_renewal_created(self, coach_h):
        if not S.get('cid'):
            pytest.skip('no client')
        pu = (datetime.utcnow() + timedelta(days=2)).isoformat()
        r = requests.patch(f"{API}/coaching/coach/clients/{S['cid']}/membership", json={'paid_until': pu}, headers=coach_h)
        assert r.status_code == 200 and r.json()['active'] is True
        h = {'Authorization': f"Bearer {CRON_SECRET}"}
        r = requests.post(f"{API}/coaching/cron/renewals", json={'run_id': f"TEST_{uuid.uuid4().hex}"}, headers=h)
        assert r.status_code == 200
        time.sleep(4)
        m = requests.get(f"{API}/coaching/my/membership", headers=ch()).json()
        assert m['active'] is True and m['pending_order'] is not None, m
        S['orders'].append(m['pending_order']['id'])
        assert m['pending_order']['tier'] == 'gold'
