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

REF = Path('/app/backend/uploads/helixaris_penbox_std.png')
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
        f'on line 1 and "INJECTION PEN" on line 2. DO NOT use "KLOW 80MG" or any other '
        f'name from the reference. The reference is only for STYLE / LAYOUT.\n\n'
        'Using the attached reference image as the exact style, layout, composition '
        'and branding, create a new Helixaris Bioscience injection-pen product photograph.\n\n'
        'MATCH EXACTLY (do not deviate from the reference layout):\n'
        '- Same shot composition: a CLOSED dark-navy pen-box shown at a slight 3/4 angle, '
        'AND an OPEN pen-box tray in front of/below it, containing the pen and 5 needle caps.\n'
        '- Same white studio background with soft natural shadow.\n'
        '- Same silver DNA-helix icon + "HELIXARIS" wordmark (silver) with "BIOSCIENCE" '
        '(light blue) at the TOP-CENTRE of the closed box.\n'
        '- Same large blue glowing DNA strand rendering on the RIGHT side of the closed box.\n'
        '- Same silver DNA-helix illustration on the LEFT side of the closed box.\n'
        '- Same "For Research Use Only · Not for Human Consumption" subtitle in one line '
        'below the compound name.\n'
        '- Same slim divider line, then "STORAGE:" label in light blue with snowflake icon.\n'
        '- Same storage paragraph: "Refrigerate at 2°C to 8°C (36°F to 46°F). Do not freeze. '
        'Protect from light."\n'
        '- Same "ADVANCING PEPTIDE RESEARCH" tagline near the bottom of the closed box.\n'
        '- Same vertical HELIXARIS BIOSCIENCE side label on the box left edge.\n'
        '- Same white injection pen inside the tray with silver + light-blue accent ring '
        '(NO gold accents) and small HELIXARIS BIOSCIENCE wordmark on the pen body.\n'
        '- Same 5 identical dark-grey needle-cap tips arranged in a row inside the tray.\n'
        '- Same "ADVANCING PEPTIDE RESEARCH" small caps at bottom edge of the tray.\n'
        '- Same fonts, weights, kerning, sizes and positions for every element.\n\n'
        f'THE ONLY DIFFERENCE:\n'
        f'- Replace the compound-name title ("KLOW 80MG PEPTIDE") with "{title} PEPTIDE" '
        f'in the same large white bold typeface. Keep "INJECTION PEN" unchanged on line 2 '
        'in light-blue small caps.\n\n'
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
