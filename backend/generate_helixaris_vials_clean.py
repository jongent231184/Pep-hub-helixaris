"""Generate Helixaris vial product photos in the CLEAN style:
transparent glass vial + dark navy centre-panel label only (no holographic
side panels). Uses the existing Helixaris label reference for brand elements.

Output: /app/frontend/public/brands/helixaris/products/{slug}.png
Overwrites existing files from the first pass.
"""
import asyncio
import base64
import os
from pathlib import Path

from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

load_dotenv()

REF = Path('/app/backend/uploads/helixaris_vial_label_ref.png')
OUT_DIR = Path('/app/frontend/public/brands/helixaris/products')
OUT_DIR.mkdir(parents=True, exist_ok=True)

# (slug, compound, mg) — same as the first pass
VIALS = [
    ('5-amino1mq-50mg',                 '5-AMINO1MQ',           '50MG'),
    ('ahkcu-100mg',                     'AHK-CU',               '100MG'),
    ('b12-10mg',                        'B12',                  '10MG'),
    ('bpc-157-10mg',                    'BPC-157',              '10MG'),
    ('bpc-157-tb500',                   'BPC-157 / TB-500',     'BLEND'),
    ('c4gr1-5mg',                       'C4GR1',                '5MG'),
    ('cjc-no-dac-and-ipamorelin-10mg',  'CJC / IPAMORELIN',     '10MG'),
    ('dsip-15mg',                       'DSIP',                 '15MG'),
    ('eloralintide-10mg',               'ELORALINTIDE',         '10MG'),
    ('ghkcu',                           'GHK-CU',               '100MG'),
    ('glow-70mg',                       'GLOW',                 '70MG'),
    ('glutathione-1500mg',              'GLUTATHIONE',          '1500MG'),
    ('hexarelin-5mg',                   'HEXARELIN',            '5MG'),
    ('igf-1-lr3',                       'IGF-1 LR3',            '1MG'),
    ('igf1-lr3-1mg',                    'IGF-1 LR3',            '1MG'),
    ('ipamorelin-10mg',                 'IPAMORELIN',           '10MG'),
    ('klow-80mg-vial',                  'KLOW',                 '80MG'),
    ('kpv-10mg',                        'KPV',                  '10MG'),
    ('kisspeptin-10mg',                 'KISSPEPTIN',           '10MG'),
    ('mots-c-40mg',                     'MOTS-C',               '40MG'),
    ('mt-1-10mg',                       'MT-1',                 '10MG'),
    ('mt-2-10mg',                       'MT-2',                 '10MG'),
    ('nad-plus',                        'NAD+',                 '500MG'),
    ('pt-141-10mg',                     'PT-141',               '10MG'),
    ('r3t4trut1d3',                     'R3T4TRUT1D3',          '10MG'),
    ('slu-pp-5mg',                      'SLU-PP-332',           '5MG'),
    ('ss-31-10mg',                      'SS-31',                '10MG'),
    ('selank-10mg',                     'SELANK',               '10MG'),
    ('semax-10mg',                      'SEMAX',                '10MG'),
    ('superhuman-blend-10ml',           'SUPERHUMAN BLEND',     '10ML'),
    ('supershredder-10ml',              'SUPERSHREDDER',        '10ML'),
    ('t1rz3p4t1d3',                     'T1RZ3P4T1D3',          '10MG'),
    ('tb-500-10mg',                     'TB-500',               '10MG'),
    ('tesamorelin-10mg',                'TESAMORELIN',          '10MG'),
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
        '- A small blue dot separator.\n'
        '- Footer inside label: "FOR LABORATORY RESEARCH USE ONLY  ·  PURITY ≥ 99% HPLC" in '
        'small white caps.\n\n'
        'DO NOT include: holographic borders, iridescent panels, side info panels with QR codes '
        'or lot numbers, storage icons, or any rainbow/foil textures. The label wrap is a single '
        'flat dark navy rectangle only.\n\n'
        'Output a single high-resolution, product-catalog-ready photo of the vial. Front-facing '
        'label perspective, entire vial visible with a little empty space above and below.'
    )


async def generate_one(sem, key, ref_b64, slug, compound, mg):
    out_path = OUT_DIR / f'{slug}.png'
    async with sem:
        chat = LlmChat(
            api_key=key,
            session_id=f'helixaris-clean-{slug}',
            system_message=(
                'You are a pharmaceutical product photographer. Produce clean, minimalist '
                'catalog-style vial photos with a dark navy label wrap only — no holographic '
                'or foil panels.'
            ),
        ).with_model('gemini', 'gemini-3.1-flash-image-preview').with_params(modalities=['image', 'text'])
        msg = UserMessage(
            text=build_prompt(compound, mg),
            file_contents=[ImageContent(image_base64=ref_b64)],
        )
        try:
            text, images = await chat.send_message_multimodal_response(msg)
        except Exception as e:  # noqa: BLE001
            print(f'[FAIL] {slug}: {type(e).__name__}: {e}')
            return False
        if not images:
            print(f'[FAIL] {slug}: no image returned ({text[:120]!r})')
            return False
        out_path.write_bytes(base64.b64decode(images[0]['data']))
        print(f'[OK ] {slug} → {out_path} ({out_path.stat().st_size // 1024}KB)')
        return True


async def main(only=None):
    key = os.getenv('EMERGENT_LLM_KEY')
    if not key or not REF.exists():
        print('MISSING EMERGENT_LLM_KEY or reference image')
        return
    ref_b64 = base64.b64encode(REF.read_bytes()).decode()
    targets = [(s, c, m) for s, c, m in VIALS if not only or s in only]
    print(f'Generating {len(targets)} clean-style Helixaris vials (parallel=3)...')
    sem = asyncio.Semaphore(3)
    results = await asyncio.gather(*(
        generate_one(sem, key, ref_b64, s, c, m) for s, c, m in targets
    ))
    print(f'\nDONE. {sum(results)}/{len(results)} succeeded.')


if __name__ == '__main__':
    import sys
    asyncio.run(main(only=sys.argv[1:] or None))
