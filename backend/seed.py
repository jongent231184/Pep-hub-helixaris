"""Seed initial categories, products, settings, admin user."""
import os
import uuid
from datetime import datetime
from db import db
from auth import hash_password


async def seed_admin():
    email = os.environ.get('ADMIN_EMAIL', 'admin@ghpresearch.com')
    password = os.environ.get('ADMIN_PASSWORD', 'admin123')
    existing = await db.users.find_one({'email': email})
    if existing:
        # ensure role is admin
        if existing.get('role') != 'admin':
            await db.users.update_one({'id': existing['id']}, {'$set': {'role': 'admin'}})
        return
    await db.users.insert_one({
        'id': str(uuid.uuid4()),
        'email': email,
        'password_hash': hash_password(password),
        'first_name': 'Admin',
        'last_name': '',
        'role': 'admin',
        'created_at': datetime.utcnow(),
    })
    print(f'[seed] Admin user created: {email}')


async def seed_categories():
    if await db.categories.count_documents({}) > 0:
        return
    cats = [
        {'slug': 'nasals', 'name': 'Nasals', 'image': 'https://content.webfactorysite.co.uk/fc947db4-0a0c-42a2-93cc-79cf480b9ef6.jpg?t=1778498360', 'sort_order': 1},
        {'slug': 'pens', 'name': 'Pens', 'image': 'https://content.webfactorysite.co.uk/4639223a-7e0f-4402-9e8e-ab1272bdb634.jpg?t=1778498461', 'sort_order': 2},
        {'slug': 'vials', 'name': 'Vials', 'image': 'https://content.webfactorysite.co.uk/2c97257d-c88b-49e1-b4df-b3a28355dd65.jpg?t=1778498730', 'sort_order': 3},
        {'slug': 'syringes-and-wipes', 'name': 'Syringes & Wipes', 'image': 'https://content.webfactorysite.co.uk/246cad10-cfb2-4790-a946-a4e85afc7226.jpg?t=1778498846', 'sort_order': 4},
        {'slug': 'bundles', 'name': 'Bundles', 'image': '', 'sort_order': 5},
    ]
    for c in cats:
        c['id'] = str(uuid.uuid4())
        c['visible'] = True
        c['created_at'] = datetime.utcnow()
        await db.categories.insert_one(c)
    print(f'[seed] {len(cats)} categories seeded')


PRODUCTS_SEED = [
    # Vials
    ('5-amino-1mq-50mg', '5 Amino-1MQ 50mg', 'vials', 55.00, 'https://content.webfactorysite.co.uk/ff806a80-6c5e-48ca-b5ce-7c85b1b5c7c9_largeish.png?t=1780853729', 'Research-grade 5 Amino-1MQ 50mg. Supplied for laboratory research use only.'),
    ('ahkcu-100mg', 'AHKcu 100mg', 'vials', 40.00, 'https://content.webfactorysite.co.uk/b74c0948-6b6e-4eeb-8596-5539257d62c3_largeish.png?t=1780854701', 'Research-grade AHKcu copper peptide. Laboratory research use only.'),
    ('bac-water', 'BAC WATER', 'vials', 2.50, 'https://content.webfactorysite.co.uk/60c7cd6d-5dc4-4bb9-82d7-f686e342cb5d_largeish.jpg?t=1780866386', 'Bacteriostatic water for laboratory reconstitution of research peptides.'),
    ('bpc-157-10mg', 'BPC 157 10mg', 'vials', 30.00, 'https://content.webfactorysite.co.uk/853ef832-a922-42f9-ac4e-48c6d531bfce_largeish.png?t=1780853358', 'Research-grade BPC-157. Laboratory research use only.'),
    ('c4gr1-5mg', 'C4GR1 5mg', 'vials', 37.50, 'https://content.webfactorysite.co.uk/2b435737-3555-4325-9efd-2cd349324cdd_largeish.png?t=1780811870', 'Research-grade C4GR1 5mg. Laboratory research use only.'),
    ('cjc-no-dac-and-ipamorelin-10mg', 'CJC (No Dac) & IPAMORELIN 10mg', 'vials', 32.50, 'https://content.webfactorysite.co.uk/cf8c1333-9f09-49e0-b641-82f8f3498a3e_largeish.jpg?t=1780864869', 'Research-grade CJC (No Dac) blended with Ipamorelin 10mg.'),
    ('dsip-15mg', 'DSIP 15mg', 'vials', 18.00, 'https://content.webfactorysite.co.uk/ba29e87a-f958-4347-9f34-459cc65a32ae_largeish.png?t=1780898486', 'Research-grade DSIP (Delta Sleep-Inducing Peptide) 15mg.'),
    ('ghkcu', 'GHKcu', 'vials', 25.00, 'https://content.webfactorysite.co.uk/9c3e1c9c-cc4d-4f13-ac0a-fd2b7ec9bfa8_largeish.jpg?t=1780863927', 'Research-grade GHK-Cu copper peptide.'),
    ('glow-70mg', 'GLOW 70mg', 'vials', 50.00, 'https://content.webfactorysite.co.uk/4c5ced95-0182-4341-b08f-fb1668604ecd_largeish.jpg?t=1780863502', 'Research-grade GLOW 70mg blend.'),
    ('glutathione-1500mg', 'GLUTATHIONE 1500mg', 'vials', 42.50, 'https://content.webfactorysite.co.uk/26db378f-952b-4733-b31e-7a0ea92398c3_largeish.jpg?t=1780866097', 'Research-grade Glutathione 1500mg.'),
    ('hexarelin-5mg', 'HEXARELIN 5mg', 'vials', 25.00, 'https://content.webfactorysite.co.uk/7fe90584-3bd7-471e-88b1-79c0d7f20671_largeish.jpg?t=1780864746', 'Research-grade Hexarelin 5mg.'),
    ('igf-1-lr3', 'IGF-1 LR3', 'vials', 50.00, 'https://content.webfactorysite.co.uk/52fcd7cb-353f-4700-b0e7-cb6e8b54ce57_largeish.jpg?t=1780864596', 'Research-grade IGF-1 LR3.'),
    ('r3t4trut1d3', 'R3T4TRUT1D3', 'vials', 37.50, 'https://content.webfactorysite.co.uk/efd4e8aa-fb19-4bce-a43d-ba6dabef1c01_largeish.png?t=1780821513', 'Research-grade R3T4TRUT1D3. Supplied for laboratory research use only.'),

    # Nasals
    ('mt-2-10mg-nasal', 'MT-2 10mg Nasal', 'nasals', 25.00, 'https://content.webfactorysite.co.uk/7bf6a213-df88-477a-95fd-168338de84e5_largeish.png?t=1780855893', 'Research-grade MT-2 nasal spray 10mg.'),
    ('selank-10mg-nasal', 'Selank 10mg Nasal', 'nasals', 35.00, 'https://content.webfactorysite.co.uk/7ad04606-7932-46d6-9880-f5a5b1e7951d_largeish.png?t=1780856059', 'Research-grade Selank nasal spray 10mg.'),
    ('semax-10mg-nasal', 'Semax 10mg Nasal', 'nasals', 32.50, 'https://content.webfactorysite.co.uk/73086b27-b52c-411e-88e2-04217e6e35d3_largeish.png?t=1780856172', 'Research-grade Semax nasal spray 10mg.'),

    # Pens
    ('bpc-157-tb500-30mg-pen', 'BPC-157 / TB500 30mg Pen', 'pens', 110.00, '/pens/bpc-157-tb500-30mg-pen.png', 'Research-grade BPC-157 / TB500 30mg dosing pen.'),
    ('c4gr1-5mg-pen', 'C4GR1 5mg pen', 'pens', 52.50, '/pens/c4gr1-5mg-pen.png', 'Research-grade C4GR1 5mg dosing pen.'),
    ('ghkcu-pen', 'GHKcu Pen', 'pens', 57.50, '/pens/ghkcu-pen.png', 'Research-grade GHKcu dosing pen.'),
    ('glow-70mg-pen', 'GLOW 70mg Pen', 'pens', 55.00, '/pens/glow-70mg-pen.png', 'Research-grade GLOW 70mg dosing pen.'),
    ('klow-80mg-pen', 'KLOW 80mg Pen', 'pens', 65.00, '/pens/klow-80mg-pen.png', 'Research-grade KLOW 80mg dosing pen.'),
    ('motsc-40mg-pen', 'MOTSc 40mg Pen', 'pens', 55.00, '/pens/motsc-40mg-pen.png', 'Research-grade MOTSc 40mg dosing pen.'),
    ('nad-pen', 'NAD + Pen', 'pens', 65.00, '/pens/nad-pen.png', 'Research-grade NAD+ dosing pen.'),
    ('r3t4trut1d3-pen', 'R3T4TRUT1D3 Pen', 'pens', 87.50, '/pens/r3t4trut1d3-pen.png', 'Research-grade R3T4TRUT1D3 dosing pen.'),
    ('t1rz3p4t1d3-pen', 'T1RZ3P4T1D3 Pen', 'pens', 75.00, '/pens/t1rz3p4t1d3-pen.png', 'Research-grade T1RZ3P4T1D3 dosing pen.'),

    # Syringes
    ('10-x-03ml-8mm-30g-insulin-syringe', '10 x 0.3ml 8mm x 30g Insulin Syringe and needles with alcohol wipes', 'syringes-and-wipes', 4.50, 'https://content.webfactorysite.co.uk/a3c735d5-51ed-4dbc-a085-32cdaf7f10f0_largeish.png?t=1780857564', '10 x 0.3ml 8mm x 30g insulin syringes with alcohol wipes.'),
    ('10-x-1ml-05-inch-unisharp', '10 x 1ml 0.5 inch multi coloured Unisharp Syringe and needles with alcohol wipes', 'syringes-and-wipes', 4.50, 'https://content.webfactorysite.co.uk/e81db4cb-f2b1-4410-8ced-0296b20ff81f_largeish.png?t=1780857374', '10 x 1ml 0.5 inch Unisharp syringes with alcohol wipes.'),
    ('10-x-31g-pen-needles', '10 x 31G 0.25mm x 6mm Pen Needles with wipes', 'syringes-and-wipes', 2.50, 'https://content.webfactorysite.co.uk/1d7a400b-9cc7-4786-9831-f3b9f0ca4af3_largeish.png?t=1780857490', '10 x 31G 0.25mm x 6mm pen needles with alcohol wipes.'),

    # Bundles
    ('super-shredder', 'Super shredder', 'bundles', 40.00, 'https://content.webfactorysite.co.uk/16edb920-4e65-4fa7-955c-0117a6fc3dbd_largeish.png?t=1781525645', 'Super shredder research bundle.'),
    ('neurological-trio', 'Neurological trio', 'bundles', 65.00, 'https://content.webfactorysite.co.uk/beb1992d-4604-4c8c-a4aa-8bee01e59413_largeish.png?t=1781351141', 'Make a nice saving when bought together.'),
    ('stay-beautiful-beauty-stack', 'Stay beautiful with this beauty stack', 'bundles', 75.00, 'https://content.webfactorysite.co.uk/44fba0da-2223-41f5-aec4-01840a4a5ec4_largeish.png?t=1781298800', 'Great saving when bought together.'),
    ('t1rz3p4t1d3-20mg-x3-multipack', 'T1RZ3P4T1D3 20mg x 3 multipack', 'bundles', 152.00, 'https://content.webfactorysite.co.uk/ad818e16-44ec-46eb-9bd4-911f6d4f16c0_largeish.png?t=1781298093', 'Huge discounts when bought together.'),
    ('mitochondria-stack', 'Mitochondria stack', 'bundles', 170.00, 'https://content.webfactorysite.co.uk/ac987720-13ea-485c-809a-98df18d55fc1_largeish.png?t=1781297568', 'Super savings over 10% off when bought together.'),
    ('r3t4-tesa-motsc-ultimate-power-combo', 'R3T4 / TESA / MOTSc (Ultimate power Combo)', 'bundles', 167.50, 'https://content.webfactorysite.co.uk/a8236e9b-95ad-4dd2-b6fe-da832dd1c231_largeish.png?t=1781296555', 'Buy the power stack and make a huge 15% saving.'),
]

BUNDLE_EXTRAS = {
    'super-shredder': {'badge': '', 'featured': True},
    'neurological-trio': {'badge': 'Recommended', 'tagline': 'Make a nice saving when bought together.', 'featured': True},
    'stay-beautiful-beauty-stack': {'badge': 'Popular', 'was_price': 90.00, 'featured': True},
    't1rz3p4t1d3-20mg-x3-multipack': {'badge': 'Great Value', 'was_price': 180.00, 'featured': True},
    'mitochondria-stack': {'featured': True},
    'r3t4-tesa-motsc-ultimate-power-combo': {'badge': 'Popular', 'was_price': 195.00, 'featured': True},
    'r3t4trut1d3': {'tagline': 'Weight loss', 'options': ['R3T4TRUT1D3 5mg', 'R3T4TRUT1D3 10mg', 'R3T4TRUT1D3 20mg', 'R3T4TRUT1D3 30mg', 'R3T4TRUT1D3 50mg']},
    'c4gr1-5mg-pen': {'tagline': 'Appetite suppressant'},
    'glow-70mg-pen': {'tagline': 'Makes you glow', 'badge': 'Popular'},
    'klow-80mg-pen': {'tagline': 'Glow with KPV', 'badge': 'Recommended'},
    'selank-10mg-nasal': {'badge': 'Popular'},
}


async def seed_products():
    if await db.products.count_documents({}) > 0:
        return
    now = datetime.utcnow()
    for slug, name, cat, price, image, description in PRODUCTS_SEED:
        extras = BUNDLE_EXTRAS.get(slug, {})
        doc = {
            'id': str(uuid.uuid4()),
            'slug': slug,
            'name': name,
            'category': cat,
            'price': price,
            'was_price': extras.get('was_price'),
            'price_label': None,
            'image': image,
            'images': [],
            'description': description,
            'tagline': extras.get('tagline', ''),
            'badge': extras.get('badge', ''),
            'options': extras.get('options', []),
            'stock': 999,
            'visible': True,
            'featured': extras.get('featured', False),
            'created_at': now,
            'updated_at': now,
        }
        await db.products.insert_one(doc)
    print(f'[seed] {len(PRODUCTS_SEED)} products seeded')


async def seed_settings():
    if await db.settings.find_one({'_singleton': True}):
        return
    await db.settings.insert_one({
        '_singleton': True,
        'site_name': 'GHP-Health',
        'contact_email': 'GHP-Health@outlook.com',
        'customer_hours': 'Mon - Fri: 9am - 5pm (GMT)',
        'tiktok': 'https://www.tiktok.com/@gh_peps_uk',
        'instagram': 'https://www.instagram.com/ghp_health',
        'wholesale_banner': 'Wholesale now available - please email team for further information',
        'free_shipping_threshold': 50.0,
        'flat_shipping': 4.99,
        'currency': 'GBP',
        'currency_symbol': '£',
    })
    print('[seed] settings seeded')


async def run_all():
    await seed_admin()
    await seed_categories()
    await seed_products()
    await seed_settings()
