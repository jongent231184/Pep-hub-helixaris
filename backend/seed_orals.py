"""Seed the Oral Peptides category + 8 products with the branded capsule tub image."""
import asyncio
import base64
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

from db import db  # noqa: E402

TUB_IMAGE = Path('/app/backend/uploads/orals-tubs/wide-round.png')

PRODUCTS = [
    # (name, price £, description, tablet strength+count summary)
    ('SLUPP-332 50mg', 79.99, 'SLUPP-332 selective research tool. 100 tablets, 50mg per tablet. Peer-education use only.', '50mg × 100 tablets'),
    ('Methylene Blue 20mg', 44.99, 'Pharmaceutical-grade Methylene Blue in oral form. 100 tablets, 20mg per tablet.', '20mg × 100 tablets'),
    ('Tesofensine 500mcg', 89.99, 'Tesofensine research compound in oral form. 100 tablets, 500mcg per tablet.', '500mcg × 100 tablets'),
    ('SLUPP-332 250mcg / BMA-15 50mcg 300mcg', 74.99, 'Combined SLUPP-332 + BMA-15 tablet — 250mcg + 50mcg per tablet (300mcg total). 60 tablets.', '300mcg × 60 tablets'),
    ('BAM15 50mg', 64.99, 'BAM15 mitochondrial protonophore research compound. 60 tablets, 50mg per tablet.', '50mg × 60 tablets'),
    ('5-Amino-1MQ 50mg', 54.99, 'NNMT inhibitor 5-Amino-1MQ in oral form. 25 tablets, 50mg per tablet.', '50mg × 25 tablets'),
    ('Minoxidil 5mg', 29.99, 'Oral Minoxidil for research on hair-growth pathways. 100 tablets, 5mg per tablet.', '5mg × 100 tablets'),
    ('Tirzepatide 500mcg', 49.99, 'Tirzepatide oral tablet form. 25 tablets, 500mcg per tablet.', '500mcg × 25 tablets'),
]

# Compliance-safe short blurb appended
DISCLAIMER = ' For laboratory research use only — not for human consumption.'


def slugify(name: str) -> str:
    s = name.lower()
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s


async def main():
    now = datetime.now(timezone.utc)

    # 1. Category
    cat_slug = 'oral-peptides'
    existing_cat = await db.categories.find_one({'slug': cat_slug})

    # Upload the tub image as a static asset
    image_bytes = TUB_IMAGE.read_bytes()
    static_dir = Path('/app/backend/uploads')
    static_dir.mkdir(parents=True, exist_ok=True)
    dest = static_dir / 'oral-peptides-tub.png'
    dest.write_bytes(image_bytes)
    image_url = '/api/uploads/oral-peptides-tub.png'

    if existing_cat:
        await db.categories.update_one({'slug': cat_slug}, {'$set': {'image': image_url, 'sort_order': 4}})
        cat_id = existing_cat['id']
        print(f'Category updated: {cat_slug}')
    else:
        # Push existing categories with order >= 4 down by 1
        await db.categories.update_many({'sort_order': {'$gte': 4}}, {'$inc': {'sort_order': 1}})
        cat = {
            'id': str(uuid.uuid4()),
            'slug': cat_slug,
            'name': 'Oral Peptides',
            'description': 'Peptide research compounds in tablet form — precise dosing without reconstitution.',
            'image': image_url,
            'sort_order': 4,
            'visible': True,
            'created_at': now,
            'updated_at': now,
        }
        await db.categories.insert_one(cat)
        cat_id = cat['id']
        print(f'Category created: {cat_slug}')

    # 2. Products
    for name, price, blurb, strength_summary in PRODUCTS:
        slug = slugify(name)
        existing = await db.products.find_one({'slug': slug})
        if existing:
            print(f'  · skip existing: {slug}')
            continue
        doc = {
            'id': str(uuid.uuid4()),
            'slug': slug,
            'name': name,
            'category_id': cat_id,
            'category_slug': cat_slug,
            'category': cat_slug,
            'price': float(price),
            'description': blurb + DISCLAIMER,
            'short_description': strength_summary,
            'image': image_url,
            'images': [image_url],
            'options': [],
            'variants': [],
            'stock': 0,  # admin sets real stock after seeding
            'visible': True,
            'featured': False,
            'created_at': now,
            'updated_at': now,
        }
        await db.products.insert_one(doc)
        print(f'  · created: {slug} — £{price:.2f} ({strength_summary})')

    print('\nDone. Verify at /oral-peptides on the frontend.')


asyncio.run(main())
