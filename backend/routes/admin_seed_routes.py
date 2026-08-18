"""Admin-gated seed endpoints — idempotent. Used to bootstrap production DB with catalog data."""
import re
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends

from auth import require_admin
from db import db

router = APIRouter(prefix='/admin/seed', tags=['admin-seed'])


ORAL_PRODUCTS = [
    ('SLUPP-332 50mg', 79.99, 'SLUPP-332 selective research tool. 100 tablets, 50mg per tablet. Peer-education use only.', '50mg × 100 tablets', 'slupp-332-50mg'),
    ('Methylene Blue 20mg', 44.99, 'Pharmaceutical-grade Methylene Blue in oral form. 100 tablets, 20mg per tablet.', '20mg × 100 tablets', 'methylene-blue-20mg'),
    ('Tesofensine 500mcg', 89.99, 'Tesofensine research compound in oral form. 100 tablets, 500mcg per tablet.', '500mcg × 100 tablets', 'tesofensine-500mcg'),
    ('SLUPP-332 250mcg / BMA-15 50mcg 300mcg', 74.99, 'Combined SLUPP-332 + BMA-15 tablet — 250mcg + 50mcg per tablet (300mcg total). 60 tablets.', '300mcg × 60 tablets', 'slupp-332-bma-15-combo'),
    ('BAM15 50mg', 64.99, 'BAM15 mitochondrial protonophore research compound. 60 tablets, 50mg per tablet.', '50mg × 60 tablets', 'bam15-50mg'),
    ('5-Amino-1MQ 50mg', 54.99, 'NNMT inhibitor 5-Amino-1MQ in oral form. 25 tablets, 50mg per tablet.', '50mg × 25 tablets', '5-amino-1mq-50mg'),
    ('Minoxidil 5mg', 29.99, 'Oral Minoxidil for research on hair-growth pathways. 100 tablets, 5mg per tablet.', '5mg × 100 tablets', 'minoxidil-5mg'),
    ('Tirzepatide 500mcg', 49.99, 'Tirzepatide oral tablet form. 25 tablets, 500mcg per tablet.', '500mcg × 25 tablets', 'tirzepatide-500mcg'),
]
DISCLAIMER = ' For laboratory research use only — not for human consumption.'


def _slug(name: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


@router.post('/orals')
async def seed_orals(_admin: dict = Depends(require_admin)):
    """Idempotently seed the Oral Peptides category + 8 products. Safe to call multiple times."""
    now = datetime.now(timezone.utc)
    cat_slug = 'oral-peptides'
    tile_url = '/orals/slupp-332-50mg.png'
    created_products: list[str] = []
    updated_products: list[str] = []

    # 1. Category
    existing_cat = await db.categories.find_one({'slug': cat_slug})
    if existing_cat:
        await db.categories.update_one(
            {'slug': cat_slug},
            {'$set': {'image': tile_url, 'sort_order': 4, 'visible': True, 'updated_at': now}},
        )
        cat_id = existing_cat['id']
    else:
        await db.categories.update_many({'sort_order': {'$gte': 4}}, {'$inc': {'sort_order': 1}})
        cat_id = str(uuid.uuid4())
        await db.categories.insert_one({
            'id': cat_id, 'slug': cat_slug, 'name': 'Oral Peptides',
            'description': 'Peptide research compounds in tablet form — precise dosing without reconstitution.',
            'image': tile_url, 'sort_order': 4, 'visible': True,
            'created_at': now, 'updated_at': now,
        })

    # 2. Products
    for name, price, blurb, strength, img_slug in ORAL_PRODUCTS:
        slug = _slug(name)
        image_url = f'/orals/{img_slug}.png'
        product_doc = {
            'category_id': cat_id,
            'category_slug': cat_slug,
            'category': cat_slug,
            'image': image_url,
            'images': [image_url],
            'short_description': strength,
            'updated_at': now,
        }
        existing = await db.products.find_one({'slug': slug})
        if existing:
            await db.products.update_one({'id': existing['id']}, {'$set': product_doc})
            updated_products.append(slug)
        else:
            new_doc = {
                'id': str(uuid.uuid4()), 'slug': slug, 'name': name,
                'price': float(price), 'description': blurb + DISCLAIMER,
                'options': [], 'variants': [], 'stock': 0,
                'visible': True, 'featured': False, 'created_at': now,
                **product_doc,
            }
            await db.products.insert_one(new_doc)
            created_products.append(slug)

    return {
        'ok': True,
        'category': cat_slug,
        'category_image': tile_url,
        'created': created_products,
        'updated': updated_products,
    }


@router.post('/eloralintide')
async def seed_eloralintide(_admin: dict = Depends(require_admin)):
    """Idempotently seed the Eloralintide 10mg vial into the Vials category."""
    now = datetime.now(timezone.utc)
    cat = await db.categories.find_one({'slug': 'vials'})
    if not cat:
        return {'ok': False, 'error': 'Vials category not found'}
    slug = 'eloralintide-10mg'
    image_url = '/vials/eloralintide-10mg.png'
    payload = {
        'name': 'Eloralintide 10mg',
        'category_id': cat['id'],
        'category_slug': 'vials',
        'category': 'vials',
        'price': 95.0,
        'description': 'Eloralintide is a research amylin-analogue peptide investigated for weight-management and metabolic pathways. Supplied as a lyophilised 10mg vial. For laboratory research use only — not for human consumption.',
        'short_description': 'Amylin analogue · 10mg per vial',
        'image': image_url,
        'images': [image_url],
        'options': [],
        'variants': [{'label': '10mg', 'price': 95.0, 'stock': 6, 'vial_strength_mg': 10}],
        'stock': 6,
        'visible': True,
        'featured': False,
        'updated_at': now,
    }
    existing = await db.products.find_one({'slug': slug})
    if existing:
        await db.products.update_one({'id': existing['id']}, {'$set': payload})
        return {'ok': True, 'action': 'updated', 'slug': slug}
    payload.update({'id': str(uuid.uuid4()), 'slug': slug, 'created_at': now})
    await db.products.insert_one(payload)
    return {'ok': True, 'action': 'created', 'slug': slug}
