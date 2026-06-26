"""Admin dashboard stats route."""
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends
from db import db
from auth import require_admin
from utils import doc_to_dict

router = APIRouter(prefix='/admin', tags=['admin'])


@router.get('/stats')
async def stats(_=Depends(require_admin)):
    now = datetime.utcnow()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week = now - timedelta(days=7)
    month = now - timedelta(days=30)

    async def revenue_since(since):
        cursor = db.orders.find({'payment_status': 'paid', 'created_at': {'$gte': since}})
        total = 0.0
        async for o in cursor:
            total += float(o.get('total', 0))
        return total

    revenue_today = await revenue_since(today)
    revenue_week = await revenue_since(week)
    revenue_month = await revenue_since(month)

    orders_total = await db.orders.count_documents({})
    orders_pending = await db.orders.count_documents({'payment_status': 'pending'})
    orders_paid = await db.orders.count_documents({'payment_status': 'paid'})
    products_total = await db.products.count_documents({})
    customers_total = await db.users.count_documents({'role': 'customer'})

    recent_orders_docs = await db.orders.find().sort('created_at', -1).limit(5).to_list(5)
    recent_orders = [doc_to_dict(o) for o in recent_orders_docs]

    # Top products by qty
    pipeline = [
        {'$match': {'payment_status': 'paid'}},
        {'$unwind': '$items'},
        {'$group': {'_id': '$items.product_id', 'name': {'$first': '$items.name'}, 'image': {'$first': '$items.image'}, 'qty': {'$sum': '$items.qty'}, 'revenue': {'$sum': {'$multiply': ['$items.qty', '$items.price']}}}},
        {'$sort': {'qty': -1}},
        {'$limit': 5}
    ]
    top_products = await db.orders.aggregate(pipeline).to_list(5)
    for tp in top_products:
        tp['product_id'] = tp.pop('_id')

    return {
        'revenue_today': revenue_today,
        'revenue_week': revenue_week,
        'revenue_month': revenue_month,
        'orders_total': orders_total,
        'orders_pending': orders_pending,
        'orders_paid': orders_paid,
        'products_total': products_total,
        'customers_total': customers_total,
        'recent_orders': recent_orders,
        'top_products': top_products,
    }


@router.get('/customers')
async def list_customers(_=Depends(require_admin)):
    docs = await db.users.find({'role': 'customer'}).sort('created_at', -1).to_list(500)
    return [doc_to_dict(d) for d in docs]
