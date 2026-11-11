# Owner KPIs, coach earnings incl. memberships, private progress photos, completion certificates
import io
import time
import uuid

import pytest
import requests
from dotenv import dotenv_values
from PIL import Image

API = dotenv_values('/app/frontend/.env')['REACT_APP_BACKEND_URL'].rstrip('/') + '/api'
MEMBER_EMAIL = open('/tmp/member_email.txt').read().strip()
CID = open('/tmp/cid.txt').read().strip()


def _login(e, p):
    r = requests.post(f"{API}/auth/login", json={'email': e, 'password': p})
    assert r.status_code == 200, r.text
    return r.json()['access_token']


def H(t):
    return {'Authorization': f'Bearer {t}'}


def _jpg():
    b = io.BytesIO()
    Image.new('RGB', (60, 80), (200, 120, 40)).save(b, 'JPEG')
    return b.getvalue()


@pytest.fixture(scope='module')
def toks():
    t = {'admin': _login('admin@ghp-health.com', 'GHP-Health26'),
         'coach': _login('coachghp@gmail.com', 'CoachGHP26'),
         'member': _login(MEMBER_EMAIL, 'Portal123!')}
    # other customer
    em = f"test_other_{uuid.uuid4().hex[:6]}@example.com"
    r = requests.post(f"{API}/auth/register", json={'email': em, 'password': 'Test1234!', 'first_name': 'TEST_other', 'last_name': 'X'})
    t['other'] = r.json()['access_token']
    # other coach
    ce = f"test_coach3+{int(time.time()*1000)}@example.com"
    r = requests.post(f"{API}/coaching/admin/coaches", headers=H(t['admin']),
                      json={'email': ce, 'password': 'CoachThree26!', 'first_name': 'TEST', 'last_name': 'Coach', 'default_price': 9.99})
    assert r.status_code == 200, r.text
    t['other_coach_id'] = r.json()['id']
    t['other_coach'] = _login(ce, 'CoachThree26!')
    # pending (unpaid) member
    pe = f"test_pending_{uuid.uuid4().hex[:6]}@example.com"
    pt = requests.post(f"{API}/auth/register", json={'email': pe, 'password': 'Test1234!', 'first_name': 'TEST_pend', 'last_name': 'UI'}).json()['access_token']
    rq = requests.post(f"{API}/coaching/requests", json={'first_name': 'TEST_pend', 'last_name': 'UI', 'email': pe, 'area': 'weightloss', 'waiver_accepted': True, 'tier': 'gold'}).json()
    requests.patch(f"{API}/coaching/coach/requests/{rq['id']}", json={'status': 'accepted'}, headers=H(t['coach']))
    pcid = next(c['id'] for c in requests.get(f"{API}/coaching/coach/clients", headers=H(t['coach'])).json() if c.get('request_id') == rq['id'])
    requests.post(f"{API}/coaching/coach/clients/{pcid}/membership-paylink", json={'tier': 'gold', 'send_email': False}, headers=H(t['coach']))
    t['pending'] = pt
    t['pending_cid'] = pcid
    yield t
    requests.delete(f"{API}/coaching/coach/clients/{pcid}", headers=H(t['coach']))
    requests.delete(f"{API}/coaching/admin/coaches/{t['other_coach_id']}", headers=H(t['admin']))


# ---- KPIs ----
class TestKpis:
    def test_kpis_admin(self, toks):
        r = requests.get(f"{API}/coaching/admin/kpis", headers=H(toks['admin']))
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ('members', 'plans_purchased', 'revenue', 'monthly', 'requests', 'engagement'):
            assert k in d
        assert isinstance(d['plans_purchased']['by_tier'], list)
        for k in ('this_month', 'last_30_days', 'all_time'):
            assert isinstance(d['revenue'][k], (int, float))
        assert len(d['monthly']) == 6
        assert len({m['month'] for m in d['monthly']}) == 6
        assert 'conversion_pct' in d['requests']
        assert d['engagement']['photos_uploaded'] >= 0

    @pytest.mark.parametrize('who', ['member', 'coach', 'other'])
    def test_kpis_forbidden(self, toks, who):
        r = requests.get(f"{API}/coaching/admin/kpis", headers=H(toks[who]))
        assert r.status_code in (401, 403)

    def test_coach_earnings_include_membership(self, toks):
        from pymongo import MongoClient
        e = dotenv_values('/app/backend/.env')
        db = MongoClient(e['MONGO_URL'])[e['DB_NAME']]
        coach = db.users.find_one({'email': 'coachghp@gmail.com'})
        mem = sum(float(o.get('total') or 0) for o in db.orders.find({'purpose': 'coaching_membership', 'payment_status': 'paid', 'coach_user_id': coach['id']}))
        r = requests.get(f"{API}/coaching/admin/coach-earnings", headers=H(toks['admin']))
        assert r.status_code == 200
        row = next(x for x in r.json() if x['user']['email'] == 'coachghp@gmail.com')
        print('earnings', row['earnings'], 'membership sum', mem)
        gross = row['earnings'].get('gross_total', row['earnings'].get('total_gross'))
        assert gross is not None and gross >= mem
        det = requests.get(f"{API}/coaching/admin/coach-earnings/{coach['id']}", headers=H(toks['admin'])).json()
        assert sum(1 for o in det['orders'] if o.get('purpose') == 'coaching_membership') >= 1


# ---- photos ----
class TestPhotos:
    def test_photo_lifecycle(self, toks):
        r = requests.post(f"{API}/coaching/my/photos", params={'caption': 'TEST_week1'}, headers=H(toks['member']),
                          files={'file': ('p.jpg', _jpg(), 'image/jpeg')})
        assert r.status_code == 200, r.text
        p = r.json()
        assert p['caption'] == 'TEST_week1' and p['url'].endswith(p['id']) and 'storage_path' not in p and '_id' not in p
        pid = p['id']
        lst = requests.get(f"{API}/coaching/my/photos", headers=H(toks['member'])).json()
        assert any(x['id'] == pid for x in lst)
        r = requests.get(f"{API}/coaching/photos/{pid}", headers=H(toks['member']))
        assert r.status_code == 200 and r.content[:2] == b'\xff\xd8' and r.headers['content-type'].startswith('image/')
        assert requests.get(f"{API}/coaching/photos/{pid}", headers=H(toks['coach'])).status_code == 200
        assert requests.get(f"{API}/coaching/photos/{pid}", headers=H(toks['admin'])).status_code == 404
        assert requests.get(f"{API}/coaching/photos/{pid}", headers=H(toks['other'])).status_code == 404
        assert requests.get(f"{API}/coaching/photos/{pid}", headers=H(toks['other_coach'])).status_code == 404
        cl = requests.get(f"{API}/coaching/coach/clients/{CID}/photos", headers=H(toks['coach']))
        assert cl.status_code == 200 and any(x['id'] == pid for x in cl.json())
        assert requests.get(f"{API}/coaching/coach/clients/{CID}/photos", headers=H(toks['other_coach'])).status_code == 404
        assert requests.delete(f"{API}/coaching/my/photos/{pid}", headers=H(toks['member'])).status_code == 200
        assert requests.get(f"{API}/coaching/photos/{pid}", headers=H(toks['member'])).status_code == 404
        assert requests.delete(f"{API}/coaching/my/photos/{pid}", headers=H(toks['member'])).status_code == 404

    def test_non_image_rejected(self, toks):
        r = requests.post(f"{API}/coaching/my/photos", headers=H(toks['member']), files={'file': ('a.txt', b'hello', 'text/plain')})
        assert r.status_code == 400

    def test_pending_member_402(self, toks):
        assert requests.get(f"{API}/coaching/my/photos", headers=H(toks['pending'])).status_code == 402
        r = requests.post(f"{API}/coaching/my/photos", headers=H(toks['pending']), files={'file': ('p.jpg', _jpg(), 'image/jpeg')})
        assert r.status_code == 402

    def test_plain_customer_403(self, toks):
        assert requests.get(f"{API}/coaching/my/photos", headers=H(toks['other'])).status_code == 403

    def test_other_member_cannot_delete(self, toks):
        r = requests.post(f"{API}/coaching/my/photos", headers=H(toks['member']), files={'file': ('p.jpg', _jpg(), 'image/jpeg')})
        pid = r.json()['id']
        try:
            # pending member is 402 before reaching delete; plain customer 403
            assert requests.delete(f"{API}/coaching/my/photos/{pid}", headers=H(toks['other'])).status_code in (402, 403, 404)
            assert requests.get(f"{API}/coaching/photos/{pid}", headers=H(toks['member'])).status_code == 200
        finally:
            requests.delete(f"{API}/coaching/my/photos/{pid}", headers=H(toks['member']))


# ---- certificates ----
class TestCertificates:
    def test_certificate_flow(self, toks):
        ph = requests.post(f"{API}/coaching/my/photos", headers=H(toks['member']), files={'file': ('p.jpg', _jpg(), 'image/jpeg')}).json()
        try:
            r = requests.post(f"{API}/coaching/coach/clients/{CID}/certificate", headers=H(toks['coach']),
                              json={'include_photos': True, 'photo_ids': [ph['id']], 'review_text': 'TEST_ great', 'coach_note': 'TEST_ note', 'anonymise': True})
            assert r.status_code == 200, r.text
            c = r.json()
            assert c['pdf_url'] == f"/api/coaching/certificates/{c['id']}/pdf"
            assert ' ' not in c['name_shown'] and c['name_shown'] != 'A valued client'
            assert isinstance(c['results'], dict) and 'checkins' in c['results']
            assert 'storage_path' not in c and '_id' not in c
            cert = c['id']
            for who in ('member', 'coach', 'admin'):
                p = requests.get(f"{API}/coaching/certificates/{cert}/pdf", headers=H(toks[who]))
                assert p.status_code == 200, who
                assert p.headers['content-type'].startswith('application/pdf') and p.content[:4] == b'%PDF'
            assert requests.get(f"{API}/coaching/certificates/{cert}/pdf", headers=H(toks['other'])).status_code == 404
            assert requests.get(f"{API}/coaching/certificates/{cert}/pdf", headers=H(toks['other_coach'])).status_code == 404
            assert any(x['id'] == cert for x in requests.get(f"{API}/coaching/my/certificates", headers=H(toks['member'])).json())
            assert any(x['id'] == cert for x in requests.get(f"{API}/coaching/coach/clients/{CID}/certificates", headers=H(toks['coach'])).json())
            assert requests.get(f"{API}/coaching/coach/clients/{CID}/certificates", headers=H(toks['other_coach'])).status_code == 404
            assert requests.post(f"{API}/coaching/coach/clients/{CID}/certificate", headers=H(toks['other_coach']), json={}).status_code == 404
            assert requests.delete(f"{API}/coaching/coach/certificates/{cert}", headers=H(toks['other_coach'])).status_code == 404
            assert requests.delete(f"{API}/coaching/coach/certificates/{cert}", headers=H(toks['coach'])).status_code == 200
            assert requests.get(f"{API}/coaching/certificates/{cert}/pdf", headers=H(toks['member'])).status_code == 404
        finally:
            requests.delete(f"{API}/coaching/my/photos/{ph['id']}", headers=H(toks['member']))

    def test_no_identity(self, toks):
        r = requests.post(f"{API}/coaching/coach/clients/{CID}/certificate", headers=H(toks['coach']), json={'include_identity': False, 'include_results': False})
        assert r.status_code == 200
        c = r.json()
        assert c['name_shown'] == 'A valued client' and c['results'] is None
        assert requests.delete(f"{API}/coaching/coach/certificates/{c['id']}", headers=H(toks['coach'])).status_code == 200

    def test_member_cannot_issue(self, toks):
        r = requests.post(f"{API}/coaching/coach/clients/{CID}/certificate", headers=H(toks['member']), json={})
        assert r.status_code in (401, 403)

    def test_plain_customer_certs_empty(self, toks):
        r = requests.get(f"{API}/coaching/my/certificates", headers=H(toks['other']))
        assert r.status_code == 200 and r.json() == []
