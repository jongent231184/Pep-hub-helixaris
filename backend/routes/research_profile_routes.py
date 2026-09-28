"""Admin: AI-generate a Peptiology-style Research Profile for a product.

Uses Claude via emergentintegrations. Returns structured JSON that the
admin UI drops straight into the ResearchProfile fields on the product
form. Admin edits before saving — this is a draft assistant, not a
fire-and-forget writer.

Endpoints:
    POST /api/admin/products/{product_id}/research-profile:generate
        -> { research_profile: {...} }
    POST /api/admin/products/research-profile:generate-all
        -> { job_id }  (kicks off a BACKGROUND task; poll status below)
    GET  /api/admin/products/research-profile:job-status
        -> { running, updated, skipped, failed, total, last_slug }
"""
import asyncio
import json
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel

from auth import require_admin
from db import db
from emergentintegrations.llm.chat import LlmChat, UserMessage

router = APIRouter(prefix='/admin/products', tags=['admin-research-profile'])

CLAUDE_MODEL = 'claude-sonnet-4-5-20250929'

# Canonical storage & handling text. This is the same for every research
# peptide we supply, so we never trust the AI to generate it — the model has
# been observed to drift (e.g. "-20 to -80 °C") and produce inconsistent
# phrasing. Instead we deterministically overwrite whatever the AI returns
# with this line to guarantee a uniform statement across all product pages.
CANONICAL_STORAGE_HANDLING = (
    "Supplied as a lyophilised powder. Store sealed at 2-8 °C (standard "
    "laboratory refrigeration) and use within 30 days of receipt. "
    "Reconstitute with sterile bacteriostatic water under aseptic "
    "laboratory technique; store the reconstituted solution at 2-8 °C "
    "and use within 30 to 60 days. For in-vitro laboratory research only."
)
SYSTEM_MSG = (
    "You are a scientific writer for a UK research-peptide supplier. Every response must "
    "describe the peptide as a laboratory research chemical only — never for human use, "
    "never with medical or dosing advice. Use neutral, literature-grounded language. "
    "You cite established mechanisms and published research. You NEVER recommend doses, "
    "protocols, or therapeutic uses. Output ONLY valid JSON matching the requested schema."
)

PROMPT_TEMPLATE = """Write a Research Profile for the peptide **{name}** as a UK research-grade laboratory reagent.

Return ONLY a JSON object with the following keys (all strings unless marked):

{{
  "overview":            "3-4 sentence overview of what this peptide is and why researchers study it. ~80 words.",
  "molecular_class":     "One line, e.g. 'Growth-hormone secretagogue' or 'Copper tripeptide'",
  "molecular_formula":   "Chemical formula, e.g. C38H49N9O5 — if unknown leave empty string",
  "molecular_weight":    "Molecular weight in g/mol as a string, e.g. '711.9 g/mol' — empty if unknown",
  "sequence":            "Amino-acid sequence with hyphens, e.g. 'Aib-His-D-2-Nal-D-Phe-Lys-NH2' — empty if not a peptide",
  "receptor_target":     "One-line receptor / molecular target, e.g. 'GHS-R1a / ghrelin receptor agonist'",
  "signalling":          "1-2 sentence description of the canonical downstream signalling pathway",
  "study_systems":       ["Array of 2-5 short strings, e.g. 'Primary pituitary cells', 'Rat endocrine models', 'HUVEC cell lines'"],
  "areas_of_research":   ["Array of 3-6 short research area labels, e.g. 'Growth-hormone release', 'GHS-R1a receptor pharmacology'"],
  "key_finding":         "2-3 sentence description of the flagship finding from the primary literature. Reference the class of finding, not clinical outcomes.",
  "mechanism":           "3-4 sentence molecular-mechanism paragraph. ~90 words. Written for a scientist reader.",
  "limitations":         "2 sentence honest limitation summary — what the mechanism does NOT establish, e.g. 'Well-characterised receptor pharmacology does not by itself establish clinical benefit'.",
  "open_questions":      "1-2 sentence description of open research questions in the literature.",
  "storage_handling":    "1-2 sentence handling note. Something like: 'Supplied as a lyophilised powder. Store at -20 C before reconstitution. Reconstitute with bacteriostatic water using aseptic laboratory technique.'",
  "references":          [
    {{"citation": "First-author last name et al. Short title. Journal Year.", "url": ""}},
    {{"citation": "Second reference", "url": ""}}
  ],
  "pubmed_query":        "The exact search phrase a researcher would use on PubMed for this peptide, e.g. '\\"Ipamorelin\\" OR '\\"NNC-26-0161\\"'"
}}

RULES:
- Every claim must reflect the published research literature. Do not invent findings.
- Where a peptide is well known (Ipamorelin, BPC-157, TB-500, MOTS-c, Semaglutide, Tirzepatide, Retatrutide, MT-2/Melanotan II, DSIP, Kisspeptin, GHK-Cu, AHK-Cu, SS-31, ARA-290, PT-141, NAD+, 5-Amino1MQ, KPV, GHRP-6, CJC-1295, Ipamorelin, Cagrilintide, Eloralintide, Klow) use its established scientific literature.
- If the peptide is obscure or you are unsure, produce a shorter conservative profile and leave uncertain fields as empty strings.
- Use British English spelling.
- Use ONLY neutral scientific tone. Never say "helps you" or "improves your".
- Do NOT mention dosages, protocols, personal use, or therapeutic outcomes.
- Provide 2-4 real references from published literature. Include real first-author names and years where you know them.

Return ONLY the JSON — no preamble, no code fences, no explanation."""


class GenerateResponse(BaseModel):
    ok: bool
    research_profile: Optional[dict] = None
    error: Optional[str] = None


def _extract_json(text: str) -> dict:
    """Claude usually returns clean JSON but occasionally wraps it in ```json fences."""
    txt = text.strip()
    # strip code fences
    txt = re.sub(r'^```(?:json)?\s*', '', txt)
    txt = re.sub(r'\s*```$', '', txt)
    # find outermost {...}
    start = txt.find('{')
    end = txt.rfind('}')
    if start == -1 or end == -1 or end <= start:
        raise ValueError('No JSON object found in model response')
    return json.loads(txt[start:end + 1])


async def _generate_one(product_name: str) -> dict:
    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key:
        raise HTTPException(500, 'EMERGENT_LLM_KEY not configured on server')
    session_id = f'rp-{uuid.uuid4().hex[:10]}'
    chat = (
        LlmChat(api_key=api_key, session_id=session_id, system_message=SYSTEM_MSG)
        .with_model('anthropic', CLAUDE_MODEL)
    )
    msg = UserMessage(text=PROMPT_TEMPLATE.format(name=product_name))
    response = await chat.send_message(msg)
    if isinstance(response, tuple):
        response = response[0]
    try:
        data = _extract_json(str(response))
    except Exception as e:
        raise HTTPException(502, f'AI response not JSON: {e}')
    # Normalise arrays / defaults so validation always passes on the model side
    for k in ('study_systems', 'areas_of_research'):
        v = data.get(k)
        if v is None:
            data[k] = []
        elif isinstance(v, str):
            data[k] = [x.strip() for x in v.split(',') if x.strip()]
    refs = data.get('references')
    if not isinstance(refs, list):
        data['references'] = []
    else:
        data['references'] = [
            {'citation': (r.get('citation') or '').strip(), 'url': (r.get('url') or '').strip()}
            for r in refs
            if isinstance(r, dict) and r.get('citation')
        ]
    # Force canonical storage text — never trust the AI for this boilerplate.
    data['storage_handling'] = CANONICAL_STORAGE_HANDLING
    return data


@router.post('/{product_id}/research-profile:generate', response_model=GenerateResponse)
async def generate_profile_for_product(product_id: str, _=Depends(require_admin)):
    doc = await db.products.find_one({'$or': [{'id': product_id}, {'slug': product_id}]})
    if not doc:
        raise HTTPException(404, 'Product not found')
    # Prefer the admin-supplied scientific name; fall back to storefront name / slug.
    name = (doc.get('research_name') or '').strip() or doc.get('name') or doc.get('slug')
    data = await _generate_one(name)
    return GenerateResponse(ok=True, research_profile=data)


class BulkResponse(BaseModel):
    job_id: str
    running: bool


class JobStatus(BaseModel):
    running: bool
    updated: int
    skipped: int
    failed: int
    total: int
    last_slug: Optional[str] = None
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    errors: list[str] = []


# In-memory job state — single-worker uvicorn holds this. Fine for admin use.
_BULK_JOB: dict = {
    'running': False,
    'updated': 0,
    'skipped': 0,
    'failed': 0,
    'total': 0,
    'last_slug': None,
    'started_at': None,
    'finished_at': None,
    'errors': [],
}


async def _run_bulk(overwrite: bool):
    global _BULK_JOB
    _BULK_JOB = {
        'running': True, 'updated': 0, 'skipped': 0, 'failed': 0,
        'total': 0, 'last_slug': None, 'errors': [],
        'started_at': datetime.now(timezone.utc).isoformat(),
        'finished_at': None,
    }
    try:
        # Snapshot the product list up-front so mid-run edits do not interfere.
        products = [p async for p in db.products.find({})]
        _BULK_JOB['total'] = len(products)
        for prod in products:
            pid = prod.get('id')
            slug = prod.get('slug')
            name = (prod.get('research_name') or '').strip() or prod.get('name') or slug
            _BULK_JOB['last_slug'] = slug
            existing = prod.get('research_profile') or {}
            if not overwrite and isinstance(existing, dict) and (existing.get('overview') or '').strip():
                _BULK_JOB['skipped'] += 1
                continue
            try:
                data = await _generate_one(name or slug)
                await db.products.update_one(
                    {'id': pid},
                    {'$set': {'research_profile': data, 'updated_at': datetime.now(timezone.utc)}},
                )
                _BULK_JOB['updated'] += 1
            except Exception as e:  # noqa: BLE001
                _BULK_JOB['failed'] += 1
                _BULK_JOB['errors'].append(f'{slug}: {str(e)[:180]}')
                if len(_BULK_JOB['errors']) > 40:
                    _BULK_JOB['errors'] = _BULK_JOB['errors'][-40:]
            await asyncio.sleep(0.4)
    finally:
        _BULK_JOB['running'] = False
        _BULK_JOB['finished_at'] = datetime.now(timezone.utc).isoformat()


@router.post('/research-profile:generate-all', response_model=BulkResponse)
async def bulk_generate_profiles(background_tasks: BackgroundTasks, overwrite: bool = False, _=Depends(require_admin)):
    """Kick off a background task that generates a research profile for every
    product without one. Returns immediately with a job id. Poll
    /research-profile:job-status for progress."""
    if _BULK_JOB.get('running'):
        return BulkResponse(job_id='current', running=True)
    background_tasks.add_task(_run_bulk, overwrite)
    return BulkResponse(job_id=uuid.uuid4().hex[:12], running=True)


@router.get('/research-profile:job-status', response_model=JobStatus)
async def bulk_generate_status(_=Depends(require_admin)):
    return JobStatus(**_BULK_JOB)


class NormalizeStorageResponse(BaseModel):
    ok: bool
    updated: int
    total: int


@router.post('/research-profile:normalize-storage', response_model=NormalizeStorageResponse)
async def normalize_storage_handling(_=Depends(require_admin)):
    """Overwrite the storage_handling field on every product's research_profile
    with the canonical text. Cheap, no AI cost — safe to run any time.
    """
    total = 0
    updated = 0
    async for prod in db.products.find({}):
        total += 1
        rp = prod.get('research_profile') or {}
        if not isinstance(rp, dict) or not rp:
            continue
        if rp.get('storage_handling') == CANONICAL_STORAGE_HANDLING:
            continue
        rp['storage_handling'] = CANONICAL_STORAGE_HANDLING
        await db.products.update_one(
            {'id': prod.get('id')},
            {'$set': {'research_profile': rp, 'updated_at': datetime.now(timezone.utc)}},
        )
        updated += 1
    return NormalizeStorageResponse(ok=True, updated=updated, total=total)
