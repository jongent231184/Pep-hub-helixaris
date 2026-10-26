"""Generate + persist research profiles for the Oct 2026 pack; also export to data/product_pack_oct2026_profiles.json."""
import asyncio
import json
import os
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()
from db import db  # noqa: E402
from routes.research_profile_routes import _generate_one  # noqa: E402
from routes.admin_seed_routes import PACK_OCT_2026  # noqa: E402

OUT = 'data/product_pack_oct2026_profiles.json'


async def main():
    os.makedirs('data', exist_ok=True)
    existing = json.load(open(OUT)) if os.path.exists(OUT) else {}
    for slug, name, _price, research_name, *_ in PACK_OCT_2026:
        if slug in existing:
            print(f'skip {slug}', flush=True)
            continue
        for attempt in range(3):
            try:
                data = await _generate_one(research_name)
                existing[slug] = data
                await db.products.update_one({'slug': slug}, {'$set': {'research_profile': data, 'updated_at': datetime.now(timezone.utc)}})
                json.dump(existing, open(OUT, 'w'), indent=1, default=str)
                print(f'OK {slug}', flush=True)
                break
            except Exception as e:
                print(f'retry {slug} ({attempt}): {e}', flush=True)
                await asyncio.sleep(2)
    print(f'done: {len(existing)}/{len(PACK_OCT_2026)}', flush=True)


asyncio.run(main())
