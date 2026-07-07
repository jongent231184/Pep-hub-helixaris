"""Mirror the 16 new vial products (records + images) from preview → production."""
import asyncio
import os
import sys
from pathlib import Path
import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

# Local DB access (preview)
sys.path.insert(0, str(ROOT))
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

PROD = "https://www.ghp-health.com"
UPLOADS_DIR = Path("/app/backend/uploads")

NEW_SLUGS = [
    "bpc-157-tb500", "mt-2-10mg", "mt-1-10mg", "tesamorelin-10mg",
    "tb-500-10mg", "selank-10mg", "semax-10mg", "pt-141-10mg",
    "ss-31-10mg", "slu-pp-5mg", "ipamorelin-10mg", "kisspeptin-10mg",
    "klow-80mg-vial", "kpv-10mg", "mots-c-40mg", "nad-plus",
]


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ.get("DB_NAME", "test_database")]

    async with httpx.AsyncClient(timeout=60) as http:
        login = await http.post(f"{PROD}/api/auth/login",
                                json={"email": "admin@ghp-health.com",
                                      "password": "GHP-Health26"})
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        for slug in NEW_SLUGS:
            src = await db.products.find_one({"slug": slug})
            if not src:
                print(f"MISSING in preview: {slug}")
                continue

            # Skip if already on prod
            exists = await http.get(f"{PROD}/api/products/{slug}")
            if exists.status_code == 200:
                print(f"exists on prod: {slug} — skipping")
                continue

            # Upload the image to production
            img_url = src.get("image", "")
            new_prod_img = ""
            if img_url.startswith("/api/uploads/"):
                fname = img_url.split("/")[-1]
                fpath = UPLOADS_DIR / fname
                if fpath.exists():
                    with open(fpath, "rb") as f:
                        up = await http.post(
                            f"{PROD}/api/uploads",
                            files={"file": (fname, f.read(), "image/png")},
                            headers=headers,
                        )
                    if up.status_code == 200:
                        new_prod_img = up.json()["url"]
                    else:
                        print(f"  image upload failed for {slug}: {up.status_code} {up.text[:120]}")

            # Create the product on production
            payload = {
                "slug": src["slug"],
                "name": src["name"],
                "category": src["category"],
                "price": src["price"],
                "was_price": src.get("was_price"),
                "price_label": src.get("price_label"),
                "image": new_prod_img or img_url,
                "images": src.get("images", []),
                "description": src.get("description", ""),
                "tagline": src.get("tagline", ""),
                "badge": src.get("badge", ""),
                "options": src.get("options", []),
                "variants": src.get("variants", []),
                "stock": src.get("stock", 5),
                "visible": src.get("visible", True),
                "featured": src.get("featured", False),
            }
            r = await http.post(f"{PROD}/api/products",
                                json=payload, headers=headers)
            if r.status_code == 200:
                print(f"CREATED on prod: {slug} (img: {new_prod_img or 'PLACEHOLDER'})")
            else:
                print(f"  FAIL {slug}: {r.status_code} {r.text[:200]}")


if __name__ == "__main__":
    asyncio.run(main())
