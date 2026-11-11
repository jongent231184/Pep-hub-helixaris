# Helper (not a test): creates TEST_ gold (active, protocol) + TEST_ lapsed members for coach view-as-client UI tests
import json
import uuid
from datetime import datetime, timedelta
import requests
from dotenv import dotenv_values

API = dotenv_values('/app/frontend/.env')['REACT_APP_BACKEND_URL'].rstrip('/') + '/api'


def login(e, p):
    return {'Authorization': 'Bearer ' + requests.post(f"{API}/auth/login", json={'email': e, 'password': p}).json()['access_token']}


coach = login('coachghp@gmail.com', 'CoachGHP26')
out = {'coach_token': coach['Authorization'][7:]}
for kind, days in (('gold', 20), ('lapsed', -3)):
    email = f"test_cv_{kind}_{uuid.uuid4().hex[:6]}@example.com"
    r = requests.post(f"{API}/auth/register", json={'email': email, 'password': 'Test1234!', 'first_name': f'TEST_CV{kind}', 'last_name': 'UI'})
    tok = r.json()['access_token']
    rq = requests.post(f"{API}/coaching/requests", json={'first_name': f'TEST_CV{kind}', 'last_name': 'UI', 'email': email, 'area': 'weightloss', 'waiver_accepted': True, 'tier': 'gold'}).json()
    requests.patch(f"{API}/coaching/coach/requests/{rq['id']}", json={'status': 'accepted'}, headers=coach)
    cid = next(c['id'] for c in requests.get(f"{API}/coaching/coach/clients", headers=coach).json() if c['request_id'] == rq['id'])
    requests.patch(f"{API}/coaching/coach/clients/{cid}/membership", json={'tier': 'gold', 'paid_until': (datetime.utcnow() + timedelta(days=days)).isoformat()}, headers=coach)
    out[kind] = {'email': email, 'token': tok, 'cid': cid}
p = requests.post(f"{API}/coaching/coach/clients/{out['gold']['cid']}/protocol", json={'title': 'TEST_ CV protocol', 'duration_weeks': 4}, headers=coach).json()
out['gold']['proto_id'] = p['id']
requests.post(f"{API}/coaching/my/messages", json={'body': 'TEST_ question from client'}, headers={'Authorization': 'Bearer ' + out['gold']['token']})
json.dump(out, open('/tmp/coach_view_members.json', 'w'))
print({k: v['cid'] for k, v in out.items() if isinstance(v, dict)})
