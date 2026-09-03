"""Generate the last 10 Helixaris product images for full catalog uniformity:
- BAC water vial (clear liquid, not powder)
- 3 syringe/needle utility products
- 6 bundle group shots
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

BRAND_INSTRUCT = (
    'Match the attached reference image exactly for BRAND STYLE ONLY: '
    'the label wrap is a clean rectangular DARK NAVY (#050b1a) panel — '
    'NO holographic side panels, NO iridescent borders, NO foil edges. '
    'Silver metallic "HELIXARIS" wordmark with light-blue (#7ec8ff) '
    '"BIOSCIENCE" underneath. Faint blue molecular watermark and DNA-helix '
    'watermark on the label. Studio product photography with soft grey '
    'out-of-focus background and natural shadow underneath.'
)

# key: (slug, kind, headline, subhead)
JOBS = [
    ('bac-water',    'bacwater', 'BAC WATER',                'STERILE DILUENT · 30ML'),
    ('10-x-03ml-8mm-30g-insulin-syringe', 'syringes',
        '0.3ML INSULIN SYRINGES',  '30G · 8MM · PACK OF 10 + ALCOHOL WIPES'),
    ('10-x-1ml-05-inch-unisharp', 'syringes',
        '1ML UNISHARP SYRINGES',   '0.5 INCH · PACK OF 10 + ALCOHOL WIPES'),
    ('10-x-31g-pen-needles', 'syringes',
        '31G PEN NEEDLES',         '0.25MM × 6MM · PACK OF 10 + ALCOHOL WIPES'),
    ('mitochondria-stack', 'bundle', 'MITOCHONDRIA STACK', 'MOTS-C 40MG  +  SS-31 10MG'),
    ('neurological-trio',  'bundle', 'NEUROLOGICAL TRIO',  'SELANK  +  SEMAX  +  DSIP'),
    ('r3t4-tesa-motsc-ultimate-power-combo', 'bundle',
        'ULTIMATE POWER COMBO', 'R3T4TRUT1D3  +  TESAMORELIN  +  MOTS-C'),
    ('stay-beautiful-beauty-stack', 'bundle', 'BEAUTY STACK',
        'GHK-CU  +  AHK-CU  +  GLOW'),
    ('super-shredder', 'bundle', 'SUPER SHREDDER',
        'PERFORMANCE + BODY COMPOSITION BLEND'),
    ('t1rz3p4t1d3-20mg-x3-multipack', 'bundle',
        'T1RZ3P4T1D3 20MG × 3', 'MULTIPACK · THREE VIALS'),
]


def prompt_bacwater(headline: str, subhead: str) -> str:
    return (
        f'CRITICAL: The label text on the vial MUST read "{headline}" (large white bold) '
        f'and "{subhead}" (small caps subheader). DO NOT use "TRIZEPATIDE" or any other '
        f'text from the reference. Reference is STYLE ONLY.\n\n'
        + BRAND_INSTRUCT + '\n\n'
        + 'Show a photorealistic 30ml pharmaceutical vial standing upright, filled with '
        + 'CLEAR STERILE LIQUID (BAC water — bacteriostatic water). Silver aluminium crimp '
        + 'cap. The vial is wrapped with a rectangular dark navy label showing:\n'
        + f'- HELIXARIS BIOSCIENCE header (silver+blue)\n'
        + f'- Large white bold "{headline}"\n'
        + f'- Small caps light-blue "{subhead}"\n'
        + '- Small white line: "STERILE · 0.9% BENZYL ALCOHOL"\n'
        + '- Footer: "FOR LABORATORY RESEARCH USE ONLY · NOT FOR HUMAN CONSUMPTION"\n\n'
        + 'Product-catalog-ready photo, front-facing.'
    )


def prompt_syringes(headline: str, subhead: str) -> str:
    return (
        f'CRITICAL: The packaging text MUST read "{headline}" and below "{subhead}". '
        f'DO NOT use "TRIZEPATIDE" or any other reference text.\n\n'
        + BRAND_INSTRUCT + '\n\n'
        + 'Show a photorealistic product photo of a small dark navy pharmaceutical '
        + 'accessory box (rectangular, matte finish) with silver HELIXARIS BIOSCIENCE '
        + 'wordmark on top. Two or three sealed medical syringes with orange caps arranged '
        + 'diagonally in front of the box, plus a couple of white alcohol-wipe sachets. '
        + 'Soft grey studio background.\n\n'
        + 'The box front prominently displays:\n'
        + f'- HELIXARIS BIOSCIENCE (silver + light-blue)\n'
        + f'- Large white "{headline}"\n'
        + f'- Small light-blue caps "{subhead}"\n'
        + '- Footer: "STERILE  ·  SINGLE USE"\n\n'
        + 'Clean minimalist product-catalog composition.'
    )


def prompt_bundle(headline: str, subhead: str) -> str:
    return (
        f'CRITICAL: The bundle-label text MUST read "{headline}" and below "{subhead}". '
        f'DO NOT use "TRIZEPATIDE" or any other reference text.\n\n'
        + BRAND_INSTRUCT + '\n\n'
        + 'Show a photorealistic product-catalog photo of TWO OR THREE small transparent '
        + 'glass peptide vials standing side-by-side on a soft light-grey studio background. '
        + 'Each vial has a silver aluminium crimp cap and a dark navy rectangular label wrap '
        + 'featuring the HELIXARIS BIOSCIENCE wordmark. Vials contain white lyophilised '
        + 'powder. Soft studio lighting, subtle shadows.\n\n'
        + 'Above the vials (or floating in front, elegant kerning), display a small '
        + 'BUNDLE-BADGE label in dark navy with silver+blue trim reading:\n'
        + f'- "{headline}" (large white bold)\n'
        + f'- "{subhead}" (small caps light-blue)\n\n'
        + 'DO NOT copy compound names from the reference — the individual vial labels can '
        + 'just show the HELIXARIS wordmark without specific compound text (bundle art, '
        + 'not individual compound art).'
    )


PROMPTS = {'bacwater': prompt_bacwater, 'syringes': prompt_syringes, 'bundle': prompt_bundle}


async def generate_one(sem, key, ref_b64, slug, kind, headline, subhead):
    out_path = OUT_DIR / f'{slug}.png'
    async with sem:
        chat = LlmChat(
            api_key=key,
            session_id=f'helixaris-misc-{slug}',
            system_message='You are a pharmaceutical product photographer. Produce clean minimalist catalog imagery matching the brand system in the reference.',
        ).with_model('gemini', 'gemini-3.1-flash-image-preview').with_params(modalities=['image', 'text'])
        msg = UserMessage(
            text=PROMPTS[kind](headline, subhead),
            file_contents=[ImageContent(image_base64=ref_b64)],
        )
        try:
            text, images = await chat.send_message_multimodal_response(msg)
        except Exception as e:  # noqa: BLE001
            print(f'[FAIL] {slug}: {type(e).__name__}: {e}')
            return False
        if not images:
            print(f'[FAIL] {slug}: no image ({text[:120]!r})')
            return False
        out_path.write_bytes(base64.b64decode(images[0]['data']))
        print(f'[OK ] {slug} → {out_path.stat().st_size // 1024}KB')
        return True


async def main(only=None):
    key = os.getenv('EMERGENT_LLM_KEY')
    if not key or not REF.exists():
        print('MISSING KEY or reference')
        return
    ref_b64 = base64.b64encode(REF.read_bytes()).decode()
    targets = [j for j in JOBS if not only or j[0] in only]
    print(f'Generating {len(targets)} Helixaris misc products (parallel=3)...')
    sem = asyncio.Semaphore(3)
    results = await asyncio.gather(*(generate_one(sem, key, ref_b64, *j) for j in targets))
    print(f'\nDONE. {sum(results)}/{len(results)} succeeded.')


if __name__ == '__main__':
    import sys
    asyncio.run(main(only=sys.argv[1:] or None))
