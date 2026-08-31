"""Admin seed — bring every product's description up to the tone-matched
2-sentence research format used on 5-Amino1MQ and Eloralintide.

Idempotent. Skips products whose slug isn't in the map. Only updates the
`description` field so nothing else (price, stock, image) is disturbed.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from auth import require_admin
from db import db

router = APIRouter(prefix='/admin/seed', tags=['admin-seed'])


# Every product description ends with this line for compliance uniformity.
_RUO = ' For laboratory research use only — not for human consumption.'


# slug -> descriptive body (RUO line is appended automatically)
DESCRIPTIONS: dict[str, str] = {
    # -------- VIALS --------
    'ahkcu-100mg': (
        'AHK-Cu is a research copper-tripeptide (alanyl-histidyl-lysine copper) investigated for '
        'hair-follicle signalling and collagen synthesis pathways. Supplied as a lyophilised 100mg vial.'
    ),
    'b12-10mg': (
        'Methylcobalamin (Vitamin B12) is a research biomolecule investigated in energy-metabolism, '
        'neurological and haematopoietic pathways. Supplied as a lyophilised 10mg vial.'
    ),
    'bac-water': (
        'Bacteriostatic Water is a sterile diluent containing 0.9% benzyl alcohol, used to reconstitute '
        'lyophilised peptides for laboratory research. Supplied in a 30ml multi-dose vial.'
    ),
    'bpc-157-10mg': (
        'BPC-157 (Body Protection Compound) is a research pentadecapeptide investigated for '
        'gastrointestinal, tendon, ligament and vascular repair pathways. Supplied as a lyophilised 10mg vial.'
    ),
    'bpc-157-tb500': (
        'BPC-157 + TB-500 is a research peptide blend investigated for connective-tissue repair, '
        'angiogenesis and cellular migration pathways. Supplied as a lyophilised combined vial.'
    ),
    'c4gr1-5mg': (
        'C4GR1 is a research long-acting amylin-analogue peptide investigated for satiety signalling, '
        'gastric-emptying and metabolic pathways. Supplied as a lyophilised 5mg vial.'
    ),
    'cjc-no-dac-and-ipamorelin-10mg': (
        'CJC-1295 (no-DAC) + Ipamorelin is a research growth-hormone secretagogue blend investigated for '
        'pulsatile GH-release pathways. Supplied as a lyophilised combined 10mg vial.'
    ),
    'dsip-15mg': (
        'DSIP (Delta Sleep-Inducing Peptide) is a research nonapeptide investigated for '
        'sleep-architecture, stress-response and neuroendocrine pathways. Supplied as a lyophilised 15mg vial.'
    ),
    'ghkcu': (
        'GHK-Cu is a research copper-tripeptide (glycyl-histidyl-lysine copper) investigated for '
        'skin-remodelling, antioxidant and wound-healing pathways. Supplied as a lyophilised vial.'
    ),
    'glow-70mg': (
        'GLOW is a research skin-and-repair peptide blend combining BPC-157, TB-500 and GHK-Cu, '
        'investigated for regenerative and dermal-signalling pathways. Supplied as a lyophilised 70mg vial.'
    ),
    'glutathione-1500mg': (
        'Glutathione is a research tripeptide antioxidant investigated for redox-balance, '
        'detoxification and cellular-defence pathways. Supplied as a lyophilised 1500mg vial.'
    ),
    'hexarelin-5mg': (
        'Hexarelin is a research growth-hormone-releasing hexapeptide investigated for '
        'GH-secretion and cardioprotective pathways. Supplied as a lyophilised 5mg vial.'
    ),
    'igf-1-lr3': (
        'IGF-1 LR3 is a research long-acting insulin-like growth factor analogue investigated for '
        'anabolic-signalling and cellular-proliferation pathways. Supplied as a lyophilised vial.'
    ),
    'igf1-lr3-1mg': (
        'IGF-1 LR3 is a research long-acting insulin-like growth factor analogue investigated for '
        'anabolic-signalling and cellular-proliferation pathways. Supplied as a lyophilised 1mg vial.'
    ),
    'ipamorelin-10mg': (
        'Ipamorelin is a research selective growth-hormone-releasing pentapeptide investigated for '
        'pulsatile GH-release pathways with minimal cortisol/prolactin activity. Supplied as a lyophilised 10mg vial.'
    ),
    'klow-80mg-vial': (
        'KLOW is a research repair-and-recovery peptide blend combining BPC-157, TB-500, GHK-Cu and KPV, '
        'investigated for tissue-repair and inflammatory-signalling pathways. Supplied as a lyophilised 80mg vial.'
    ),
    'kpv-10mg': (
        'KPV is a research alpha-MSH-derived tripeptide (lysine-proline-valine) investigated for '
        'inflammatory-signalling and gastrointestinal pathways. Supplied as a lyophilised 10mg vial.'
    ),
    'kisspeptin-10mg': (
        'Kisspeptin is a research neuropeptide investigated for hypothalamic-pituitary axis and '
        'reproductive-signalling pathways. Supplied as a lyophilised 10mg vial.'
    ),
    'mots-c-40mg': (
        'MOTS-c is a research mitochondrial-derived peptide investigated for metabolic-homeostasis, '
        'insulin-sensitivity and cellular-energy pathways. Supplied as a lyophilised 40mg vial.'
    ),
    'mt-1-10mg': (
        'MT-1 (Melanotan I) is a research alpha-MSH analogue investigated for melanogenesis and '
        'pigmentation pathways. Supplied as a lyophilised 10mg vial.'
    ),
    'mt-2-10mg': (
        'MT-2 (Melanotan II) is a research melanocortin-receptor agonist investigated for '
        'melanogenesis and appetite-signalling pathways. Supplied as a lyophilised 10mg vial.'
    ),
    'nad-plus': (
        'NAD+ (Nicotinamide Adenine Dinucleotide) is a research coenzyme investigated for '
        'cellular-energy, DNA-repair and sirtuin-activation pathways. Supplied as a lyophilised vial.'
    ),
    'pt-141-10mg': (
        'PT-141 (bremelanotide) is a research melanocortin-receptor agonist investigated for '
        'central-nervous-system arousal pathways. Supplied as a lyophilised 10mg vial.'
    ),
    'r3t4trut1d3': (
        'R3T4TRUT1D3 is a research triple-agonist peptide (GLP-1 / GIP / glucagon) investigated for '
        'satiety, glycaemic-regulation and energy-expenditure pathways. Supplied as a lyophilised vial.'
    ),
    'slu-pp-5mg': (
        'SLU-PP-332 is a research ERR-agonist small-molecule investigated for mitochondrial-biogenesis '
        'and exercise-mimetic pathways. Supplied as a lyophilised 5mg vial.'
    ),
    'ss-31-10mg': (
        'SS-31 (elamipretide) is a research mitochondrial-targeted tetrapeptide investigated for '
        'cardiolipin-stabilisation and oxidative-stress pathways. Supplied as a lyophilised 10mg vial.'
    ),
    'selank-10mg': (
        'Selank is a research heptapeptide investigated for anxiolytic, cognitive and '
        'neuroimmune-modulation pathways. Supplied as a lyophilised 10mg vial.'
    ),
    'semax-10mg': (
        'Semax is a research heptapeptide investigated for neuroprotective, cognitive and '
        'BDNF-modulation pathways. Supplied as a lyophilised 10mg vial.'
    ),
    'superhuman-blend-10ml': (
        'Superhuman is a research recovery-and-performance peptide blend investigated for '
        'multi-pathway regenerative and metabolic signalling. Supplied as a 10ml vial.'
    ),
    'supershredder-10ml': (
        'SuperShredder is a research body-composition peptide blend investigated for '
        'lipolysis and metabolic-signalling pathways. Supplied as a 10ml vial.'
    ),
    't1rz3p4t1d3': (
        'T1RZ3P4T1D3 is a research dual-agonist peptide (GLP-1 / GIP) investigated for '
        'satiety, glycaemic-regulation and body-composition pathways. Supplied as a lyophilised vial.'
    ),
    'tb-500-10mg': (
        'TB-500 (Thymosin Beta-4) is a research 43-amino-acid peptide investigated for '
        'actin-regulation, tissue-repair and angiogenesis pathways. Supplied as a lyophilised 10mg vial.'
    ),
    'tesamorelin-10mg': (
        'Tesamorelin is a research GHRH-analogue peptide investigated for pulsatile GH-release '
        'and visceral-adipose pathways. Supplied as a lyophilised 10mg vial.'
    ),

    # -------- PENS --------
    'bpc-157-tb500-30mg-pen': (
        'BPC-157 / TB-500 pen is a research peptide blend investigated for connective-tissue repair, '
        'angiogenesis and cellular-migration pathways. Supplied as a pre-filled 30mg dosing pen.'
    ),
    'c4gr1-5mg-pen': (
        'C4GR1 pen is a research long-acting amylin-analogue peptide investigated for satiety-signalling '
        'and metabolic pathways. Supplied as a pre-filled 5mg dosing pen.'
    ),
    'ghkcu-pen': (
        'GHKcu pen is a research copper-tripeptide investigated for skin-remodelling, antioxidant and '
        'wound-healing pathways. Supplied as a pre-filled 100mg dosing pen.'
    ),
    'glow-70mg-pen': (
        'GLOW pen is a research skin-and-repair peptide blend investigated for regenerative and '
        'dermal-signalling pathways. Supplied as a pre-filled 70mg dosing pen.'
    ),
    'klow-80mg-pen': (
        'KLOW pen is a research repair-and-recovery peptide blend investigated for tissue-repair and '
        'inflammatory-signalling pathways. Supplied as a pre-filled 80mg dosing pen.'
    ),
    'motsc-40mg-pen': (
        'MOTSc pen is a research mitochondrial-derived peptide investigated for metabolic-homeostasis '
        'and cellular-energy pathways. Supplied as a pre-filled 40mg dosing pen.'
    ),
    'mt-2-10mg-pen': (
        'MT-2 pen is a research melanocortin-receptor agonist investigated for melanogenesis and '
        'appetite-signalling pathways. Supplied as a pre-filled 10mg dosing pen.'
    ),
    'nad-pen': (
        'NAD+ pen is a research coenzyme investigated for cellular-energy, DNA-repair and '
        'sirtuin-activation pathways. Supplied as a pre-filled dosing pen.'
    ),
    'r3t4trut1d3-pen': (
        'R3T4TRUT1D3 pen is a research triple-agonist peptide (GLP-1 / GIP / glucagon) investigated for '
        'satiety, glycaemic-regulation and energy-expenditure pathways. Supplied as a pre-filled dosing pen.'
    ),
    't1rz3p4t1d3-pen': (
        'T1RZ3P4T1D3 pen is a research dual-agonist peptide (GLP-1 / GIP) investigated for satiety, '
        'glycaemic-regulation and body-composition pathways. Supplied as a pre-filled dosing pen.'
    ),

    # -------- NASALS --------
    'mt-2-10mg-nasal': (
        'MT-2 nasal is a research melanocortin-receptor agonist investigated for melanogenesis and '
        'appetite-signalling pathways. Supplied as a 10mg intranasal spray for laboratory reconstitution.'
    ),
    'selank-10mg-nasal': (
        'Selank nasal is a research heptapeptide investigated for anxiolytic and cognitive pathways. '
        'Supplied as a 10mg intranasal spray for laboratory reconstitution.'
    ),
    'semax-10mg-nasal': (
        'Semax nasal is a research heptapeptide investigated for neuroprotective and BDNF-modulation '
        'pathways. Supplied as a 10mg intranasal spray for laboratory reconstitution.'
    ),

    # -------- BUNDLES --------
    'mitochondria-stack': (
        'Mitochondria Stack is a research bundle combining MOTS-c and SS-31, investigated together '
        'for mitochondrial-biogenesis, cellular-energy and oxidative-stress pathways.'
    ),
    'neurological-trio': (
        'Neurological Trio is a research bundle combining Selank, Semax and DSIP, investigated together '
        'for anxiolytic, cognitive and sleep-architecture pathways.'
    ),
    'r3t4-tesa-motsc-ultimate-power-combo': (
        'The R3T4 / Tesamorelin / MOTS-c bundle is a research combination investigated together for '
        'metabolic, body-composition and cellular-energy pathways.'
    ),
    'stay-beautiful-beauty-stack': (
        'Stay Beautiful Beauty Stack is a research bundle combining GHK-Cu, AHK-Cu and GLOW, '
        'investigated together for skin-remodelling and regenerative-signalling pathways.'
    ),
    't1rz3p4t1d3-20mg-x3-multipack': (
        'T1RZ3P4T1D3 20mg multipack — three research vials of dual-agonist peptide (GLP-1 / GIP) '
        'investigated for satiety, glycaemic-regulation and body-composition pathways.'
    ),

    # -------- ORAL PEPTIDES (bring shorter ones up to spec, keep richer ones) --------
    'bam15-50mg': (
        'BAM15 is a research mitochondrial protonophore investigated for metabolic uncoupling and '
        'energy-expenditure pathways relevant to body-composition and cellular energetics. Supplied as '
        'oral 50mg tablets.'
    ),
    'methylene-blue-20mg': (
        'Methylene Blue is a research phenothiazine compound investigated for mitochondrial-electron-'
        'transport and neuroprotective pathways. Supplied as oral 20mg tablets.'
    ),
    'minoxidil-5mg': (
        'Minoxidil is a research potassium-channel opener investigated for hair-follicle signalling and '
        'vasodilatory pathways. Supplied as oral 5mg tablets.'
    ),
    'slupp-332-250mcg-bma-15-50mcg-300mcg': (
        'SLU-PP-332 + BAM15 combination — a research ERR-agonist and mitochondrial protonophore '
        'blend investigated together for mitochondrial-biogenesis and energy-expenditure pathways. '
        'Supplied as oral tablets.'
    ),
    'slupp-332-50mg': (
        'SLU-PP-332 is a research ERR-agonist small-molecule investigated for mitochondrial-biogenesis '
        'and exercise-mimetic pathways. Supplied as oral 50mg tablets.'
    ),
    'tesofensine-500mcg': (
        'Tesofensine is a research triple monoamine-reuptake inhibitor investigated for satiety and '
        'body-composition pathways. Supplied as oral 500mcg tablets.'
    ),
    'tirzepatide-500mcg': (
        'Tirzepatide is a research dual-agonist peptide (GLP-1 / GIP) investigated for satiety, '
        'glycaemic-regulation and body-composition pathways. Supplied as oral 500mcg tablets.'
    ),
    '5-amino-1mq-50mg': (
        '5-Amino-1MQ is a research small-molecule NNMT inhibitor investigated for metabolic pathways '
        'relevant to body-composition and cellular energetics. Supplied as oral 50mg tablets.'
    ),
}


@router.post('/product-descriptions')
async def seed_product_descriptions(_admin: dict = Depends(require_admin)):
    """Idempotently bring every product's `description` up to the tone-matched
    2-sentence research format. Only updates products whose slugs are in the
    map — everything else is left alone."""
    now = datetime.now(timezone.utc)
    updated: list[str] = []
    missing: list[str] = []
    for slug, body in DESCRIPTIONS.items():
        full = body.strip() + _RUO
        res = await db.products.update_one(
            {'slug': slug},
            {'$set': {'description': full, 'updated_at': now}},
        )
        if res.matched_count:
            updated.append(slug)
        else:
            missing.append(slug)
    return {
        'ok': True,
        'updated_count': len(updated),
        'missing_count': len(missing),
        'updated': updated,
        'missing': missing,
    }
