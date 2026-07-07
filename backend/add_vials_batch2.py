"""Add 4 more vial products."""
import asyncio, uuid, os, sys
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(ROOT))
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

NEW_VIALS = [
    ("IGF1-LR3 1mg",        "igf1-lr3-1mg"),
    ("SuperShredder 10ml",  "supershredder-10ml"),
    ("SuperHuman Blend 10ml", "superhuman-blend-10ml"),
    ("B12 10mg",            "b12-10mg"),
]

async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ.get("DB_NAME", "test_database")]
    r3ta = await db.products.find_one({"slug": "r3t4trut1d3"})
    placeholder = r3ta["image"] if r3ta else ""
    for name, slug in NEW_VIALS:
        if await db.products.find_one({"slug": slug}):
            print(f"SKIP (exists): {slug}"); continue
        now = datetime.utcnow()
        await db.products.insert_one({
            "id": str(uuid.uuid4()),
            "slug": slug, "name": name, "category": "vials",
            "price": 37.50, "was_price": None, "price_label": None,
            "image": placeholder, "images": [],
            "description": f"Research-grade {name}. Supplied for laboratory research use only.",
            "tagline": "", "badge": "",
            "options": [], "variants": [], "stock": 5,
            "visible": True, "featured": False,
            "created_at": now, "updated_at": now,
        })
        print(f"CREATED: {slug} ({name})")

if __name__ == "__main__":
    asyncio.run(main())
