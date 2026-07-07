"""One-off: bulk-create the 16 new vial products in the preview DB."""
import asyncio
import uuid
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
import os

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

NEW_VIALS = [
    ("BPC-157 / TB500",   "bpc-157-tb500"),
    ("MT-2 10mg",         "mt-2-10mg"),
    ("MT-1 10mg",         "mt-1-10mg"),
    ("Tesamorelin 10mg",  "tesamorelin-10mg"),
    ("TB-500 10mg",       "tb-500-10mg"),
    ("Selank 10mg",       "selank-10mg"),
    ("Semax 10mg",        "semax-10mg"),
    ("PT-141 10mg",       "pt-141-10mg"),
    ("SS-31 10mg",        "ss-31-10mg"),
    ("SLU-PP 5mg",        "slu-pp-5mg"),
    ("Ipamorelin 10mg",   "ipamorelin-10mg"),
    ("Kisspeptin 10mg",   "kisspeptin-10mg"),
    ("KLOW 80mg",         "klow-80mg-vial"),
    ("KPV 10mg",          "kpv-10mg"),
    ("MOTS-C 40mg",       "mots-c-40mg"),
    ("NAD +",             "nad-plus"),
]


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ.get("DB_NAME", "test_database")]
    # Use R3TA's current image as a temporary placeholder; the generator overwrites it.
    r3ta = await db.products.find_one({"slug": "r3t4trut1d3"})
    placeholder = r3ta["image"] if r3ta else ""
    created, skipped = 0, 0
    for name, slug in NEW_VIALS:
        if await db.products.find_one({"slug": slug}):
            print(f"SKIP (exists): {slug}")
            skipped += 1
            continue
        now = datetime.utcnow()
        doc = {
            "id": str(uuid.uuid4()),
            "slug": slug,
            "name": name,
            "category": "vials",
            "price": 37.50,
            "was_price": None,
            "price_label": None,
            "image": placeholder,
            "images": [],
            "description": f"Research-grade {name}. Supplied for laboratory research use only.",
            "tagline": "",
            "badge": "",
            "options": [],
            "variants": [],
            "stock": 5,
            "visible": True,
            "featured": False,
            "created_at": now,
            "updated_at": now,
        }
        await db.products.insert_one(doc)
        print(f"CREATED: {slug} ({name})")
        created += 1
    print(f"\nDone. Created={created} Skipped={skipped}")


if __name__ == "__main__":
    asyncio.run(main())
