"""PayPal Smart Buttons routes."""
import asyncio
import os
from datetime import datetime
from fastapi import APIRouter, HTTPException, Body
from db import db
from paypal_client import create_paypal_order, capture_paypal_order, PAYPAL_CLIENT_ID, PAYPAL_API_BASE

router = APIRouter(prefix='/paypal', tags=['paypal'])


@router.get('/config')
async def paypal_config():
    """Public config: client id and env for the frontend SDK script."""
    env = 'sandbox' if 'sandbox' in PAYPAL_API_BASE else 'live'
    return {
        'client_id': PAYPAL_CLIENT_ID or '',
        'env': env,
        'configured': bool(PAYPAL_CLIENT_ID) and PAYPAL_CLIENT_ID != 'sb'
    }


@router.post('/create-order')
async def create_order(payload: dict = Body(...)):
    """Create a PayPal order from an internal order id."""
    internal_order_id = payload.get('order_id')
    if not internal_order_id:
        raise HTTPException(400, 'order_id is required')
    order = await db.orders.find_one({'id': internal_order_id})
    if not order:
        raise HTTPException(404, 'Internal order not found')
    # Stock availability check — refuse to start payment if any item is oversold.
    # Custom "Other" lines (no product_id) are skipped. Variant stock overrides
    # product stock when the variant has its own stock set.
    for item in order.get('items', []):
        if not item.get('product_id'):
            continue
        prod = await db.products.find_one({'id': item['product_id']}, {'stock': 1, 'name': 1, 'variants': 1})
        if not prod:
            continue
        available = int(prod.get('stock', 0) or 0)
        item_option = item.get('option')
        if item_option:
            for v in prod.get('variants', []) or []:
                if str(v.get('label', '')).strip().lower() == str(item_option).strip().lower():
                    v_stock = v.get('stock')
                    if v_stock is not None:
                        available = int(v_stock)
                    break
        if available < int(item['qty']):
            raise HTTPException(
                409,
                f"Insufficient stock for '{item.get('name') or prod.get('name') or 'item'}'"
                + (f" ({item_option})" if item_option else '')
                + f". Only {available} left."
            )
    paypal_resp = await create_paypal_order(
        amount=order['total'],
        currency=order.get('currency', 'GBP'),
        reference_id=order['order_number']
    )
    # Store paypal order id
    await db.orders.update_one(
        {'id': internal_order_id},
        {'$set': {'payment_id': paypal_resp['id'], 'updated_at': datetime.utcnow()}}
    )
    return {'paypal_order_id': paypal_resp['id']}


@router.post('/capture-order')
async def capture_order(payload: dict = Body(...)):
    """Capture an approved PayPal order and mark internal order as paid."""
    internal_order_id = payload.get('order_id')
    paypal_order_id = payload.get('paypal_order_id')
    if not internal_order_id or not paypal_order_id:
        raise HTTPException(400, 'order_id and paypal_order_id required')
    capture = await capture_paypal_order(paypal_order_id)
    status = capture.get('status', '').upper()
    payment_status = 'paid' if status == 'COMPLETED' else 'pending'
    # Atomic idempotent transition: only decrement stock on the FIRST time
    # this order moves to 'paid'. Guards against double-fire from frontend.
    if payment_status == 'paid':
        transitioned = await db.orders.find_one_and_update(
            {'id': internal_order_id, 'payment_status': {'$ne': 'paid'}},
            {'$set': {
                'payment_status': 'paid',
                'payment_id': paypal_order_id,
                'status': 'processing',
                'paid_at': datetime.utcnow(),
                'updated_at': datetime.utcnow()
            }}
        )
        if transitioned:
            # First transition — decrement inventory for each ordered item.
            # Skip custom "Other" lines (no product_id).
            # If the item has an option that matches a variant with its own stock,
            # decrement THAT variant's stock; otherwise decrement product.stock.
            for item in transitioned.get('items', []):
                if not item.get('product_id'):
                    continue
                qty = int(item['qty'])
                opt = item.get('option')
                prod_id = item['product_id']
                variant_decremented = False
                if opt:
                    prod = await db.products.find_one(
                        {'id': prod_id}, {'variants': 1}
                    ) or {}
                    for idx, v in enumerate(prod.get('variants', []) or []):
                        if str(v.get('label', '')).strip().lower() == str(opt).strip().lower():
                            if v.get('stock') is not None:
                                new_stock = max(0, int(v['stock']) - qty)
                                await db.products.update_one(
                                    {'id': prod_id},
                                    {'$set': {
                                        f'variants.{idx}.stock': new_stock,
                                        'updated_at': datetime.utcnow(),
                                    }}
                                )
                                variant_decremented = True
                            break
                if not variant_decremented:
                    await db.products.update_one(
                        {'id': prod_id},
                        {'$inc': {'stock': -qty},
                         '$set': {'updated_at': datetime.utcnow()}}
                    )
                    await db.products.update_one(
                        {'id': prod_id, 'stock': {'$lt': 0}},
                        {'$set': {'stock': 0}}
                    )
            # Bump promo usage counter if this order used one
            promo_code = transitioned.get('promo_code')
            if promo_code:
                await db.promos.update_one(
                    {'code': promo_code},
                    {'$inc': {'uses': 1}, '$set': {'updated_at': datetime.utcnow()}}
                )
            # Fire order confirmation emails (never blocks or breaks the flow)
            try:
                from email_service import send_order_emails
                fresh = await db.orders.find_one({'id': internal_order_id}) or transitioned
                asyncio.create_task(send_order_emails(fresh))
            except Exception as e:
                print(f'[capture-order] email dispatch failed: {e}')
    else:
        await db.orders.update_one(
            {'id': internal_order_id},
            {'$set': {
                'payment_status': payment_status,
                'payment_id': paypal_order_id,
                'updated_at': datetime.utcnow()
            }}
        )
    return {'status': status, 'payment_status': payment_status, 'capture': capture}
