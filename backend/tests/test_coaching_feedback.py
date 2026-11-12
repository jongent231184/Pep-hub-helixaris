# Coaching feedback loop + certificate journey summary (iteration 30)
import os
import uuid

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv('/app/frontend/.env')
load_dotenv('/app/backend/.env')
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api/coaching"
CLIENT_ID = '11af09ec-5139-4030-b565-8c43493892e4'

_mongo = MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
CREATED = {'feedback': [], 'certs': [], 'users': []}


def _login(email, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={'email': email, 'password': pw})
    if r.status_code != 200:
        pytest.skip(f'login failed {email}')
    s = requests.Session()
    s.headers.update({'Authorization': f"Bearer {r.json()['access_token']}"})
    return s


@pytest.fixture(scope='module')
def member():
    return _login('demo.member@ghp-health.com', 'DemoMember26')


@pytest.fixture(scope='module')
def coach():
    return _login('coachghp@gmail.com', 'CoachGHP26')


@pytest.fixture(scope='module')
def admin():
    return _login('admin@ghp-health.com', 'GHP-Health26')


@pytest.fixture(scope='module', autouse=True)
def cleanup(coach):
    yield
    for cid in CREATED['certs']:
        coach.delete(f"{API}/coach/certificates/{cid}")
    for fid in CREATED['feedback']:
        _mongo.coaching_feedback.delete_one({'id': fid})
    for uid in CREATED['users']:
        _mongo.users.delete_one({'id': uid})
    coach.delete(f"{API}/coach/clients/{CLIENT_ID}/feedback-request")


FULL = {'kind': 'end_of_plan', 'rating_overall': 5, 'rating_communication': 4, 'rating_clarity': 5,
        'rating_value': 4, 'nps': 9, 'went_well': 'TEST_went well', 'improve': 'TEST_improve',
        'goal_achieved': 'yes', 'testimonial': 'TEST_quote great coaching', 'allow_certificate': True,
        'allow_public': False}


class TestFeedbackFlow:
    state = {}

    def test_01_request_sets_pending(self, coach, member):
        r = coach.post(f"{API}/coach/clients/{CLIENT_ID}/feedback-request", json={'note': 'TEST_note'})
        assert r.status_code == 200 and r.json()['ok'] is True
        m = member.get(f"{API}/my/feedback").json()
        assert m['pending_request'] is True
        assert m['feedback_request_note'] == 'TEST_note'

    def test_02_cert_409_while_pending(self, coach):
        r = coach.post(f"{API}/coach/clients/{CLIENT_ID}/certificate", json={'send_email': False})
        assert r.status_code == 409

    def test_03_cert_skip_check_200(self, coach):
        r = coach.post(f"{API}/coach/clients/{CLIENT_ID}/certificate", json={'send_email': False, 'skip_feedback_check': True})
        assert r.status_code == 200, r.text
        CREATED['certs'].append(r.json()['id'])

    def test_04_portal_view_has_feedback(self, coach):
        r = coach.get(f"{API}/coach/clients/{CLIENT_ID}/portal-view")
        assert r.status_code == 200
        fb = r.json()['feedback']
        assert 'items' in fb and fb['pending_request'] is True

    def test_05_withdraw(self, coach, member):
        r = coach.delete(f"{API}/coach/clients/{CLIENT_ID}/feedback-request")
        assert r.status_code == 200
        assert member.get(f"{API}/my/feedback").json()['pending_request'] is False

    def test_06_validation(self, member):
        assert member.post(f"{API}/my/feedback", json={**FULL, 'rating_overall': 6}).status_code == 422
        assert member.post(f"{API}/my/feedback", json={**FULL, 'rating_overall': 0}).status_code == 422
        assert member.post(f"{API}/my/feedback", json={**FULL, 'nps': 11}).status_code == 422
        assert member.post(f"{API}/my/feedback", json={**FULL, 'goal_achieved': 'maybe'}).status_code == 400
        assert member.post(f"{API}/my/feedback", json={'went_well': 'x'}).status_code == 422

    def test_07_no_membership_403(self):
        email = f"test_fb_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{BASE_URL}/api/auth/register", json={'email': email, 'password': 'TestPass123!', 'first_name': 'TEST_'})
        assert r.status_code == 200, r.text
        CREATED['users'].append(r.json()['user']['id'])
        h = {'Authorization': f"Bearer {r.json()['access_token']}"}
        assert requests.post(f"{API}/my/feedback", json=FULL, headers=h).status_code == 403
        assert requests.get(f"{API}/my/feedback", headers=h).status_code == 403

    def test_08_submit_end_of_plan_clears_pending(self, coach, member):
        coach.post(f"{API}/coach/clients/{CLIENT_ID}/feedback-request", json={'note': 'TEST_note2'})
        assert member.get(f"{API}/my/feedback").json()['pending_request'] is True
        r = member.post(f"{API}/my/feedback", json=FULL)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d['kind'] == 'end_of_plan' and d['rating_overall'] == 5 and d['nps'] == 9
        assert '_id' not in d
        CREATED['feedback'].append(d['id'])
        self.state['fb_ok'] = d['id']
        assert member.get(f"{API}/my/feedback").json()['pending_request'] is False
        # coach list
        items = coach.get(f"{API}/coach/clients/{CLIENT_ID}/feedback").json()
        assert items['pending_request'] is False
        assert any(i['id'] == d['id'] for i in items['items'])

    def test_09_portal_view_pending_after_answer(self, coach):
        fb = coach.get(f"{API}/coach/clients/{CLIENT_ID}/portal-view").json()['feedback']
        # Should be consistent with /coach/clients/{id}/feedback which returns False after answer
        assert fb['pending_request'] is False, 'portal-view pending_request stays True after client answered'

    def test_10_admin_and_coach_summary(self, admin, coach):
        a = admin.get(f"{API}/admin/feedback")
        assert a.status_code == 200
        j = a.json()
        for k in ('count', 'nps', 'avg_overall', 'goals', 'public_testimonials'):
            assert k in j['summary']
        mine = [i for i in j['items'] if i['id'] == self.state['fb_ok']]
        assert mine and mine[0]['coach_name'] not in ('', '—')
        c = coach.get(f"{API}/coach/feedback")
        assert c.status_code == 200
        assert any(i['id'] == self.state['fb_ok'] for i in c.json()['items'])
        assert c.json()['summary']['count'] >= 1

    def test_11_member_forbidden_admin(self, member):
        assert member.get(f"{API}/admin/feedback").status_code in (401, 403)
        assert member.get(f"{API}/coach/feedback").status_code in (401, 403)

    def test_12_public_testimonials(self):
        r = requests.get(f"{API}/testimonials")
        assert r.status_code == 200
        ids = set()
        for t in r.json():
            assert set(t.keys()) <= {'id', 'first_name', 'testimonial', 'rating_overall', 'created_at'}
            assert ' ' not in t['first_name']
            ids.add(t['id'])
        assert self.state['fb_ok'] not in ids  # allow_public False
        for fid in ids:
            doc = _mongo.coaching_feedback.find_one({'id': fid})
            assert doc['allow_public'] is True

    def test_13_cert_feedback_not_allowed_400(self, member, coach):
        r = member.post(f"{API}/my/feedback", json={**FULL, 'kind': 'general', 'allow_certificate': False})
        assert r.status_code == 200
        CREATED['feedback'].append(r.json()['id'])
        c = coach.post(f"{API}/coach/clients/{CLIENT_ID}/certificate",
                       json={'send_email': False, 'feedback_id': r.json()['id']})
        assert c.status_code == 400

    def test_14_cert_with_quote_and_stats(self, coach):
        r = coach.post(f"{API}/coach/clients/{CLIENT_ID}/certificate",
                       json={'send_email': False, 'feedback_id': self.state['fb_ok'], 'stats': ['weeks', 'doses'],
                             'include_summary': True, 'summary_text': 'TEST_summary journey'})
        assert r.status_code == 200, r.text
        d = r.json()
        CREATED['certs'].append(d['id'])
        assert d['options']['review_text'] == FULL['testimonial']
        assert 'weeks_completed' in d['results']
        assert d['results']['weight_change_kg'] is None
        assert d['options']['summary_text'] == 'TEST_summary journey'
        pdf = coach.get(f"{BASE_URL}/api/coaching/certificates/{d['id']}/pdf")
        assert pdf.status_code == 200
        assert pdf.headers['content-type'].startswith('application/pdf')
        assert pdf.content[:4] == b'%PDF'
