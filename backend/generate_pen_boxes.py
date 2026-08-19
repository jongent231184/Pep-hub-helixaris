"""Generate branded GHP Health pen box images from a shared reference photo.

Uses the same base64-reference technique that produced the Eloralintide vial:
send the reference image + a strict "match everything, only swap the compound
name" prompt to Gemini's nano-banana image model.

Outputs are written to /app/frontend/public/pens/{slug}.png so the frontend can
serve them directly at `/pens/{slug}.png`.
"""
import asyncio
import base64
import mimetypes
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

load_dotenv()

REF = Path('/app/backend/uploads/pen_box_ref.png')
OUT_DIR = Path('/app/frontend/public/pens')
OUT_DIR.mkdir(parents=True, exist_ok=True)

# (slug, box_line_1)  – the compound name printed on the box in the same
# gold/silver mixed metallic font as the reference. Everything else stays
# pixel-identical.
PENS = [
    ('bpc-157-tb500-30mg-pen', 'BPC-157 / TB500 30MG'),
    ('c4gr1-5mg-pen',          'C4GR1 5MG'),
    ('ghkcu-pen',              'GHKcu 100MG'),
    ('glow-70mg-pen',          'GLOW 70MG'),
    ('klow-80mg-pen',          'KLOW 80MG'),
    ('motsc-40mg-pen',         'MOTSc 40MG'),
    ('nad-pen',                'NAD+'),
    ('r3t4trut1d3-pen',        'R3T4TRUT1D3'),
    ('t1rz3p4t1d3-pen',        'T1RZ3P4T1D3'),
]


def build_prompt(compound_line: str) -> str:
    return (
        "Using the attached reference image as the exact style, layout and branding, create a new "
        "GHP Health pharmaceutical peptide pen product photograph.\n\n"
        "MATCH EXACTLY (do not change any of the following):\n"
        "- Same 3/4 angle, same lighting, same shadow, same white studio background.\n"
        "- Same matte-black rectangular product box with subtle gold trim on the bottom edge.\n"
        "- Same faint DNA helix + molecular hexagon watermark on the right side of the box.\n"
        "- Same gold/silver metallic 'GHP Health' wordmark in the top-left of the box lid.\n"
        "- Same silver/gold DNA helix logo icon to the left of the wordmark.\n"
        "- Same identical white injection pen (NO gold/coloured accents on the pen — plain white body "
        "with small gold ring near the dose window and slim gold plunger cap) lying inside a black "
        "moulded plastic tray below the box.\n"
        "- Same five identical black/dark-grey needle-cap tips arranged in a row inside the tray under "
        "the pen.\n"
        "- Same 'PEPTIDE INJECTION PEN' sub-line, same gold 'STORAGE:' label and same storage "
        "paragraph: 'Refrigerate at 2°C to 8°C (36°F to 46°F). Do not freeze. Protect from light.'\n"
        "- Same font family, same font sizes, same font weights, same text positions.\n\n"
        "THE ONLY DIFFERENCE:\n"
        f"Replace the compound name line on the box (currently reads 'TRIZEPATIDE PEPTIDE') with "
        f"'{compound_line} PEPTIDE' in the same mixed gold + silver metallic font, same size, same "
        "kerning, same position. Keep the 'INJECTION PEN' line below it unchanged.\n\n"
        "Do NOT add or remove any other elements. Do NOT change the pen colour. Do NOT alter the "
        "layout, tray, needle caps, background, or shadows. Output a single photorealistic product "
        "photo, high resolution."
    )


async def generate_one(chat_key: str, ref_b64: str, slug: str, compound_line: str) -> tuple[str, bool, str]:
    out_path = OUT_DIR / f'{slug}.png'
    chat = LlmChat(
        api_key=chat_key,
        session_id=f'pen-box-{slug}',
        system_message=(
            'You are a pharmaceutical product photography artist. Match the provided reference '
            'image exactly and only swap the compound name text as instructed.'
        ),
    )
    chat.with_model('gemini', 'gemini-3.1-flash-image-preview').with_params(modalities=['image', 'text'])
    msg = UserMessage(
        text=build_prompt(compound_line),
        file_contents=[ImageContent(image_base64=ref_b64)],
    )
    try:
        text, images = await chat.send_message_multimodal_response(msg)
    except Exception as e:  # noqa: BLE001
        return slug, False, f'ERROR: {type(e).__name__}: {e}'
    if not images:
        return slug, False, f'NO IMAGE returned: {text[:180]}'
    out_path.write_bytes(base64.b64decode(images[0]['data']))
    return slug, True, f'{out_path} ({out_path.stat().st_size // 1024}KB)'


async def main(only: list[str] | None = None):
    key = os.getenv('EMERGENT_LLM_KEY')
    if not key:
        print('MISSING EMERGENT_LLM_KEY')
        return
    if not REF.exists():
        print(f'MISSING REFERENCE: {REF}')
        return

    ref_b64 = base64.b64encode(REF.read_bytes()).decode()
    _mime = mimetypes.guess_type(str(REF))[0] or 'image/png'
    print(f'Reference loaded ({len(ref_b64)//1024}KB base64). Generating {len(PENS)} pen boxes...')

    pens = [(s, n) for s, n in PENS if not only or s in only]
    # Run 3 at a time so we don't overwhelm the API but finish quickly.
    sem = asyncio.Semaphore(3)

    async def worker(slug, name):
        async with sem:
            slug_r, ok, info = await generate_one(key, ref_b64, slug, name)
            print(f'[{"OK " if ok else "FAIL"}] {slug_r}: {info}')

    await asyncio.gather(*(worker(s, n) for s, n in pens))
    print('DONE.')


if __name__ == '__main__':
    args = sys.argv[1:]
    asyncio.run(main(only=args or None))
