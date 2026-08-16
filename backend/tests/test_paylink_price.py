"""Backend tests for POST /api/coaching/coach/protocols/{id}/paylink with
optional {price} override — Iteration 14 feature.

Cases:
  1. Happy path — override price 25 stored on protocol & order.
  2. Fallback — empty body uses coach default_price (9.99).
  3. Regenerate — second POST with new price deletes old order, creates new.
  4. Paid guard — after admin flips order to paid, POST 400s.
  5. Validation — price<=0 must 400.
  6. Authz — foreign coach + unauth get 401/403/404.

Uses seeded coach (coachghp@gmail.com) and admin. Creates disposable
customers so Jon Gent's protocol is never touched.
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
    ts = int(time.time() * 1000)
    email = f"testpay+{tag}{ts}{uuid.uuid4().hex[:4]}@example.com"
    r = requests.post(f"{API}/auth/register", json={
        'email': email, 'password': 'Passw0rd!',
        'first_name': 'TEST', 'last_name': f'Pay{tag}',
    })
    assert r.status_code == 200, r.text

    r = requests.post(f"{API}/coaching/requests", json={
        'first_name': 'TEST', 'last_name': f'Pay{tag}', 'email': email,
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
    return mine[0]['id'], email


def _create_proto(coach_token, client_id, weeks=4):
    r = requests.post(f"{API}/coaching/coach/clients/{client_id}/protocol",
                      headers=_auth(coach_token),
                      json={'title': f'TEST Paylink {weeks}w', 'duration_weeks': weeks})
    assert r.status_code == 200, r.text
    return r.json()['id']


# ---------------- 1. Happy path ----------------
class TestHappyPath:
    def test_override_price_persists_on_proto_and_order(self, coach_token):
        client_id, _ = _make_client(coach_token, 'hp')
        proto_id = _create_proto(coach_token, client_id)

        r = requests.post(f"{API}/coaching/coach/protocols/{proto_id}/paylink",
                          headers=_auth(coach_token), json={'price': 25})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data['amount'] == 25, data
        assert data.get('payment_link', '').startswith('/paylink/')
        order_id = data['order_id']

        # GET the order via public paylink endpoint /orders/pay/{id}
        r2 = requests.get(f"{API}/orders/pay/{order_id}")
        assert r2.status_code == 200, r2.text
        order = r2.json()
        assert order['subtotal'] == 25
        assert order['total'] == 25
        assert order['items'][0]['price'] == 25

        # Verify proto.price stored
        r3 = requests.get(f"{API}/coaching/coach/clients/{client_id}",
                          headers=_auth(coach_token))
        assert r3.status_code == 200
        assert r3.json()['protocol']['price'] == 25


# ---------------- 2. Fallback ----------------
class TestFallback:
    def test_empty_body_uses_default_price(self, coach_token):
        # Coach default_price is seeded at 9.99 per playbook
        client_id, _ = _make_client(coach_token, 'fb')
        proto_id = _create_proto(coach_token, client_id)

        r = requests.post(f"{API}/coaching/coach/protocols/{proto_id}/paylink",
                          headers=_auth(coach_token), json={})
        assert r.status_code == 200, r.text
        assert r.json()['amount'] == 9.99, r.json()


# ---------------- 3. Regenerate ----------------
class TestRegenerate:
    def test_second_post_replaces_previous_order(self, coach_token):
        client_id, _ = _make_client(coach_token, 'rg')
        proto_id = _create_proto(coach_token, client_id)

        r = requests.post(f"{API}/coaching/coach/protocols/{proto_id}/paylink",
                          headers=_auth(coach_token), json={'price': 15})
        assert r.status_code == 200
        first_order_id = r.json()['order_id']
        assert r.json()['amount'] == 15

        r2 = requests.post(f"{API}/coaching/coach/protocols/{proto_id}/paylink",
                           headers=_auth(coach_token), json={'price': 40})
        assert r2.status_code == 200, r2.text
        second = r2.json()
        assert second['amount'] == 40
        assert second['order_id'] != first_order_id, "regen must produce new order id"

        # Old order deleted
        r_old = requests.get(f"{API}/orders/pay/{first_order_id}")
        assert r_old.status_code == 404, f"old order should be gone, got {r_old.status_code}"

        # New order total=40
        r_new = requests.get(f"{API}/orders/pay/{second['order_id']}")
        assert r_new.status_code == 200
        assert r_new.json()['total'] == 40

        # proto.payment_order_id updated
        r3 = requests.get(f"{API}/coaching/coach/clients/{client_id}",
                          headers=_auth(coach_token))
        assert r3.json()['protocol']['payment_order_id'] == second['order_id']
        assert r3.json()['protocol']['price'] == 40


# ---------------- 4. Paid guard ----------------
class TestPaidGuard:
    def test_cannot_regenerate_after_paid(self, coach_token, admin_token):
        client_id, _ = _make_client(coach_token, 'pg')
        proto_id = _create_proto(coach_token, client_id)

        r = requests.post(f"{API}/coaching/coach/protocols/{proto_id}/paylink",
                          headers=_auth(coach_token), json={'price': 20})
        assert r.status_code == 200
        order_id = r.json()['order_id']

        # Admin flips to paid
        rp = requests.patch(f"{API}/orders/{order_id}",
                            headers=_auth(admin_token),
                            json={'payment_status': 'paid'})
        assert rp.status_code == 200, rp.text

        # Try regenerate with new price
        r2 = requests.post(f"{API}/coaching/coach/protocols/{proto_id}/paylink",
                           headers=_auth(coach_token), json={'price': 50})
        assert r2.status_code == 400, f"expected 400 got {r2.status_code} {r2.text}"
        detail = (r2.json().get('detail') or '').lower()
        assert 'already paid' in detail, detail


# ---------------- 5. Validation ----------------
class TestValidation:
    @pytest.mark.parametrize('bad_price', [0, -5])
    def test_non_positive_price_rejected(self, coach_token, bad_price):
        client_id, _ = _make_client(coach_token, f'v{abs(bad_price)}')
        proto_id = _create_proto(coach_token, client_id)

        r = requests.post(f"{API}/coaching/coach/protocols/{proto_id}/paylink",
                          headers=_auth(coach_token), json={'price': bad_price})
        assert r.status_code == 400, f"got {r.status_code} {r.text}"
        detail = (r.json().get('detail') or '').lower()
        assert 'greater than zero' in detail or 'price' in detail, detail


# ---------------- 6. Authz ----------------
class TestAuthz:
    def test_foreign_coach_and_unauth(self, coach_token, admin_token):
        client_id, _ = _make_client(coach_token, 'az')
        proto_id = _create_proto(coach_token, client_id)

        # Unauth
        r = requests.post(f"{API}/coaching/coach/protocols/{proto_id}/paylink",
                          json={'price': 10})
        assert r.status_code in (401, 403), f"unauth got {r.status_code}"

        # Create a second coach via admin
        ts = int(time.time() * 1000)
        cemail = f"testpay+coach2{ts}@example.com"
        rc = requests.post(f"{API}/coaching/admin/coaches",
                           headers=_auth(admin_token),
                           json={'email': cemail, 'password': 'Passw0rd!',
                                 'first_name': 'TEST', 'last_name': 'Coach2',
                                 'default_price': 9.99})
        assert rc.status_code == 200, rc.text
        coach2_token = _login(cemail, 'Passw0rd!')

        r2 = requests.post(f"{API}/coaching/coach/protocols/{proto_id}/paylink",
                           headers=_auth(coach2_token), json={'price': 10})
        assert r2.status_code == 404, f"foreign coach got {r2.status_code}"

        # Cleanup: demote coach2
        # find id
        rl = requests.get(f"{API}/coaching/admin/coaches", headers=_auth(admin_token))
        if rl.status_code == 200:
            for c in rl.json():
                if c.get('email') == cemail:
                    requests.delete(f"{API}/coaching/admin/coaches/{c['id']}",
                                    headers=_auth(admin_token))
                    break
