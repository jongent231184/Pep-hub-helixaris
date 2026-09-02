"""Generate Helixaris pen box product photos using the customer-supplied
Helixaris pen box mock-up as reference. Same 3/4 opened-box style we used
for GHP pens, swapping only the compound-name text.
"""
import asyncio
import base64
import os
from pathlib import Path

from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

load_dotenv()

REF = Path('/app/backend/uploads/helixaris_penbox_ref.png')
OUT_DIR = Path('/app/frontend/public/brands/helixaris/products')
OUT_DIR.mkdir(parents=True, exist_ok=True)

# (slug, box-title-text)  — kept obfuscated to match GHP compliance posture
PENS = [
    ('bpc-157-tb500-30mg-pen', 'BPC-157 / TB500 30MG'),
    ('c4gr1-5mg-pen',          'C4GR1 5MG'),
    ('ghkcu-pen',              'GHK-CU 100MG'),
    ('glow-70mg-pen',          'GLOW 70MG'),
    ('klow-80mg-pen',          'KLOW 80MG'),
    ('motsc-40mg-pen',         'MOTSc 40MG'),
    ('mt-2-10mg-pen',          'MT-2 10MG'),
    ('nad-pen',                'NAD+'),
    ('r3t4trut1d3-pen',        'R3T4TRUT1D3'),
    ('t1rz3p4t1d3-pen',        'T1RZ3P4T1D3'),
]


def build_prompt(title: str) -> str:
    return (
        f'CRITICAL — READ FIRST:\n'
        f'The compound-name title on the pen box MUST read exactly "{title} PEPTIDE" '
        f'(followed by "INJECTION PEN" on a second line). DO NOT use "TRIZEPATIDE" or '
        f'any other name from the reference. The reference is only for STYLE.\n\n'
        'Using the attached reference image as the exact style, layout and branding, '
        'create a new Helixaris Bioscience pharmaceutical injection-pen product '
        'photograph.\n\n'
        'MATCH EXACTLY:\n'
        '- Same 3/4 angle, same lighting, same shadow, same white studio background.\n'
        '- Same dark-navy rectangular product box with subtle blue DNA-helix illustration '
        'on the right side and a small "advancing peptide research" footer inside a slim '
        'blue line.\n'
        '- Same silver-metallic "HELIXARIS" wordmark with light-blue "BIOSCIENCE" '
        'underneath — appears at the top-centre of the lid AND on the vertical left side '
        'panel of the box.\n'
        '- Same silver DNA-helix icon to the left of the wordmark on the front face.\n'
        '- Same white plastic tray inside the opened box below the closed box, containing '
        'a white cylindrical injection pen with a slim blue accent ring near the dose '
        'window (no gold accents — this is Helixaris, silver + blue only). "HELIXARIS '
        'BIOSCIENCE" small wordmark printed on the pen body.\n'
        '- Same five identical dark-grey needle-cap tips arranged in a row inside the '
        'tray under the pen.\n'
        '- Same side info panel with LOT/EXP box and four blue icons: Keep refrigerated, '
        'Do not freeze, Protect from light, For single patient use only.\n'
        '- Same "For Research Use Only · Not for Human Consumption" copy under the title.\n'
        '- Same "STORAGE: Refrigerate at 2°C to 8°C (36°F to 46°F). Do not freeze. Protect '
        'from light." storage paragraph.\n'
        '- Same fonts, sizes, weights, positions and kerning for every element.\n\n'
        'THE ONLY DIFFERENCE:\n'
        f'- Replace the compound-name title (currently reads "TRIZEPATIDE PEPTIDE") with '
        f'"{title} PEPTIDE" in the same white bold typeface, same size and position, '
        f'with "INJECTION PEN" unchanged on the second line in light-blue small caps.\n\n'
        'Do NOT add or remove any other elements. Output a single high-resolution '
        'photorealistic product photograph.'
    )


async def generate_one(sem, key, ref_b64, slug, title):
    out_path = OUT_DIR / f'{slug}.png'
    async with sem:
        chat = LlmChat(
            api_key=key,
            session_id=f'helixaris-pen-{slug}',
            system_message=(
                'You are a pharmaceutical product photographer. Match the reference '
                'pen box exactly and only swap the compound-name text.'
            ),
        ).with_model('gemini', 'gemini-3.1-flash-image-preview').with_params(modalities=['image', 'text'])
        msg = UserMessage(text=build_prompt(title), file_contents=[ImageContent(image_base64=ref_b64)])
        try:
            text, images = await chat.send_message_multimodal_response(msg)
        except Exception as e:  # noqa: BLE001
            print(f'[FAIL] {slug}: {type(e).__name__}: {e}')
            return False
        if not images:
            print(f'[FAIL] {slug}: no image ({text[:120]!r})')
            return False
        out_path.write_bytes(base64.b64decode(images[0]['data']))
        print(f'[OK ] {slug} → {out_path} ({out_path.stat().st_size // 1024}KB)')
        return True


async def main(only=None):
    key = os.getenv('EMERGENT_LLM_KEY')
    if not key or not REF.exists():
        print('MISSING EMERGENT_LLM_KEY or reference')
        return
    ref_b64 = base64.b64encode(REF.read_bytes()).decode()
    targets = [(s, t) for s, t in PENS if not only or s in only]
    print(f'Generating {len(targets)} Helixaris pens (parallel=3)...')
    sem = asyncio.Semaphore(3)
    results = await asyncio.gather(*(generate_one(sem, key, ref_b64, s, t) for s, t in targets))
    print(f'\nDONE. {sum(results)}/{len(results)} succeeded.')


if __name__ == '__main__':
    import sys
    asyncio.run(main(only=sys.argv[1:] or None))
