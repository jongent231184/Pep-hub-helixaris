"""Generate Helixaris nasal + oral product photos using the clean vial style
(transparent glass vial + dark navy label wrap only). Nasals become vial-style
containers; orals use a similar small-vial container concept for consistency
with the vial catalog.
"""
import asyncio
import base64
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

load_dotenv()

REF = Path('/app/backend/uploads/helixaris_vial_label_ref.png')
OUT_DIR = Path('/app/frontend/public/brands/helixaris/products')
OUT_DIR.mkdir(parents=True, exist_ok=True)

# (slug, compound, strength) — same clean vial style as the vials pass
PRODUCTS = [
    # Nasals — labelled as intranasal but keep same vial format
    ('mt-2-10mg-nasal',     'MT-2 NASAL',       '10MG'),
    ('selank-10mg-nasal',   'SELANK NASAL',     '10MG'),
    ('semax-10mg-nasal',    'SEMAX NASAL',      '10MG'),
    # Orals — kept in vial format for catalog consistency
    ('5-amino-1mq-50mg',                     '5-AMINO-1MQ',        '50MG'),
    ('bam15-50mg',                           'BAM15',              '50MG'),
    ('methylene-blue-20mg',                  'METHYLENE BLUE',     '20MG'),
    ('minoxidil-5mg',                        'MINOXIDIL',          '5MG'),
    ('slupp-332-250mcg-bma-15-50mcg-300mcg', 'SLUPP-332 / BAM15',  'BLEND'),
    ('slupp-332-50mg',                       'SLUPP-332',          '50MG'),
    ('tesofensine-500mcg',                   'TESOFENSINE',        '500MCG'),
    ('tirzepatide-500mcg',                   'T1RZ3P4T1D3',        '500MCG'),
]


def build_prompt(compound: str, mg: str) -> str:
    return (
        f'CRITICAL — READ FIRST:\n'
        f'The compound name printed on this vial label MUST be exactly "{compound}" '
        f'(spelled with every character as written). DO NOT use "TRIZEPATIDE" or any '
        f'other name from the reference image. The reference is only for STYLE, not TEXT.\n\n'
        'Create a photorealistic pharmaceutical product photo of a small transparent glass '
        'peptide vial standing upright on a soft, out-of-focus light-grey studio background. '
        'The vial has a silver aluminium crimp cap on top and contains a small amount of white '
        'lyophilised powder at the bottom (visible through the glass). Studio lighting: soft key '
        'light from front-left with a subtle rim highlight, natural shadow beneath the vial.\n\n'
        'The vial is wrapped with a DARK NAVY (#050b1a) rectangular label — ONLY the dark navy '
        'centre panel. Absolutely NO holographic side panels, no iridescent borders, no rainbow '
        'foil edges. Just a clean rectangular dark navy label wrap.\n\n'
        'Label content (matching the attached reference image exactly — same fonts, weights, '
        'kerning, colours, layout):\n'
        '- Top: silver metallic DNA-helix icon next to the "HELIXARIS" wordmark in white, with '
        '"BIOSCIENCE" underneath in light blue (#7ec8ff).\n'
        '- A slim white divider line, then the tagline "ADVANCING PEPTIDE RESEARCH" in light-blue '
        'small caps.\n'
        '- Faint blue molecular-structure watermark on the left of the label and faint blue '
        'DNA-double-helix watermark on the right.\n'
        f'- Large white bold compound name centred on the label: "{compound}".\n'
        f'- Underneath, a thin-outlined rounded rectangle mg-strength badge: "{mg}" in white.\n'
        '- Below the badge: "RESEARCH USE ONLY" in light blue small caps, and "NOT FOR HUMAN '
        'CONSUMPTION" underneath in white small caps.\n'
        '- Footer inside label: "FOR LABORATORY RESEARCH USE ONLY  ·  PURITY ≥ 99% HPLC" in '
        'small white caps.\n\n'
        'DO NOT include: holographic borders, iridescent panels, side info panels with QR codes '
        'or lot numbers, storage icons, or any rainbow/foil textures. The label wrap is a single '
        'flat dark navy rectangle only.\n\n'
        'Output a single high-resolution, product-catalog-ready photo. Front-facing perspective, '
        'entire vial visible with a little empty space above and below.'
    )


async def generate_one(sem, key, ref_b64, slug, compound, mg):
    out_path = OUT_DIR / f'{slug}.png'
    async with sem:
        chat = LlmChat(
            api_key=key,
            session_id=f'helixaris-nasoral-{slug}',
            system_message=(
                'You are a pharmaceutical product photographer. Produce clean minimalist '
                'catalog vial photos with a dark navy label wrap only.'
            ),
        ).with_model('gemini', 'gemini-3.1-flash-image-preview').with_params(modalities=['image', 'text'])
        try:
            text, images = await chat.send_message_multimodal_response(
                UserMessage(text=build_prompt(compound, mg), file_contents=[ImageContent(image_base64=ref_b64)])
            )
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
    targets = [(s, c, m) for s, c, m in PRODUCTS if not only or s in only]
    print(f'Generating {len(targets)} Helixaris nasals+orals (parallel=3)...')
    sem = asyncio.Semaphore(3)
    results = await asyncio.gather(*(generate_one(sem, key, ref_b64, s, c, m) for s, c, m in targets))
    print(f'\nDONE. {sum(results)}/{len(results)} succeeded.')


if __name__ == '__main__':
    asyncio.run(main(only=sys.argv[1:] or None))
