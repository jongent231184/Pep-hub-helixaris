"""Export the product catalogue (prices, images, research profiles) to CSV + JSON for external use."""
import os
import asyncio
import csv
import json

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

BASE = os.environ.get('EXPORT_BASE_URL', 'https://www.ghp-health.com')
OUT = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'public', 'exports')


def absu(u):
    if not u:
        return ''
    return u if u.startswith('http') else BASE + u


def join(v):
    if isinstance(v, list):
        return ' | '.join(str(x) for x in v)
    return v or ''


async def build_rows(db, base_url: str) -> list[dict]:
    cats = {c['id']: c.get('name') async for c in db.categories.find({})}
    absu = lambda u: ('' if not u else u if u.startswith('http') else base_url + u)  # noqa: E731
    rows = []
    async for p in db.products.find({}).sort([('category', 1), ('name', 1)]):
        rp = p.get('research_profile') or {}
        refs = rp.get('references') or []
        rows.append({
            'id': p.get('id'), 'slug': p.get('slug'), 'name': p.get('name'), 'tagline': p.get('tagline', ''),
            'category': cats.get(p.get('category_id')) or p.get('category', ''), 'category_slug': p.get('category_slug') or p.get('category', ''),
            'price_gbp': p.get('price'), 'was_price_gbp': p.get('was_price') or '', 'price_label': p.get('price_label') or '',
            'options': join(p.get('options')), 'stock': p.get('stock'), 'visible': p.get('visible', True),
            'featured': p.get('featured', False), 'badge': p.get('badge', ''),
            'short_description': p.get('short_description', ''), 'description': p.get('description', ''),
            'image_url': absu(p.get('image')), 'image_urls': ' | '.join(absu(i) for i in (p.get('images') or [])),
            'product_url': f"{base_url}/product/{p.get('slug')}",
            'rp_overview': rp.get('overview', ''), 'rp_molecular_class': rp.get('molecular_class', ''),
            'rp_molecular_formula': rp.get('molecular_formula', ''), 'rp_molecular_weight': rp.get('molecular_weight', ''),
            'rp_sequence': rp.get('sequence', ''), 'rp_receptor_target': rp.get('receptor_target', ''),
            'rp_mechanism': rp.get('mechanism', ''), 'rp_signalling': rp.get('signalling', ''),
            'rp_areas_of_research': join(rp.get('areas_of_research')), 'rp_study_systems': join(rp.get('study_systems')),
            'rp_key_finding': rp.get('key_finding', ''), 'rp_limitations': rp.get('limitations', ''),
            'rp_open_questions': join(rp.get('open_questions')), 'rp_storage_handling': rp.get('storage_handling', ''),
            'rp_references': ' | '.join((r.get('citation') or r.get('title') or json.dumps(r)) if isinstance(r, dict) else str(r) for r in refs),
            'created_at': str(p.get('created_at') or ''), 'updated_at': str(p.get('updated_at') or ''),
        })
    return rows


def rows_to_csv(rows: list[dict]) -> str:
    import io
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=list(rows[0].keys()) if rows else ['id']); w.writeheader(); w.writerows(rows)
    return '\ufeff' + buf.getvalue()


async def main():
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    rows = await build_rows(db, BASE)
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, 'ghp-products.csv'), 'w', newline='', encoding='utf-8') as f:
        f.write(rows_to_csv(rows))
    with open(os.path.join(OUT, 'ghp-products.json'), 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, indent=1, default=str)
    print(len(rows), 'rows;', sum(1 for r in rows if r['rp_overview']), 'with research profile;', sum(1 for r in rows if not r['image_url']), 'without image')


if __name__ == '__main__':
    asyncio.run(main())
