"""Generate the About Us hero image - cinematic wide lab shot with branded vials."""
import asyncio, base64, os, uuid
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent  # noqa: E402

BRAND_REF = ROOT / "refs" / "vial_reference.png"
PEN_REF = ROOT / "refs" / "pen_reference.webp"
UPLOADS_DIR = Path(os.environ.get("UPLOADS_DIR", ROOT / "uploads"))
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
MODEL = "gemini-2.5-flash-image"

PROMPT = (
    "Create a wide cinematic hero banner image (21:9 aspect ratio) for a premium pharmaceutical "
    "research brand. Foreground: three premium glass vials standing together in sharp focus, "
    "each with a dark black-to-charcoal label matching the FIRST reference image - hexagon "
    "pattern background, gold/silver phoenix DNA-helix logo, 'GHP Health' wordmark, and "
    "'For Research Purposes Only' vertical text. The vials sit on a polished dark surface "
    "with a subtle reflection. Background: a modern clinical research laboratory softly out of "
    "focus (depth-of-field bokeh) - blurred glass beakers, Erlenmeyer flasks, pipettes in a "
    "rack, faint glow of laboratory equipment, all bathed in cool blue cinematic lighting "
    "exactly like the SECOND reference image. Soft volumetric light beam from the upper left. "
    "Editorial pharmaceutical product photography, ultra-sharp foreground, professional colour "
    "grade with deep blues, charcoal blacks and warm gold accents on the vial labels. "
    "No text or watermarks anywhere except on the vial labels themselves."
)


async def main():
    brand_b64 = base64.b64encode(BRAND_REF.read_bytes()).decode()
    pen_b64 = base64.b64encode(PEN_REF.read_bytes()).decode()
    chat = (
        LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"about-hero-{uuid.uuid4().hex[:6]}",
                system_message="You produce cinematic pharmaceutical brand photography.")
        .with_model("gemini", MODEL)
        .with_params(modalities=["image", "text"])
    )
    text, images = await chat.send_message_multimodal_response(
        UserMessage(text=PROMPT, file_contents=[ImageContent(brand_b64), ImageContent(pen_b64)])
    )
    if not images:
        print("No image:", str(text)[:200])
        return
    img = images[0]
    ext = "png" if "png" in img.get("mime_type", "image/png") else "jpg"
    filename = f"about_hero_{uuid.uuid4().hex[:8]}.{ext}"
    (UPLOADS_DIR / filename).write_bytes(base64.b64decode(img["data"]))
    print(f"/api/uploads/{filename}")


if __name__ == "__main__":
    asyncio.run(main())
