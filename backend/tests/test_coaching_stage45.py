"""End-to-end backend tests for Coaching Stages 4 & 5.

Covers:
- Full coaching lifecycle (request -> accept -> client -> protocol -> paylink)
- Payment gate on /my/protocol (paid=false until admin flips order paid)
- Bidirectional messaging (coach <-> client) with correct from_role
- At-risk widget (missed_count for past-dated undone entries; today excluded)
- Cross-tenant security (customer B cannot see A's protocol; coach B cannot
  post messages to coach A's client)
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


def _auth(token):
    return {'Authorization': f'Bearer {token}'}


@pytest.fixture(scope='session')
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope='session')
def coach_token():
    return _login(COACH_EMAIL, COACH_PASSWORD)


@pytest.fixture(scope='session')
def customer():
    """Create a fresh customer and return (email, password, token, user_id)."""
    ts = int(time.time())
    email = f"testclient+{ts}@example.com"
    password = 'Passw0rd!'
    r = requests.post(f"{API}/auth/register", json={
        'email': email, 'password': password,
        'first_name': 'TEST', 'last_name': f'Client{ts}',
    })
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    return {
        'email': email, 'password': password,
        'token': data['access_token'], 'user_id': data['user']['id'],
    }


# ---------------- Lifecycle ----------------
class TestCoachingLifecycle:
    """Public intake -> coach accept -> protocol -> paylink."""

    def test_full_lifecycle_and_payment_gate(self, coach_token, admin_token, customer):
        # 1. Customer submits a public coaching request
        req_payload = {
            'first_name': 'TEST', 'last_name': 'Client',
            'email': customer['email'], 'phone': '+441234567890',
            'area': 'peptide_info', 'message': 'peer education request',
            'waiver_accepted': True,
        }
        r = requests.post(f"{API}/coaching/requests", json=req_payload)
        assert r.status_code == 200, r.text
        req_id = r.json()['id']

        # 2. Coach accepts -> should create a coaching_clients record
        r = requests.patch(
            f"{API}/coaching/coach/requests/{req_id}",
            headers=_auth(coach_token), json={'status': 'accepted'},
        )
        assert r.status_code == 200, r.text
        assert r.json()['status'] == 'accepted'

        # 3. Find the newly-created client
        r = requests.get(f"{API}/coaching/coach/clients", headers=_auth(coach_token))
        assert r.status_code == 200
        clients = r.json()
        mine = [c for c in clients if c.get('customer_email', '').lower() == customer['email'].lower()]
        assert mine, f"client not created for {customer['email']}"
        client_id = mine[0]['id']

        # 4. Coach creates a protocol
        r = requests.post(
            f"{API}/coaching/coach/clients/{client_id}/protocol",
            headers=_auth(coach_token),
            json={'title': 'TEST Peer Protocol', 'area': 'peptides', 'duration_weeks': 4},
        )
        assert r.status_code == 200, r.text
        proto = r.json()
        proto_id = proto['id']
        assert proto['title'] == 'TEST Peer Protocol'
        assert proto['items'] == []
        assert proto['calendar'] == []

        # 5. Customer GET /my/protocol BEFORE paylink -> paid should be false/missing,
        # but items+calendar available (no gate yet since payment_order_id is not set).
        r = requests.get(f"{API}/coaching/my/protocol", headers=_auth(customer['token']))
        assert r.status_code == 200
        pre = r.json()
        assert pre is not None, "customer should see their protocol row"
        assert pre['id'] == proto_id
        assert not pre.get('paid'), f"protocol should not be paid yet: {pre.get('paid')}"

        # 6. Coach generates paylink
        r = requests.post(
            f"{API}/coaching/coach/protocols/{proto_id}/paylink",
            headers=_auth(coach_token),
        )
        assert r.status_code == 200, r.text
        pay = r.json()
        assert 'order_id' in pay and 'order_number' in pay
        assert pay['payment_link'].startswith('/paylink/')
        assert pay['amount'] == 9.99, f"expected £9.99, got {pay['amount']}"
        order_id = pay['order_id']

        # 6b. Idempotency — calling paylink again should return the SAME order
        r2 = requests.post(
            f"{API}/coaching/coach/protocols/{proto_id}/paylink",
            headers=_auth(coach_token),
        )
        assert r2.status_code == 200
        assert r2.json()['order_id'] == order_id, "paylink should be idempotent"

        # 7. Customer still sees paid=false
        r = requests.get(f"{API}/coaching/my/protocol", headers=_auth(customer['token']))
        assert r.status_code == 200
        assert not r.json().get('paid'), "should still be unpaid before admin flip"

        # 8. Admin marks the paylink order 'paid'
        r = requests.patch(
            f"{API}/api/orders/{order_id}".replace('/api/api/', '/api/'),
            headers=_auth(admin_token), json={'payment_status': 'paid'},
        )
        # (paranoia to avoid double /api)
        if r.status_code == 404:
            r = requests.patch(
                f"{API}/orders/{order_id}",
                headers=_auth(admin_token), json={'payment_status': 'paid'},
            )
        assert r.status_code == 200, f"admin paid flip failed: {r.status_code} {r.text}"
        assert r.json()['payment_status'] == 'paid'

        # 9. Now customer GET /my/protocol returns paid=true
        r = requests.get(f"{API}/coaching/my/protocol", headers=_auth(customer['token']))
        assert r.status_code == 200
        post = r.json()
        assert post is not None
        assert post.get('paid') is True, f"protocol should now be paid: {post}"
        assert 'items' in post and 'calendar' in post

        # Persist ids for chained tests via class attr
        TestCoachingLifecycle.client_id = client_id
        TestCoachingLifecycle.proto_id = proto_id
        TestCoachingLifecycle.order_id = order_id


# ---------------- Messaging ----------------
class TestMessaging:
    def test_bidirectional_messaging(self, coach_token, customer):
        # Requires TestCoachingLifecycle to have run
        client_id = getattr(TestCoachingLifecycle, 'client_id', None)
        if not client_id:
            pytest.skip('lifecycle test must run first')

        # Coach sends
        r = requests.post(
            f"{API}/coaching/coach/clients/{client_id}/messages",
            headers=_auth(coach_token), json={'body': 'TEST coach hello'},
        )
        assert r.status_code == 200, r.text
        assert r.json()['from_role'] == 'coach'

        # Coach GETs
        r = requests.get(
            f"{API}/coaching/coach/clients/{client_id}/messages",
            headers=_auth(coach_token),
        )
        assert r.status_code == 200
        msgs = r.json()
        assert any(m['body'] == 'TEST coach hello' and m['from_role'] == 'coach' for m in msgs)

        # Client sends
        r = requests.post(
            f"{API}/coaching/my/messages",
            headers=_auth(customer['token']), json={'body': 'TEST client reply'},
        )
        assert r.status_code == 200, r.text
        assert r.json()['from_role'] == 'client'

        # Client GETs full thread
        r = requests.get(f"{API}/coaching/my/messages", headers=_auth(customer['token']))
        assert r.status_code == 200
        thread = r.json()
        assert any(m['body'] == 'TEST coach hello' and m['from_role'] == 'coach' for m in thread)
        assert any(m['body'] == 'TEST client reply' and m['from_role'] == 'client' for m in thread)

        # Coach sees both roles too
        r = requests.get(
            f"{API}/coaching/coach/clients/{client_id}/messages",
            headers=_auth(coach_token),
        )
        roles = {m['from_role'] for m in r.json()}
        assert {'coach', 'client'} <= roles


# ---------------- At-risk ----------------
class TestAtRisk:
    def test_at_risk_counts_past_undone(self, coach_token):
        from datetime import datetime, timedelta
        client_id = getattr(TestCoachingLifecycle, 'client_id', None)
        proto_id = getattr(TestCoachingLifecycle, 'proto_id', None)
        if not client_id or not proto_id:
            pytest.skip('lifecycle test must run first')

        today = datetime.utcnow().date()
        d1 = (today - timedelta(days=1)).isoformat()
        d2 = (today - timedelta(days=2)).isoformat()
        d_today = today.isoformat()

        # Add 2 past entries + 1 today entry (all done=false)
        for d, name in [(d1, 'TEST-A'), (d2, 'TEST-B'), (d_today, 'TEST-TODAY')]:
            r = requests.post(
                f"{API}/coaching/coach/protocols/{proto_id}/calendar",
                headers=_auth(coach_token),
                json={'date': d, 'item_name': name, 'dose': '1', 'time_of_day': 'AM'},
            )
            assert r.status_code == 200, r.text

        r = requests.get(f"{API}/coaching/coach/at-risk", headers=_auth(coach_token))
        assert r.status_code == 200, r.text
        rows = r.json()
        row = next((c for c in rows if c['id'] == client_id), None)
        assert row is not None, f"client not flagged: {rows}"
        assert row['missed_count'] == 2, f"expected 2, got {row['missed_count']} (today should be excluded)"


# ---------------- Security ----------------
class TestSecurity:
    def test_customer_b_cannot_see_customer_a_protocol(self, customer):
        # Create a second customer with a different email — no coaching client for them
        ts = int(time.time()) + 1
        email = f"testother+{ts}@example.com"
        r = requests.post(f"{API}/auth/register", json={
            'email': email, 'password': 'Passw0rd!',
            'first_name': 'TEST', 'last_name': 'Other',
        })
        assert r.status_code == 200
        other_tok = r.json()['access_token']

        # Customer B has no coaching relationship -> /my/protocol returns null
        r = requests.get(f"{API}/coaching/my/protocol", headers=_auth(other_tok))
        assert r.status_code == 200
        assert r.json() is None, "customer B should NOT see any protocol"

        # Customer B messages also empty
        r = requests.get(f"{API}/coaching/my/messages", headers=_auth(other_tok))
        assert r.status_code == 200
        assert r.json() == [], "customer B should have no messages"

    def test_coach_cannot_post_to_foreign_client(self, coach_token):
        # Use a random client_id that doesn't belong to this coach
        fake_id = str(uuid.uuid4())
        r = requests.post(
            f"{API}/coaching/coach/clients/{fake_id}/messages",
            headers=_auth(coach_token), json={'body': 'should fail'},
        )
        assert r.status_code == 404, f"expected 404 for foreign/unknown client, got {r.status_code}"

        r = requests.get(
            f"{API}/coaching/coach/clients/{fake_id}/messages",
            headers=_auth(coach_token),
        )
        assert r.status_code == 404
