"""One-off: generate a single MT-2 pen product photograph using the same
pipeline as the rest of the pen catalogue. Pushes the image through Object
Storage (same path admin uploads use) and prints a public URL you can
right-click → save.

Usage:
    cd /app/backend && python generate_mt2_pen.py
"""
import asyncio
import base64
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from storage import APP_NAME, MIME_TYPES, put_object  # noqa: E402

PEN_REF = ROOT / "refs" / "pen_reference.webp"
BRAND_REF = ROOT / "refs" / "vial_reference.png"

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "test_database")
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
GEMINI_MODEL = "gemini-2.5-flash-image"

PRODUCT_NAME = "MT-2"


def build_prompt(product_name: str) -> str:
    return (
        "Create a professional pharmaceutical product photograph of an insulin-style injection pen "
        "in the EXACT physical style of the FIRST reference image. The pen must have: a long "
        "white plastic upper body with a removable matte-white cap, a polished silver/chrome "
        "cartridge holder in the lower half showing a small transparent dose-display window, and "
        "a small orange/red plastic ring at the very tip where the needle attaches. It should "
        "clearly read as a medical insulin pen, not a writing pen.\n\n"
        "Apply the GHP-Health BRAND from the SECOND reference image: place a glossy dark "
        "black-to-charcoal label wrap around the silver cartridge section that displays the "
        "gold/silver phoenix DNA-helix logo on the left, the 'GHP Health' wordmark, and the large "
        f"gold product name printed across the label reading: \"{product_name}\". Keep the hexagon "
        "background pattern from the brand reference visible on the label band.\n\n"
        "Behind the pen, lying flat on the surface, place a premium dark navy-black product box "
        f"with the gold phoenix DNA-helix logo on the left and the large gold product name \"{product_name}\" "
        "printed on the right of the box. The pen rests on top of the box.\n\n"
        "Setting: clean modern laboratory background, softly blurred with cool blue lighting "
        "(beakers and pipettes visible but out of focus), subtle reflection on the surface. "
        "Professional pharmaceutical product photography, sharp focus on the pen and box, "
        "square aspect ratio, no extra text, no watermarks."
    )


async def main():
    pen_b64 = base64.b64encode(PEN_REF.read_bytes()).decode()
    brand_b64 = base64.b64encode(BRAND_REF.read_bytes()).decode()

    session_id = f"img-mt2-{uuid.uuid4().hex[:8]}"
    chat = (
        LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message="You generate pharmaceutical product photography.",
        )
        .with_model("gemini", GEMINI_MODEL)
        .with_params(modalities=["image", "text"])
    )
    msg = UserMessage(
        text=build_prompt(PRODUCT_NAME),
        file_contents=[ImageContent(pen_b64), ImageContent(brand_b64)],
    )
    print(f"Generating {PRODUCT_NAME} pen photograph...")
    text, images = await chat.send_message_multimodal_response(msg)
    if not images:
        print("[ERROR] No image returned.")
        print(f"Model response: {str(text)[:300]}")
        return

    img = images[0]
    mime = img.get("mime_type", "image/png")
    ext = ".png" if "png" in mime else ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    contents = base64.b64decode(img["data"])
    storage_path = f"{APP_NAME}/uploads/{filename}"
    content_type = MIME_TYPES.get(ext, mime or "application/octet-stream")

    # Push to Object Storage (same as admin uploads)
    result = await asyncio.to_thread(put_object, storage_path, contents, content_type)

    # Register in uploads collection so /api/uploads/{filename} resolves
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    await db.uploads.insert_one({
        "id": str(uuid.uuid4()),
        "filename": filename,
        "storage_path": result["path"],
        "content_type": content_type,
        "size": result.get("size", len(contents)),
        "category": "image",
        "created_at": datetime.now(timezone.utc),
    })

    print("\n✅ MT-2 pen image uploaded to Object Storage.")
    print(f"   Filename : {filename}")
    print(f"   Size     : {len(contents) / 1024:.1f} KB")
    print(f"   URL path : /api/uploads/{filename}")


if __name__ == "__main__":
    asyncio.run(main())

