"""Generate Helixaris-branded vial label images for the entire vial catalog.

Uses the customer-supplied Helixaris "Trizepatide 10mg" vial label as the base64
reference and swaps only the compound-name line + mg strength for each product.
Runs 3 in parallel to stay under API limits.

Output: /app/frontend/public/brands/helixaris/products/{slug}.png
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

# (slug, compound-name-on-label, mg-on-label)
# Names match GHP's obfuscation strategy so Helixaris inherits the same
# compliance posture. mg strengths come straight from the store `name` field.
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
        'Using the attached reference vial label as the exact style, layout, and branding, '
        'create a new Helixaris Bioscience vial-label product photograph.\n\n'
        'MATCH EXACTLY (do not change any of the following):\n'
        '- Same wide rectangular label format with holographic iridescent side panels '
        '(left and right) and a dark navy centre panel.\n'
        '- Same silver DNA-helix icon + "HELIXARIS BIOSCIENCE" wordmark at the top-centre '
        '(silver "HELIXARIS", light-blue "BIOSCIENCE").\n'
        '- Same "ADVANCING PEPTIDE RESEARCH" subtitle under the wordmark.\n'
        '- Same blue molecular-structure diagram on the left of the centre panel and same '
        'DNA-double-helix rendering on the right.\n'
        '- Same left holographic panel copy: STORAGE 2-8°C · Protect from Light / '
        'KEEP AWAY FROM LIGHT & MOISTURE / RESEARCH USE ONLY · Not for Human Consumption / '
        'REFER TO DOCUMENTATION / HIGH PURITY LABORATORY GRADE.\n'
        '- Same right holographic panel copy: SCAN FOR COA & INFO / QR code / LOT: '
        'HX-2505-012 / MFG DATE: MAY 2025 / EXP DATE: MAY 2027 / PURITY: ≥99% HPLC / '
        'VOLUME: 10ML / STERILITY: ASEPTIC PROCESSING.\n'
        '- Same "RESEARCH USE ONLY · NOT FOR HUMAN CONSUMPTION" line below the compound name.\n'
        '- Same "FOR LABORATORY RESEARCH USE ONLY · PURITY ≥ 99% HPLC" footer line.\n'
        '- Same fonts, weights, kerning, positions and colours throughout.\n\n'
        'THE ONLY DIFFERENCES:\n'
        f'- Replace the compound-name line (currently reads "TRIZEPATIDE") with "{compound}" '
        'in the same large white bold typeface, centred on the dark navy panel.\n'
        f'- Replace the mg-strength badge (currently reads "10MG") with "{mg}" in the same '
        'thin-outlined rounded rectangle, same size and position.\n\n'
        'Do NOT add or remove any other elements. Output a single high-resolution '
        'photorealistic vial label matching the reference exactly.'
    )


async def generate_one(sem: asyncio.Semaphore, key: str, ref_b64: str, slug: str, compound: str, mg: str):
    out_path = OUT_DIR / f'{slug}.png'
    async with sem:
        chat = LlmChat(
            api_key=key,
            session_id=f'helixaris-vial-{slug}',
            system_message=(
                'You are a pharmaceutical product photography artist. Match the reference '
                'vial label exactly and only swap the compound name and mg strength text.'
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
        kb = out_path.stat().st_size // 1024
        print(f'[OK ] {slug} → {out_path} ({kb}KB)')
        return True


async def main(only: list[str] | None = None):
    key = os.getenv('EMERGENT_LLM_KEY')
    if not key or not REF.exists():
        print('MISSING EMERGENT_LLM_KEY or reference image')
        return
    ref_b64 = base64.b64encode(REF.read_bytes()).decode()
    targets = [(s, c, m) for s, c, m in VIALS if not only or s in only]
    print(f'Generating {len(targets)} Helixaris vials (parallel=3)...')
    sem = asyncio.Semaphore(3)
    results = await asyncio.gather(*(
        generate_one(sem, key, ref_b64, s, c, m) for s, c, m in targets
    ))
    print(f'\nDONE. {sum(results)}/{len(results)} succeeded.')


if __name__ == '__main__':
    import sys
    asyncio.run(main(only=sys.argv[1:] or None))
