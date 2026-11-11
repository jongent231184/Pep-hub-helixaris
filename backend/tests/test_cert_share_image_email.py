# Certificate share image (1080x1080 PNG), certificate email (send_email), PDF regression
import io
import subprocess
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


@pytest.fixture(scope='module')
def toks():
    t = {'admin': _login('admin@ghp-health.com', 'GHP-Health26'),
         'coach': _login('coachghp@gmail.com', 'CoachGHP26'),
         'member': _login(MEMBER_EMAIL, 'Portal123!')}
    em = f"test_other_{uuid.uuid4().hex[:6]}@example.com"
    r = requests.post(f"{API}/auth/register", json={'email': em, 'password': 'Test1234!', 'first_name': 'TEST_other', 'last_name': 'X'})
    t['other'] = r.json()['access_token']
    return t


@pytest.fixture(scope='module')
def cert_ids(toks):
    ids = []
    yield ids
    for c in ids:
        requests.delete(f"{API}/coaching/coach/certificates/{c}", headers=H(toks['coach']))


class TestShareImage:
    def test_issue_no_email_with_photos_and_image(self, toks, cert_ids):
        photos = requests.get(f"{API}/coaching/coach/clients/{CID}/photos", headers=H(toks['coach'])).json()
        assert len(photos) >= 2, photos
        r = requests.post(f"{API}/coaching/coach/clients/{CID}/certificate", headers=H(toks['coach']),
                          json={'send_email': False, 'include_photos': True, 'photo_ids': [p['id'] for p in photos[:2]],
                                'review_text': 'TEST_ Amazing programme, lost lots of weight and felt great throughout.'})
        assert r.status_code == 200, r.text
        c = r.json()
        cert_ids.append(c['id'])
        assert c['image_url'] == f"/api/coaching/certificates/{c['id']}/image"
        assert 'emailed_at' not in c and 'email_error' not in c
        assert 'image_path' not in c and 'storage_path' not in c and '_id' not in c
        for who in ('member', 'coach', 'admin'):
            g = requests.get(f"{API}/coaching/certificates/{c['id']}/image", headers=H(toks[who]))
            assert g.status_code == 200, who
            assert g.headers['content-type'] == 'image/png'
            assert g.content[:8] == b'\x89PNG\r\n\x1a\n'
            assert Image.open(io.BytesIO(g.content)).size == (1080, 1080)
        with open('/tmp/share_img.png', 'wb') as f:
            f.write(g.content)
        assert requests.get(f"{API}/coaching/certificates/{c['id']}/image", headers=H(toks['other'])).status_code == 404
        assert requests.get(f"{API}/coaching/certificates/{c['id']}/image").status_code in (401, 403)
        # PDF regression
        p = requests.get(f"{API}/coaching/certificates/{c['id']}/pdf", headers=H(toks['member']))
        assert p.status_code == 200 and p.content[:4] == b'%PDF'
        # list rows include image_url
        lst = requests.get(f"{API}/coaching/my/certificates", headers=H(toks['member'])).json()
        row = next(x for x in lst if x['id'] == c['id'])
        assert row['image_url'] and 'emailed_at' not in row

    def test_image_404_unknown(self, toks):
        assert requests.get(f"{API}/coaching/certificates/nope/image", headers=H(toks['admin'])).status_code == 404


class TestCertEmail:
    def test_email_example_com_error(self, toks, cert_ids):
        r = requests.post(f"{API}/coaching/coach/clients/{CID}/certificate", headers=H(toks['coach']),
                          json={'send_email': True, 'coach_note': 'TEST_ note'})
        assert r.status_code == 200, r.text
        c = r.json()
        cert_ids.append(c['id'])
        print('email_error:', c.get('email_error'))
        assert 'emailed_at' not in c
        assert 'Invalid `to`' in (c.get('email_error') or '')
        row = next(x for x in requests.get(f"{API}/coaching/coach/clients/{CID}/certificates", headers=H(toks['coach'])).json() if x['id'] == c['id'])
        assert not row.get('emailed_at')

    def test_default_send_email_true(self, toks, cert_ids):
        r = requests.post(f"{API}/coaching/coach/clients/{CID}/certificate", headers=H(toks['coach']), json={})
        assert r.status_code == 200
        c = r.json()
        cert_ids.append(c['id'])
        assert c.get('email_error')  # default attempted email

    def test_email_real_domain_sent(self, toks, cert_ids):
        em = f"certtest+{uuid.uuid4().hex[:6]}@ghp-health.com"
        rq = requests.post(f"{API}/coaching/requests", json={'first_name': 'TEST_cert', 'last_name': 'Mail', 'email': em, 'area': 'weightloss',
                                                             'waiver_accepted': True, 'tier': 'silver'})
        assert rq.status_code == 200, rq.text
        rq = rq.json()
        requests.patch(f"{API}/coaching/coach/requests/{rq['id']}", json={'status': 'accepted'}, headers=H(toks['coach']))
        cid = next(c['id'] for c in requests.get(f"{API}/coaching/coach/clients", headers=H(toks['coach'])).json() if c.get('request_id') == rq['id'])
        try:
            r = requests.post(f"{API}/coaching/coach/clients/{cid}/certificate", headers=H(toks['coach']),
                              json={'send_email': True, 'coach_note': 'TEST_ well done'})
            assert r.status_code == 200, r.text
            c = r.json()
            cert_ids.append(c['id'])
            print('real-domain resp:', {k: c.get(k) for k in ('emailed_at', 'email_error')})
            assert c.get('emailed_at') and not c.get('email_error')
            row = next(x for x in requests.get(f"{API}/coaching/coach/clients/{cid}/certificates", headers=H(toks['coach'])).json() if x['id'] == c['id'])
            assert row.get('emailed_at')
            time.sleep(1)
            log = subprocess.run("grep -h 'certificate email sent to " + em + "' /var/log/supervisor/backend.*.log | tail -1",
                                 shell=True, capture_output=True, text=True).stdout
            print('log:', log)
            assert em in log
        finally:
            requests.delete(f"{API}/coaching/coach/clients/{cid}", headers=H(toks['coach']))
