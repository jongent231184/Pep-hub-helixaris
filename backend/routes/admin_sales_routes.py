"""Admin sales analytics — per product/variant KPIs and drill-down.

Only paid orders are counted. Line items are grouped by (product_id, option)
so each variant appears as its own row (a product with no variants shows a
single row with `option` = null).
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from auth import require_admin
from db import db

router = APIRouter(prefix='/admin/sales', tags=['admin-sales'])


@router.get('/summary')
async def sales_summary(_admin: dict = Depends(require_admin)):
    """Store-wide KPIs (all time, paid only): revenue, orders, units, avg order value."""
    pipeline = [
        {'$match': {'payment_status': 'paid'}},
        {'$facet': {
            'totals': [
                {'$group': {
                    '_id': None,
                    'revenue': {'$sum': '$total'},
                    'orders': {'$sum': 1},
                }},
            ],
            'units': [
                {'$unwind': '$items'},
                {'$group': {'_id': None, 'units': {'$sum': '$items.qty'}}},
            ],
        }},
    ]
    result = await db.orders.aggregate(pipeline).to_list(1)
    if not result:
        return {'revenue': 0.0, 'orders': 0, 'units_sold': 0, 'avg_order_value': 0.0}
    row = result[0]
    revenue = float(row['totals'][0]['revenue']) if row['totals'] else 0.0
    orders = int(row['totals'][0]['orders']) if row['totals'] else 0
    units = int(row['units'][0]['units']) if row['units'] else 0
    aov = revenue / orders if orders else 0.0
    return {
        'revenue': round(revenue, 2),
        'orders': orders,
        'units_sold': units,
        'avg_order_value': round(aov, 2),
    }


@router.get('/products')
async def sales_by_product(_admin: dict = Depends(require_admin)):
    """All-time bestseller list, one row per (product, variant).

    Rows:
        product_id, slug, name, option, image, units_sold, revenue,
        first_sold_at, last_sold_at, orders_count, current_stock (if known).
    Sorted by units_sold desc.
    """
    pipeline = [
        {'$match': {'payment_status': 'paid'}},
        {'$unwind': '$items'},
        # Skip custom line items on paylinks that don't map to a real product
        {'$match': {'items.product_id': {'$ne': None}}},
        {'$group': {
            '_id': {
                'product_id': '$items.product_id',
                'option': '$items.option',
            },
            'slug': {'$first': '$items.slug'},
            'name': {'$first': '$items.name'},
            'image': {'$first': '$items.image'},
            'units_sold': {'$sum': '$items.qty'},
            'revenue': {'$sum': {'$multiply': ['$items.qty', '$items.price']}},
            'first_sold_at': {'$min': '$created_at'},
            'last_sold_at': {'$max': '$created_at'},
            'orders_count': {'$sum': 1},
        }},
        {'$sort': {'units_sold': -1, 'revenue': -1}},
    ]
    rows = await db.orders.aggregate(pipeline).to_list(1000)

    # Hydrate current stock (either from product-level stock or the matching variant)
    product_ids = list({r['_id']['product_id'] for r in rows})
    products_map = {}
    if product_ids:
        async for p in db.products.find({'id': {'$in': product_ids}}):
            products_map[p['id']] = p

    out = []
    for r in rows:
        pid = r['_id']['product_id']
        option = r['_id']['option']
        prod = products_map.get(pid) or {}
        stock: Optional[int] = None
        if option and prod.get('variants'):
            match = next((v for v in prod['variants'] if v.get('label') == option), None)
            if match is not None:
                stock = match.get('stock') if match.get('stock') is not None else prod.get('stock')
            else:
                stock = prod.get('stock')
        else:
            stock = prod.get('stock')

        out.append({
            'product_id': pid,
            'option': option,
            'slug': r.get('slug'),
            'name': r.get('name'),
            'image': r.get('image') or (prod.get('image') if prod else ''),
            'units_sold': int(r['units_sold']),
            'revenue': round(float(r['revenue']), 2),
            'orders_count': int(r['orders_count']),
            'first_sold_at': r['first_sold_at'].isoformat() if r.get('first_sold_at') else None,
            'last_sold_at': r['last_sold_at'].isoformat() if r.get('last_sold_at') else None,
            'current_stock': stock,
            'product_visible': prod.get('visible', True) if prod else True,
        })
    return {'rows': out}


@router.get('/products/{product_id}/orders')
async def orders_for_product(
    product_id: str,
    option: Optional[str] = None,
    _admin: dict = Depends(require_admin),
):
    """Every paid order that bought this product (optionally: this variant).

    Returns per-line: order id/number, date, customer name+email, qty,
    unit price, line total, order status, payment status.
    """
    match_item = {'items.product_id': product_id}
    if option is not None:
        match_item['items.option'] = option

    pipeline = [
        {'$match': {'payment_status': 'paid'}},
        {'$unwind': '$items'},
        {'$match': match_item},
        {'$sort': {'created_at': -1}},
        {'$project': {
            '_id': 0,
            'order_id': '$id',
            'order_number': '$order_number',
            'created_at': '$created_at',
            'status': '$status',
            'payment_status': '$payment_status',
            'customer_email': '$shipping_address.email',
            'customer_first_name': '$shipping_address.first_name',
            'customer_last_name': '$shipping_address.last_name',
            'qty': '$items.qty',
            'unit_price': '$items.price',
            'option': '$items.option',
            'line_total': {'$multiply': ['$items.qty', '$items.price']},
        }},
        {'$limit': 500},
    ]
    rows = await db.orders.aggregate(pipeline).to_list(500)

    # Roll up KPIs for this specific product+variant
    total_units = sum(int(r['qty']) for r in rows)
    total_revenue = round(sum(float(r['line_total']) for r in rows), 2)
    first_sold = min((r['created_at'] for r in rows if r.get('created_at')), default=None)
    last_sold = max((r['created_at'] for r in rows if r.get('created_at')), default=None)

    def _fmt(row):
        return {
            'order_id': row['order_id'],
            'order_number': row['order_number'],
            'created_at': row['created_at'].isoformat() if row.get('created_at') else None,
            'status': row['status'],
            'payment_status': row['payment_status'],
            'customer_name': ' '.join(
                filter(None, [row.get('customer_first_name'), row.get('customer_last_name')])
            ).strip(),
            'customer_email': row.get('customer_email'),
            'qty': int(row['qty']),
            'unit_price': round(float(row['unit_price']), 2),
            'line_total': round(float(row['line_total']), 2),
            'option': row.get('option'),
        }

    return {
        'product_id': product_id,
        'option': option,
        'units_sold': total_units,
        'revenue': total_revenue,
        'orders_count': len(rows),
        'first_sold_at': first_sold.isoformat() if first_sold else None,
        'last_sold_at': last_sold.isoformat() if last_sold else None,
        'orders': [_fmt(r) for r in rows],
    }
