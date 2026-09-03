"""Bootstrap script — populates a fresh Helixaris deploy with:
  1. An admin user (admin@helixaris.com / admin123)
  2. Every product category from the current GHP-Health production catalog
  3. Every product from GHP with `image` swapped to the matching Helixaris
     asset at /brands/helixaris/products/{slug}.png (falls back to the GHP
     image if no Helixaris asset exists yet — e.g. bundles).

Run inside the Helixaris pod:
    cd /app/backend && python init_helixaris.py

Idempotent — safe to run repeatedly. Adds missing rows, updates existing ones.
"""
import asyncio
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

import httpx
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext

load_dotenv()

SOURCE = os.environ.get('SEED_SOURCE_URL', 'https://www.ghp-health.com')
HELIXARIS_IMG_DIR = Path('/app/frontend/public/brands/helixaris/products')
_pwd = CryptContext(schemes=['bcrypt'], deprecated='auto')


def helixaris_image_or_fallback(slug: str, ghp_image: str) -> str:
    """Return Helixaris image path if the asset exists on disk, else keep GHP."""
    if (HELIXARIS_IMG_DIR / f'{slug}.png').exists():
        return f'/brands/helixaris/products/{slug}.png'
    return ghp_image or ''


async def upsert_admin(db):
    email = 'admin@helixaris.com'
    now = datetime.now(timezone.utc)
    existing = await db.users.find_one({'email': email})
    if existing:
        print(f'  admin user already exists: {email}')
        return
    await db.users.insert_one({
        'id': str(uuid.uuid4()),
        'email': email,
        'password_hash': _pwd.hash('admin123'),
        'role': 'admin',
        'first_name': 'Helixaris',
        'last_name': 'Admin',
        'created_at': now,
        'updated_at': now,
    })
    print(f'  ✓ created admin user: {email} / admin123')


async def clone_categories(db, source_categories: list):
    now = datetime.now(timezone.utc)
    added = 0
    updated = 0
    for c in source_categories:
        existing = await db.categories.find_one({'slug': c['slug']})
        payload = {
            'slug': c['slug'],
            'name': c['name'],
            'image': c.get('image', ''),
            'description': c.get('description', ''),
            'updated_at': now,
        }
        if existing:
            await db.categories.update_one({'id': existing['id']}, {'$set': payload})
            updated += 1
        else:
            payload.update({'id': str(uuid.uuid4()), 'created_at': now})
            await db.categories.insert_one(payload)
            added += 1
    print(f'  ✓ categories: {added} added, {updated} updated')


async def clone_products(db, source_products: list):
    now = datetime.now(timezone.utc)
    added = 0
    updated = 0
    for p in source_products:
        slug = p['slug']
        new_image = helixaris_image_or_fallback(slug, p.get('image', ''))
        payload = {
            'slug': slug,
            'name': p['name'],
            'category': p.get('category') or '',
            # dict.get returns None (not fallback) when the API explicitly sends
            # `null`, so use `or` chain to guarantee a real slug value.
            'category_slug': p.get('category_slug') or p.get('category') or '',
            'price': p.get('price', 0.0),
            'description': p.get('description', ''),
            'short_description': p.get('short_description', ''),
            'image': new_image,
            'images': [new_image] if new_image else [],
            'options': p.get('options') or [],
            'variants': p.get('variants') or [],
            'stock': p.get('stock', 0),
            'visible': p.get('visible', True),
            'featured': p.get('featured', False),
            'updated_at': now,
        }
        existing = await db.products.find_one({'slug': slug})
        if existing:
            await db.products.update_one({'id': existing['id']}, {'$set': payload})
            updated += 1
        else:
            payload.update({'id': str(uuid.uuid4()), 'created_at': now})
            await db.products.insert_one(payload)
            added += 1
    print(f'  ✓ products: {added} added, {updated} updated')


async def main():
    mongo_url = os.environ['MONGO_URL']
    db_name = os.environ['DB_NAME']
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    print(f'Initialising Helixaris DB `{db_name}` from `{SOURCE}` ...')

    # 1. Admin user
    print('[1/3] Admin user')
    await upsert_admin(db)

    # 2. Fetch source catalog
    print('[2/3] Fetching GHP-Health catalog')
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as http:
        cats = (await http.get(f'{SOURCE}/api/categories')).json()
        prods = (await http.get(f'{SOURCE}/api/products')).json()
    print(f'    fetched {len(cats)} categories, {len(prods)} products')

    # 3. Upsert everything
    print('[3/3] Seeding local DB')
    await clone_categories(db, cats)
    await clone_products(db, prods)

    # Report on image coverage
    helixaris_ready = sum(
        1 for p in prods if (HELIXARIS_IMG_DIR / f"{p['slug']}.png").exists()
    )
    print(f'\n✓ done. Helixaris images available for {helixaris_ready}/{len(prods)} products.')
    print('  (Missing ones fall back to GHP imagery — generate them and re-run this script.)')


if __name__ == '__main__':
    asyncio.run(main())
