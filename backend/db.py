"""Database connection and helpers."""
import os
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ.get('DB_NAME', 'ghpresearch')

# Short timeouts so a slow Atlas connection cannot hang startup / readiness probe
_client: AsyncIOMotorClient = AsyncIOMotorClient(
    MONGO_URL,
    serverSelectionTimeoutMS=5000,
    connectTimeoutMS=5000,
    socketTimeoutMS=20000,
)
db = _client[DB_NAME]


async def init_indexes():
    await db.users.create_index('email', unique=True)
    await db.products.create_index('slug', unique=True)
    await db.categories.create_index('slug', unique=True)
    await db.orders.create_index('order_number', unique=True)
    await db.promos.create_index('code', unique=True)
    await db.addresses.create_index('user_id')
    await db.wallid_events.create_index('event_id', unique=True)
    await db.dose_plans.create_index('user_id')
