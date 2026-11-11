# Helper (not a test): creates TEST_ gold member, pending-unpaid member, and plain customer for UI tests
import json
import uuid
import requests
from dotenv import dotenv_values

API = dotenv_values('/app/frontend/.env')['REACT_APP_BACKEND_URL'].rstrip('/') + '/api'


def login(e, p):
    return {'Authorization': 'Bearer ' + requests.post(f"{API}/auth/login", json={'email': e, 'password': p}).json()['access_token']}


admin = login('admin@ghp-health.com', 'GHP-Health26')
coach = login('coachghp@gmail.com', 'CoachGHP26')
out = {}
for kind in ('gold', 'pending', 'plain'):
    email = f"test_ui_{kind}_{uuid.uuid4().hex[:6]}@example.com"
    r = requests.post(f"{API}/auth/register", json={'email': email, 'password': 'Test1234!', 'first_name': f'TEST_{kind}', 'last_name': 'UI'})
    d = {'email': email, 'token': r.json()['access_token']}
    if kind != 'plain':
        rq = requests.post(f"{API}/coaching/requests", json={'first_name': f'TEST_{kind}', 'last_name': 'UI', 'email': email, 'area': 'weightloss', 'waiver_accepted': True, 'tier': 'gold'}).json()
        requests.patch(f"{API}/coaching/coach/requests/{rq['id']}", json={'status': 'accepted'}, headers=coach)
        cid = next(c['id'] for c in requests.get(f"{API}/coaching/coach/clients", headers=coach).json() if c['request_id'] == rq['id'])
        pl = requests.post(f"{API}/coaching/coach/clients/{cid}/membership-paylink", json={'tier': 'gold', 'send_email': False}, headers=coach).json()
        d.update(cid=cid, order_id=pl['order_id'])
        if kind == 'gold':
            requests.patch(f"{API}/orders/{pl['order_id']}", json={'payment_status': 'paid'}, headers=admin)
            requests.get(f"{API}/coaching/my/membership", headers={'Authorization': 'Bearer ' + d['token']})
    out[kind] = d
out['silver_token'] = requests.post(f"{API}/auth/login", json={'email': 'portal.test+bbbc6c@example.com', 'password': 'Portal123!'}).json().get('access_token')
json.dump(out, open('/tmp/ui_members.json', 'w'))
print({k: (v['email'] if isinstance(v, dict) else bool(v)) for k, v in out.items()})
