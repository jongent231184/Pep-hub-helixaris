"""Xoala card-payment plumbing: checksum verification, return + notify handling, idempotency."""
import hashlib
import os
import uuid
import pytest
import httpx
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')
BASE = os.environ.get('TEST_BASE_URL', 'http://localhost:8001')
SECRET = os.environ['XOALA_SECRET_KEY']


def md5(*parts):
    return hashlib.md5('|'.join(parts).encode()).hexdigest()


@pytest.fixture
def db():
    return AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]


@pytest.fixture
async def order(db):
    oid = str(uuid.uuid4())
    doc = {
        'id': oid, 'order_number': f'TEST-{oid[:6]}', 'items': [], 'total': 12.5, 'status': 'pending',
        'payment_status': 'pending', 'shipping_address': {'first_name': 'T', 'last_name': 'U', 'email': 'delivered@resend.dev'},
        'xoala_txn_id': f'TEST-{oid[:6]}-1', 'xoala_amount': '12.50', 'xoala_currency': 'EUR',
        'xoala_return_to': 'https://example.test',
    }
    await db.orders.insert_one(doc)
    yield doc
    await db.orders.delete_one({'id': oid})


@pytest.mark.anyio
async def test_config_public():
    async with httpx.AsyncClient(base_url=BASE) as c:
        r = await c.get('/api/xoala/config')
    assert r.status_code == 200 and r.json()['configured'] is True


@pytest.mark.anyio
async def test_return_bad_checksum_does_not_pay(order, db):
    form = {'paymentId': '1', 'merchantTransactionId': order['xoala_txn_id'], 'amount': '12.50', 'status': 'Y', 'checksum': 'deadbeef'}
    async with httpx.AsyncClient(base_url=BASE) as c:
        r = await c.post('/api/xoala/return', data=form)
    assert r.status_code == 303 and 'xoala=failed' in r.headers['location']
    fresh = await db.orders.find_one({'id': order['id']})
    assert fresh['payment_status'] == 'pending'


@pytest.mark.anyio
async def test_return_amount_mismatch_rejected(order, db):
    cs = md5('2', order['xoala_txn_id'], '1.00', 'Y', SECRET)
    form = {'paymentId': '2', 'merchantTransactionId': order['xoala_txn_id'], 'amount': '1.00', 'status': 'Y', 'checksum': cs}
    async with httpx.AsyncClient(base_url=BASE) as c:
        r = await c.post('/api/xoala/return', data=form)
    assert 'xoala=failed' in r.headers['location']
    assert (await db.orders.find_one({'id': order['id']}))['payment_status'] == 'pending'


@pytest.mark.anyio
async def test_return_failed_status(order, db):
    cs = md5('3', order['xoala_txn_id'], '12.50', 'N', SECRET)
    form = {'paymentId': '3', 'merchantTransactionId': order['xoala_txn_id'], 'amount': '12.50', 'status': 'N',
            'checksum': cs, 'resultDescription': 'Declined'}
    async with httpx.AsyncClient(base_url=BASE) as c:
        r = await c.post('/api/xoala/return', data=form)
    assert r.headers['location'] == 'https://example.test/checkout?xoala=failed'
    fresh = await db.orders.find_one({'id': order['id']})
    assert fresh['payment_status'] == 'failed' and fresh['xoala_result'] == 'Declined'


@pytest.mark.anyio
async def test_notify_marks_paid_idempotently(order, db):
    body = {'paymentId': '4', 'merchantTransactionId': order['xoala_txn_id'], 'amount': '12.50', 'transactionStatus': 'Y',
            'status': 'capturesuccess', 'paymentBrand': 'VISA', 'card': {'last4Digits': '0035'}}
    body['checksum'] = md5('4', order['xoala_txn_id'], '12.50', 'Y', SECRET)
    async with httpx.AsyncClient(base_url=BASE) as c:
        r1 = await c.post('/api/xoala/notify', json=body)
        r2 = await c.post('/api/xoala/notify', json=body)
    assert r1.status_code == 200 and r2.status_code == 200
    fresh = await db.orders.find_one({'id': order['id']})
    assert fresh['payment_status'] == 'paid'
    assert fresh['payment_provider'] == 'xoala'
    assert fresh['xoala_card'] == 'VISA •••• 0035'


@pytest.mark.anyio
async def test_notify_bad_checksum_400(order):
    body = {'paymentId': '5', 'merchantTransactionId': order['xoala_txn_id'], 'amount': '12.50', 'transactionStatus': 'Y', 'checksum': 'x'}
    async with httpx.AsyncClient(base_url=BASE) as c:
        r = await c.post('/api/xoala/notify', json=body)
    assert r.status_code == 400


@pytest.mark.anyio
async def test_return_success_redirects_to_confirmation(order, db):
    cs = md5('6', order['xoala_txn_id'], '12.50', 'Y', SECRET)
    form = {'paymentId': '6', 'merchantTransactionId': order['xoala_txn_id'], 'amount': '12.50', 'status': 'Y', 'checksum': cs}
    async with httpx.AsyncClient(base_url=BASE) as c:
        r = await c.post('/api/xoala/return', data=form)
    assert r.headers['location'] == f"https://example.test/order-confirmation/{order['order_number']}?xoala=1"
    assert (await db.orders.find_one({'id': order['id']}))['payment_status'] == 'paid'
