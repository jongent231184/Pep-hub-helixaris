"""Mirror the 4 new batch-2 vials to production, using preview gen filenames."""
import asyncio, os, sys
from pathlib import Path
import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(ROOT))
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

PROD = "https://www.ghp-health.com"
NEW_SLUGS = ["igf1-lr3-1mg", "supershredder-10ml", "superhuman-blend-10ml", "b12-10mg"]


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
                print(f"MISSING in preview: {slug}"); continue
            exists = await http.get(f"{PROD}/api/products/{slug}")
            if exists.status_code == 200:
                print(f"exists on prod, updating image: {slug}")
                pid = exists.json()["id"]
                r = await http.put(f"{PROD}/api/products/{pid}",
                                   json={"image": src.get("image","")}, headers=headers)
                print(f"  {r.status_code}")
                continue
            payload = {k: src.get(k) for k in
                       ("slug","name","category","price","was_price","price_label",
                        "image","images","description","tagline","badge","options",
                        "variants","stock","visible","featured")}
            r = await http.post(f"{PROD}/api/products", json=payload, headers=headers)
            if r.status_code == 200:
                print(f"CREATED on prod: {slug} (img: {payload['image']})")
            else:
                print(f"FAIL {slug}: {r.status_code} {r.text[:200]}")


if __name__ == "__main__":
    asyncio.run(main())
