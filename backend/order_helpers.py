"""Shared helpers for order state transitions (paid, stock decrement, emails)."""
import asyncio
from datetime import datetime
from typing import Optional
from db import db


async def mark_order_paid(
    order_id: str,
    payment_id: str,
    payment_provider: str,
    extra_fields: Optional[dict] = None,
) -> Optional[dict]:
    """Atomic idempotent transition to 'paid'. On the first transition:
      - decrements variant/product stock
      - bumps promo usage
      - dispatches confirmation emails (fire-and-forget)
    Returns the transitioned order document (as loaded PRE-update) or None if
    the order was already paid (i.e. this call was a duplicate).
    """
    updates = {
        'payment_status': 'paid',
        'payment_id': payment_id,
        'payment_provider': payment_provider,
        'status': 'processing',
        'paid_at': datetime.utcnow(),
        'updated_at': datetime.utcnow(),
    }
    if extra_fields:
        updates.update(extra_fields)

    transitioned = await db.orders.find_one_and_update(
        {'id': order_id, 'payment_status': {'$ne': 'paid'}},
        {'$set': updates},
    )
    if not transitioned:
        return None  # already paid — no-op

    # Decrement inventory (variant-aware). Skip custom "Other" lines.
    for item in transitioned.get('items', []) or []:
        if not item.get('product_id'):
            continue
        qty = int(item['qty'])
        opt = item.get('option')
        prod_id = item['product_id']
        variant_decremented = False
        if opt:
            prod = await db.products.find_one({'id': prod_id}, {'variants': 1}) or {}
            for idx, v in enumerate(prod.get('variants', []) or []):
                if str(v.get('label', '')).strip().lower() == str(opt).strip().lower():
                    if v.get('stock') is not None:
                        new_stock = max(0, int(v['stock']) - qty)
                        await db.products.update_one(
                            {'id': prod_id},
                            {'$set': {
                                f'variants.{idx}.stock': new_stock,
                                'updated_at': datetime.utcnow(),
                            }},
                        )
                        variant_decremented = True
                    break
        if not variant_decremented:
            await db.products.update_one(
                {'id': prod_id},
                {'$inc': {'stock': -qty}, '$set': {'updated_at': datetime.utcnow()}},
            )
            await db.products.update_one(
                {'id': prod_id, 'stock': {'$lt': 0}},
                {'$set': {'stock': 0}},
            )

    # Promo usage counter
    promo_code = transitioned.get('promo_code')
    if promo_code:
        await db.promos.update_one(
            {'code': promo_code},
            {'$inc': {'uses': 1}, '$set': {'updated_at': datetime.utcnow()}},
        )

    # Fire order confirmation emails (never blocks or breaks the flow)
    try:
        from email_service import send_order_emails
        fresh = await db.orders.find_one({'id': order_id}) or transitioned
        asyncio.create_task(send_order_emails(fresh))
    except Exception as e:  # pragma: no cover
        print(f'[mark_order_paid] email dispatch failed: {e}')

    return transitioned
