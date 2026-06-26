"""Database connection and helpers."""
import os
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ.get('DB_NAME', 'ghpresearch')

_client: AsyncIOMotorClient = AsyncIOMotorClient(MONGO_URL)
db = _client[DB_NAME]


async def init_indexes():
    await db.users.create_index('email', unique=True)
    await db.products.create_index('slug', unique=True)
    await db.categories.create_index('slug', unique=True)
    await db.orders.create_index('order_number', unique=True)
