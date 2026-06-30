"""
Regenerate the 9 PEN products as proper dosing-pen injectors with GHP-Health
wrap-around label. Same brand identity as the vial reference, just on a cylindrical pen.
"""
import asyncio
import base64
import os
import uuid
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

REF_IMAGE = ROOT / "refs" / "vial_reference.png"
UPLOADS_DIR = Path(os.environ.get("UPLOADS_DIR", ROOT / "uploads"))
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "test_database")
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
GEMINI_MODEL = "gemini-2.5-flash-image"


def build_pen_prompt(product_name: str) -> str:
    return (
        "Using the supplied product photo only as the BRAND and LABEL design reference, create a "
        "new product photograph of a premium pharmaceutical DOSING PEN INJECTOR - a sleek "
        "cylindrical injection pen, similar in shape and proportions to a modern insulin pen "
        "(approximately 15cm long, with a tapered tip cap on one side and a dose dial/twist "
        "mechanism on the other). The pen body must have a glossy black/dark-silver finish. "
        "Wrap a label around the centre of the pen that mirrors the reference design: hexagon "
        "pattern, gold/silver DNA-helix logo, 'GHP Health' wordmark, 'For Research Purposes Only' "
        "vertical text on one edge, premium black-to-silver gradient. "
        f"The large gold product name printed across the lower section of the wrap-around label "
        f"must read: \"{product_name}\". Show the pen horizontally or at a slight angle, centred "
        "on a clean neutral light-grey studio background, professional product photography, "
        "soft lighting, square aspect ratio, no extra text or watermarks."
    )


async def generate_one(product: dict, ref_b64: str) -> str | None:
    session_id = f"img-pen-{product['id']}-{uuid.uuid4().hex[:6]}"
    chat = (
        LlmChat(api_key=EMERGENT_LLM_KEY, session_id=session_id, system_message="You generate product photography.")
        .with_model("gemini", GEMINI_MODEL)
        .with_params(modalities=["image", "text"])
    )
    msg = UserMessage(
        text=build_pen_prompt(product["name"]),
        file_contents=[ImageContent(ref_b64)],
    )
    try:
        text, images = await chat.send_message_multimodal_response(msg)
    except Exception as e:
        print(f"  [ERR] {product['name']}: {e}")
        return None
    if not images:
        print(f"  [WARN] {product['name']}: no image returned. {str(text)[:120]}")
        return None
    img = images[0]
    ext = "png" if "png" in img.get("mime_type", "image/png") else "jpg"
    filename = f"gen_{product['id']}.{ext}"
    (UPLOADS_DIR / filename).write_bytes(base64.b64decode(img["data"]))
    return f"/api/uploads/{filename}"


async def main():
    ref_b64 = base64.b64encode(REF_IMAGE.read_bytes()).decode()
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    products = await db.products.find({"category": "pens"}).sort("name", 1).to_list(50)
    print(f"Regenerating {len(products)} pen products...")
    success = 0
    for i, p in enumerate(products, 1):
        print(f"[{i}/{len(products)}] {p['name']}")
        url = await generate_one(p, ref_b64)
        if url:
            await db.products.update_one(
                {"id": p["id"]},
                {"$set": {"image": url, "updated_at": datetime.utcnow()}},
            )
            print(f"  -> {url}")
            success += 1
        await asyncio.sleep(0.5)
    print(f"\nDone. {success}/{len(products)} regenerated.")


if __name__ == "__main__":
    asyncio.run(main())
