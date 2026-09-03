"""One-shot fix for the Helixaris storefront where the Oral Peptides
category page renders "Category not found".

Root cause identified in the GHP diagnostic:
  1. The `oral-peptides` document is missing from Helixaris `categories`
     collection (the initial seed ran before this category was created on
     the upstream GHP catalogue).
  2. The 8 oral products that DID seed have `category_slug=None` because
     the upstream `/api/products` response returns `category_slug: null`
     and the seed script's `dict.get(key, fallback)` doesn't fall back on
     an explicit None value.

This script is IDEMPOTENT and SAFE — it only touches the oral-peptides
category and the 8 known oral product slugs. It will NOT overwrite any
Helixaris-specific pricing, variant, or image customisations.

Run inside the Helixaris pod:
    cd /app/backend && python fix_helixaris_orals.py
"""
import asyncio
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

HELIXARIS_IMG_DIR = Path('/app/frontend/public/brands/helixaris/products')

ORAL_CATEGORY = {
    'slug': 'oral-peptides',
    'name': 'Oral Peptides',
    'description': 'Peptide research compounds in tablet form — precise dosing without reconstitution.',
    'image': '/orals/slupp-332-50mg.png',
    'sort_order': 4,
    'visible': True,
}

ORAL_PRODUCT_SLUGS = [
    '5-amino-1mq-50mg',
    'slupp-332-50mg',
    'methylene-blue-20mg',
    'tesofensine-500mcg',
    'slupp-332-250mcg-bma-15-50mcg-300mcg',
    'bam15-50mg',
    'minoxidil-5mg',
    'tirzepatide-500mcg',
]


async def upsert_oral_category(db):
    now = datetime.now(timezone.utc)
    existing = await db.categories.find_one({'slug': ORAL_CATEGORY['slug']})
    # If the Helixaris-branded image exists on disk prefer it, else keep the
    # cross-brand /orals fallback so the tile still renders.
    helixaris_img = HELIXARIS_IMG_DIR / 'slupp-332-50mg.png'
    image = (
        '/brands/helixaris/products/slupp-332-50mg.png'
        if helixaris_img.exists()
        else ORAL_CATEGORY['image']
    )
    payload = {**ORAL_CATEGORY, 'image': image, 'updated_at': now}
    if existing:
        await db.categories.update_one(
            {'id': existing['id']}, {'$set': payload}
        )
        print(f"  ✓ updated existing oral-peptides category ({existing['id']})")
    else:
        payload.update({'id': str(uuid.uuid4()), 'created_at': now})
        await db.categories.insert_one(payload)
        print(f"  ✓ inserted oral-peptides category ({payload['id']})")


async def fix_oral_products(db):
    now = datetime.now(timezone.utc)
    fixed = 0
    missing = []
    for slug in ORAL_PRODUCT_SLUGS:
        res = await db.products.update_one(
            {'slug': slug},
            {
                '$set': {
                    'category': 'oral-peptides',
                    'category_slug': 'oral-peptides',
                    'updated_at': now,
                }
            },
        )
        if res.matched_count:
            fixed += 1
            print(f'  ✓ {slug}: category → oral-peptides')
        else:
            missing.append(slug)
    print(f'\n  fixed {fixed}/{len(ORAL_PRODUCT_SLUGS)} products.')
    if missing:
        print('  ⚠ missing on this deploy (not fixed):')
        for s in missing:
            print(f'      - {s}')


async def verify(db):
    cat = await db.categories.find_one({'slug': 'oral-peptides'})
    products = await db.products.find(
        {'category': 'oral-peptides'}, {'slug': 1, 'name': 1, '_id': 0}
    ).to_list(50)
    print('\n--- verification ---')
    print(f'  oral-peptides category present: {bool(cat)}')
    print(f'  products with category=oral-peptides: {len(products)}')
    for p in products:
        print(f"    - {p['slug']}  ({p['name']})")


async def main():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]
    print(f"Fixing Helixaris oral peptides in DB `{os.environ['DB_NAME']}` ...\n")
    print('[1/3] Upserting oral-peptides category')
    await upsert_oral_category(db)
    print('\n[2/3] Fixing category on 8 oral products')
    await fix_oral_products(db)
    print('\n[3/3] Verifying')
    await verify(db)
    print('\n✓ Done. Visit /category/oral-peptides on the Helixaris storefront.')


if __name__ == '__main__':
    asyncio.run(main())
