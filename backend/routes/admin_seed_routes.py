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

# (slug, name, price, research_name, short, description, strength_mg or None)
PACK_OCT_2026 = [
    ('cerebrolysin-60mg', 'Cerebrolysin 60mg', 35.0, 'Cerebrolysin', 'Neuropeptide mixture · 60mg per vial',
     'Cerebrolysin is a porcine-derived mixture of low-molecular-weight neuropeptides and free amino acids studied in neurotrophic-signalling and neuronal-plasticity research models. Supplied as a 60mg vial.', 60),
    ('ace-031-10mg', 'ACE-031 10mg', 165.0, 'ACE-031 (ActRIIB-Fc)', 'ActRIIB-Fc fusion protein · 10mg per vial',
     'ACE-031 is a soluble activin receptor type IIB fusion protein (ActRIIB-Fc) used in research on myostatin / activin signalling and skeletal-muscle biology. Supplied as a lyophilised 10mg vial.', 10),
    ('pinealon-10mg', 'Pinealon 10mg', 27.5, 'Pinealon (Glu-Asp-Arg)', 'Tripeptide bioregulator · 10mg per vial',
     'Pinealon is a synthetic tripeptide (Glu-Asp-Arg) bioregulator investigated in neuronal-cell and oxidative-stress research models. Supplied as a lyophilised 10mg vial.', 10),
    ('pe-22-28-10mg', 'PE-22-28 10mg', 32.5, 'PE-22-28 (spadin analogue)', 'Spadin analogue · 10mg per vial',
     'PE-22-28 is a short synthetic analogue of spadin studied in TREK-1 potassium-channel and neurogenesis research. Supplied as a lyophilised 10mg vial.', 10),
    ('peg-mgf-2mg', 'PEG-MGF 2mg', 25.0, 'PEG-MGF (pegylated mechano growth factor)', 'Pegylated MGF · 2mg per vial',
     'PEG-MGF is a pegylated form of mechano growth factor, an IGF-1 splice variant studied in muscle-satellite-cell and tissue-repair research models. Supplied as a lyophilised 2mg vial.', 2),
    ('pnc-27-10mg', 'PNC-27 10mg', 95.0, 'PNC-27', 'HDM-2 targeting peptide · 10mg per vial',
     'PNC-27 is a synthetic peptide derived from the p53 HDM-2 binding domain, fused to a membrane-penetrating sequence, used in in-vitro oncology cell-membrane research. Supplied as a lyophilised 10mg vial.', 10),
    ('hcg-5000iu', 'HCG 5000iu', 32.5, 'Human chorionic gonadotropin (hCG)', 'Gonadotropin · 5000iu per vial',
     'HCG (human chorionic gonadotropin) is a glycoprotein hormone used in reproductive-endocrinology and LH-receptor signalling research. Supplied as a lyophilised 5000iu vial.', None),
    ('hmg-75iu', 'HMG 75iu', 37.5, 'Human menopausal gonadotropin (hMG)', 'FSH + LH gonadotropin · 75iu per vial',
     'HMG (human menopausal gonadotropin) contains FSH and LH activity and is used in gonadotropin-receptor and reproductive-biology research. Supplied as a lyophilised 75iu vial.', None),
    ('vip-10mg', 'VIP 10mg', 42.5, 'Vasoactive intestinal peptide (VIP)', 'Neuropeptide · 10mg per vial',
     'VIP (vasoactive intestinal peptide) is a 28-amino-acid neuropeptide investigated in immune-modulation, smooth-muscle and VPAC-receptor signalling research. Supplied as a lyophilised 10mg vial.', 10),
    ('reta-5mg-cagri-5mg', 'Reta 5mg / Cagri 5mg', 65.0, 'Retatrutide + Cagrilintide blend', 'Triple-agonist + amylin analogue blend · 5mg + 5mg',
     'A research blend combining a GLP-1 / GIP / glucagon triple-agonist peptide with an amylin analogue, studied in metabolic and satiety-signalling research models. Supplied as a lyophilised vial containing 5mg + 5mg.', 10),
    ('gonadorelin-2mg', 'Gonadorelin 2mg', 17.5, 'Gonadorelin (GnRH)', 'GnRH decapeptide · 2mg per vial',
     'Gonadorelin is a synthetic gonadotropin-releasing hormone (GnRH) decapeptide used in hypothalamic-pituitary axis and GnRH-receptor research. Supplied as a lyophilised 2mg vial.', 2),
    ('p21-10mg', 'P21 10mg', 35.0, 'P21 (P021, CNTF-derived peptide)', 'CNTF-derived neurogenic peptide · 10mg per vial',
     'P21 (P021) is a synthetic peptide derived from ciliary neurotrophic factor, investigated in neurogenesis and synaptic-plasticity research models. Supplied as a lyophilised 10mg vial.', 10),
]


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


@router.get('/product-pack-oct-2026')
async def preview_product_pack(_admin: dict = Depends(require_admin)):
    """Which pack items already exist (by slug) — lets the UI show 'x of 12 imported'."""
    slugs = [p[0] for p in PACK_OCT_2026]
    existing = await db.products.find({'slug': {'$in': slugs}}, {'slug': 1}).to_list(50)
    have = {e['slug'] for e in existing}
    return {'total': len(slugs), 'existing': sorted(have), 'missing': [s for s in slugs if s not in have]}


@router.post('/product-pack-oct-2026')
async def seed_product_pack(_admin: dict = Depends(require_admin)):
    """Idempotently add the October 2026 vial pack. Existing slugs are left untouched (prices/stock you edited are kept)."""
    now = datetime.now(timezone.utc)
    cat = await db.categories.find_one({'slug': 'vials'})
    if not cat:
        return {'ok': False, 'error': 'Vials category not found'}
    created, skipped = [], []
    for slug, name, price, research_name, short, desc, strength in PACK_OCT_2026:
        if await db.products.find_one({'slug': slug}):
            skipped.append(slug)
            continue
        image_url = f'/vials/{slug}.png'
        label = name.split(' ', 1)[1] if ' ' in name else name
        variant = {'label': label, 'price': price, 'stock': 5}
        if strength:
            variant['vial_strength_mg'] = strength
        await db.products.insert_one({
            'id': str(uuid.uuid4()), 'slug': slug, 'name': name, 'research_name': research_name,
            'category_id': cat['id'], 'category_slug': 'vials', 'category': 'vials',
            'price': price, 'was_price': None, 'price_label': None,
            'description': desc + DISCLAIMER, 'short_description': short, 'tagline': '', 'badge': 'New',
            'image': image_url, 'images': [image_url], 'options': [], 'variants': [variant],
            'stock': 5, 'visible': True, 'featured': False,
            'created_at': now, 'updated_at': now,
        })
        created.append(slug)
    return {'ok': True, 'created': created, 'skipped': skipped}


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



@router.post('/amino1mq')
async def seed_5amino1mq(_admin: dict = Depends(require_admin)):
    """Idempotently seed the 5-Amino1MQ 50mg vial into the Vials category."""
    now = datetime.now(timezone.utc)
    cat = await db.categories.find_one({'slug': 'vials'})
    if not cat:
        return {'ok': False, 'error': 'Vials category not found'}
    slug = '5-amino1mq-50mg'
    image_url = '/vials/5-amino1mq-50mg.png'
    payload = {
        'name': '5-Amino1MQ 50mg',
        'category_id': cat['id'],
        'category_slug': 'vials',
        'category': 'vials',
        'price': 50.0,
        'description': '5-Amino1MQ is a research small-molecule investigated for NNMT inhibition and metabolic pathways relevant to body-composition and cellular energetics. Supplied as a lyophilised 50mg vial. For laboratory research use only — not for human consumption.',
        'short_description': 'NNMT inhibitor · 50mg per vial',
        'image': image_url,
        'images': [image_url],
        'options': [],
        'variants': [{'label': '50mg', 'price': 50.0, 'stock': 6, 'vial_strength_mg': 50}],
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


PEN_SLUGS = [
    'bpc-157-tb500-30mg-pen',
    'c4gr1-5mg-pen',
    'ghkcu-pen',
    'glow-70mg-pen',
    'klow-80mg-pen',
    'motsc-40mg-pen',
    'nad-pen',
    'r3t4trut1d3-pen',
    't1rz3p4t1d3-pen',
]


@router.post('/pen-boxes')
async def seed_pen_boxes(_admin: dict = Depends(require_admin)):
    """Repoint the 9 pen products to their new branded box images at /pens/{slug}.png.

    Idempotent — safe to call multiple times. Returns which slugs were updated
    and which weren't found.
    """
    now = datetime.now(timezone.utc)
    updated: list[str] = []
    missing: list[str] = []
    for slug in PEN_SLUGS:
        image_url = f'/pens/{slug}.png'
        res = await db.products.update_one(
            {'slug': slug},
            {'$set': {'image': image_url, 'images': [image_url], 'updated_at': now}},
        )
        if res.matched_count:
            updated.append(slug)
        else:
            missing.append(slug)
    return {'ok': True, 'updated': updated, 'missing': missing}
