"""Niftipay hosted card checkout endpoints (config, webhook, create-payment, status, refund, payments_paused)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL') or open('/app/frontend/.env').read().split('REACT_APP_BACKEND_URL=')[1].split()[0]
BASE_URL = BASE_URL.rstrip('/')
API = f"{BASE_URL}/api"
EXISTING_ORDER = 'ed0e807d-5db4-48cf-aa8e-e19b01609a40'


@pytest.fixture(scope='module')
def admin_token():
    r = requests.post(f"{API}/auth/login", json={'email': 'admin@ghp-health.com', 'password': 'GHP-Health26'})
    if r.status_code != 200:
        pytest.skip('admin login failed')
    d = r.json()
    return d.get('token') or d.get('access_token')


# Config
def test_config_enabled():
    r = requests.get(f"{API}/niftipay/config")
    assert r.status_code == 200 and r.json() == {'enabled': True}


# Webhook
def test_webhook_test_event():
    r = requests.post(f"{API}/niftipay/webhook", json={'event': 'test'})
    assert r.status_code == 200, r.text
    assert r.json().get('ok') is True


def test_webhook_invalid_json():
    r = requests.post(f"{API}/niftipay/webhook", data='not-json{', headers={'Content-Type': 'application/json'})
    assert r.status_code == 400, r.text


def test_webhook_paid_unknown_order():
    r = requests.post(f"{API}/niftipay/webhook", json={'event': 'paid', 'order': {'id': f'TEST_{uuid.uuid4()}', 'merchantReference': f'TEST_{uuid.uuid4()}'}})
    assert r.status_code == 200, r.text
    assert r.json().get('ok') is True


def test_webhook_non_dict_json():
    # Robustness: JSON array body must not 500
    r = requests.post(f"{API}/niftipay/webhook", json=[1, 2])
    assert r.status_code < 500, f'{r.status_code} {r.text}'


# Create payment
def test_create_payment_unknown_order():
    r = requests.post(f"{API}/niftipay/create-payment", json={'order_id': f'TEST_{uuid.uuid4()}'})
    assert r.status_code == 404


def test_create_payment_existing_not_activated():
    r = requests.post(f"{API}/niftipay/create-payment", json={'order_id': EXISTING_ORDER})
    assert r.status_code == 400, r.text
    assert 'not activated' in r.json().get('detail', '').lower()


# Status
def test_status_existing():
    r = requests.get(f"{API}/niftipay/status/{EXISTING_ORDER}")
    assert r.status_code == 200
    assert 'payment_status' in r.json()
    assert r.json()['payment_status'] is not None


def test_status_unknown():
    r = requests.get(f"{API}/niftipay/status/TEST_{uuid.uuid4()}")
    assert r.status_code == 404


# Refund
def test_refund_requires_auth():
    r = requests.post(f"{API}/niftipay/admin/{EXISTING_ORDER}/refund", json={})
    assert r.status_code in (401, 403), r.status_code


def test_refund_no_niftipay_payment(admin_token):
    r = requests.post(f"{API}/niftipay/admin/{EXISTING_ORDER}/refund", json={}, headers={'Authorization': f'Bearer {admin_token}'})
    assert r.status_code == 404, r.text


# payments_paused gate
def test_payments_paused_returns_503(admin_token):
    h = {'Authorization': f'Bearer {admin_token}'}
    s = requests.get(f"{API}/settings/admin", headers=h)
    assert s.status_code == 200
    original = s.json()
    try:
        paused = dict(original, payments_paused=True)
        u = requests.put(f"{API}/settings", json=paused, headers=h)
        assert u.status_code == 200, u.text
        assert u.json()['payments_paused'] is True
        r = requests.post(f"{API}/niftipay/create-payment", json={'order_id': EXISTING_ORDER})
        assert r.status_code == 503, r.text
        assert 'temporarily paused' in r.json()['detail'].lower()
    finally:
        restore = dict(original, payments_paused=False)
        rr = requests.put(f"{API}/settings", json=restore, headers=h)
        assert rr.status_code == 200
        assert requests.get(f"{API}/settings").json()['payments_paused'] is False
