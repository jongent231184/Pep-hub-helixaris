"""Owner KPIs, private progress photos and completion certificates for coaching."""
import io
import logging
import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from auth import get_current_user, require_admin, require_coach
from db import db
from routes.coaching_routes import _get_coach_client, _my_client
from routes.coaching_plans_routes import membership_state, require_member, get_plan
from storage import APP_NAME, get_object, put_object
from utils import doc_to_dict

logger = logging.getLogger('ghp.coaching.owner')
router = APIRouter(prefix='/coaching', tags=['coaching-owner'])

IMG_TYPES = {'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic'}
MAX_PHOTO = 10 * 1024 * 1024


# ---------- owner KPIs ----------
@router.get('/admin/kpis')
async def coaching_kpis(_=Depends(require_admin)):
    now = datetime.utcnow()
    d30 = now - timedelta(days=30)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    paid = await db.orders.find({'purpose': 'coaching_membership', 'payment_status': 'paid'}).to_list(5000)
    legacy = await db.orders.find({'purpose': 'coaching', 'payment_status': 'paid'}).to_list(5000)
    unpaid = await db.orders.count_documents({'purpose': 'coaching_membership', 'payment_status': {'$ne': 'paid'}})

    def paid_at(o):
        return o.get('paid_at') or o.get('updated_at') or o.get('created_at') or now

    by_tier = {}
    for o in paid:
        t = o.get('tier') or 'unknown'
        row = by_tier.setdefault(t, {'tier': t, 'count': 0, 'revenue': 0.0})
        row['count'] += 1
        row['revenue'] += float(o.get('total') or 0)
    rev = lambda rows: round(sum(float(o.get('total') or 0) for o in rows), 2)  # noqa: E731
    revenue = {
        'all_time': rev(paid) + rev(legacy),
        'memberships_all_time': rev(paid),
        'this_month': rev([o for o in paid if paid_at(o) >= month_start]),
        'last_30_days': rev([o for o in paid if paid_at(o) >= d30]),
        'legacy_plans': rev(legacy),
    }
    # monthly series (last 6 months)
    series = []
    for i in range(5, -1, -1):
        ms = (month_start.replace(day=1) - timedelta(days=28 * i)).replace(day=1)
        me = (ms + timedelta(days=32)).replace(day=1)
        rows = [o for o in paid if ms <= paid_at(o) < me]
        series.append({'month': ms.strftime('%b %Y'), 'revenue': rev(rows), 'payments': len(rows)})

    clients = await db.coaching_clients.find({'active': True}).to_list(2000)
    active = lapsed = awaiting = 0
    tiers_active = {}
    for c in clients:
        s = await membership_state(c)
        if s['active']:
            active += 1
            tiers_active[s['tier']] = tiers_active.get(s['tier'], 0) + 1
        elif s['paid_until']:
            lapsed += 1
        else:
            awaiting += 1
    first_payments = {}
    for o in sorted(paid, key=paid_at):
        first_payments.setdefault(o.get('client_id'), paid_at(o))
    new_members_30d = sum(1 for v in first_payments.values() if v >= d30)
    renewals = sum(1 for o in paid if first_payments.get(o.get('client_id')) != paid_at(o))

    req_total = await db.coaching_requests.count_documents({})
    req_new = await db.coaching_requests.count_documents({'status': 'new'})
    req_30 = await db.coaching_requests.count_documents({'created_at': {'$gte': d30}})
    req_tier = {}
    async for r in db.coaching_requests.aggregate([{'$group': {'_id': '$tier', 'n': {'$sum': 1}}}]):
        req_tier[r['_id'] or 'question'] = r['n']

    checkins = await db.coaching_checkins.find({'created_at': {'$gte': d30}}).to_list(5000)
    reviewed = [c for c in checkins if c.get('reviewed')]
    hours = [((c.get('reviewed_at') or now) - c['created_at']).total_seconds() / 3600 for c in reviewed if c.get('reviewed_at')]
    msgs_30 = await db.coach_messages.count_documents({'created_at': {'$gte': d30}})
    coach_msgs_30 = await db.coach_messages.count_documents({'created_at': {'$gte': d30}, 'from_role': 'coach'})
    certs = await db.coaching_certificates.count_documents({})
    photos = await db.coaching_photos.count_documents({})

    return {
        'as_of': now,
        'members': {'active': active, 'lapsed': lapsed, 'awaiting_first_payment': awaiting, 'by_tier': tiers_active,
                    'new_last_30_days': new_members_30d, 'total_ever_paid': len(first_payments)},
        'plans_purchased': {'total_payments': len(paid), 'first_months': len(first_payments), 'renewals': renewals,
                            'by_tier': sorted(by_tier.values(), key=lambda r: -r['revenue']), 'unpaid_links': unpaid},
        'revenue': revenue,
        'monthly': series,
        'requests': {'total': req_total, 'new': req_new, 'last_30_days': req_30, 'by_tier': req_tier,
                     'conversion_pct': round(100 * len(first_payments) / req_total, 1) if req_total else 0},
        'engagement': {'checkins_30d': len(checkins), 'reviewed_pct': round(100 * len(reviewed) / len(checkins), 1) if checkins else 0,
                       'avg_review_hours': round(sum(hours) / len(hours), 1) if hours else None,
                       'messages_30d': msgs_30, 'coach_replies_30d': coach_msgs_30,
                       'certificates_issued': certs, 'photos_uploaded': photos},
    }


# ---------- private progress photos ----------
async def _photo_bytes(photo: dict):
    return get_object(photo['storage_path'])


def _photo_out(p: dict) -> dict:
    d = doc_to_dict(p)
    d.pop('storage_path', None)
    d['url'] = f"/api/coaching/photos/{p['id']}"
    return d


@router.get('/my/photos')
async def my_photos(client: dict = Depends(require_member)):
    docs = await db.coaching_photos.find({'client_id': client['id']}).sort('created_at', -1).to_list(200)
    return [_photo_out(p) for p in docs]


@router.post('/my/photos')
async def my_upload_photo(file: UploadFile = File(...), caption: str = '', taken_on: str = '', client: dict = Depends(require_member)):
    ct = (file.content_type or '').lower()
    if ct not in IMG_TYPES:
        raise HTTPException(400, 'Please upload a JPG, PNG, WEBP or HEIC image')
    data = await file.read()
    if len(data) > MAX_PHOTO:
        raise HTTPException(400, 'Photo too large (max 10MB)')
    pid = str(uuid.uuid4())
    path = f"{APP_NAME}/coaching-photos/{client['id']}/{pid}{IMG_TYPES[ct]}"
    try:
        put_object(path, data, ct)
    except Exception as e:
        raise HTTPException(500, f'Storage upload failed: {e}')
    doc = {'id': pid, 'client_id': client['id'], 'coach_id': client['coach_id'], 'storage_path': path, 'content_type': ct,
           'caption': caption.strip()[:200], 'taken_on': taken_on.strip()[:10], 'size': len(data), 'created_at': datetime.utcnow()}
    await db.coaching_photos.insert_one(dict(doc))
    return _photo_out(doc)


@router.delete('/my/photos/{photo_id}')
async def my_delete_photo(photo_id: str, client: dict = Depends(require_member)):
    res = await db.coaching_photos.delete_one({'id': photo_id, 'client_id': client['id']})
    if res.deleted_count == 0:
        raise HTTPException(404, 'Photo not found')
    return {'ok': True}


@router.get('/coach/clients/{client_id}/photos')
async def coach_photos(client_id: str, user: dict = Depends(require_coach)):
    await _get_coach_client(client_id, user['id'])
    docs = await db.coaching_photos.find({'client_id': client_id}).sort('created_at', -1).to_list(200)
    return [_photo_out(p) for p in docs]


async def _can_view_client(user: dict, client_id: str) -> bool:
    if user.get('role') == 'admin':
        return False  # owner cannot view private photos (per client/coach-only decision)
    client = await db.coaching_clients.find_one({'id': client_id})
    if not client:
        return False
    if user.get('role') == 'coach':
        return client.get('coach_id') == user['id']
    mine = await _my_client(user)
    return bool(mine and mine['id'] == client_id)


@router.get('/photos/{photo_id}')
async def serve_photo(photo_id: str, user: dict = Depends(get_current_user)):
    photo = await db.coaching_photos.find_one({'id': photo_id})
    if not photo or not await _can_view_client(user, photo['client_id']):
        raise HTTPException(404, 'Photo not found')
    data, ct = await _photo_bytes(photo)
    return Response(content=data, media_type=ct or photo.get('content_type', 'image/jpeg'),
                    headers={'Cache-Control': 'private, max-age=3600'})


# ---------- completion certificate ----------
class CertificateIn(BaseModel):
    include_identity: bool = True
    anonymise: bool = False
    include_results: bool = True
    include_photos: bool = False
    photo_ids: list[str] = []
    include_review: bool = True
    review_text: str = ''
    include_coach_note: bool = True
    coach_note: str = ''
    headline: str = 'Certificate of Completion'


def _cert_out(c: dict) -> dict:
    d = doc_to_dict(c)
    d.pop('storage_path', None)
    d['pdf_url'] = f"/api/coaching/certificates/{c['id']}/pdf"
    return d


async def _results_for(client: dict, proto: Optional[dict]) -> dict:
    weigh = await db.weigh_ins.find({'client_id': client['id']}).sort('date', 1).to_list(500)
    checkins = await db.coaching_checkins.count_documents({'client_id': client['id']})
    done = await db.calendar_entries.count_documents({'client_id': client['id'], 'done': True}) if proto else 0
    total = await db.calendar_entries.count_documents({'client_id': client['id']}) if proto else 0
    start_w = weigh[0]['weight_kg'] if weigh else None
    end_w = weigh[-1]['weight_kg'] if weigh else None
    return {'start_weight_kg': start_w, 'end_weight_kg': end_w,
            'weight_change_kg': round(end_w - start_w, 1) if start_w is not None and end_w is not None else None,
            'checkins': checkins, 'doses_done': done, 'doses_total': total}


def _build_pdf(brand: str, accent_hex: str, name: str, plan_name: str, proto: Optional[dict], membership: dict,
               results: Optional[dict], photos: list[tuple[bytes, str]], review: str, coach_note: str, coach_name: str, headline: str) -> bytes:
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas
    from reportlab.lib.utils import ImageReader
    from reportlab.platypus import Paragraph
    from reportlab.lib.styles import ParagraphStyle

    buf = io.BytesIO()
    W, H = landscape(A4)
    c = canvas.Canvas(buf, pagesize=(W, H))
    navy = colors.HexColor('#0b1528')
    accent = colors.HexColor(accent_hex)
    c.setFillColor(navy); c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(colors.white); c.roundRect(14 * mm, 14 * mm, W - 28 * mm, H - 28 * mm, 6 * mm, fill=1, stroke=0)
    c.setStrokeColor(accent); c.setLineWidth(3); c.roundRect(18 * mm, 18 * mm, W - 36 * mm, H - 36 * mm, 5 * mm, fill=0, stroke=1)

    c.setFillColor(accent); c.setFont('Helvetica-Bold', 10)
    c.drawCentredString(W / 2, H - 32 * mm, f'{brand.upper()}  ·  COACHING PROGRAMME')
    c.setFillColor(navy); c.setFont('Helvetica-Bold', 30)
    c.drawCentredString(W / 2, H - 46 * mm, headline)
    c.setFont('Helvetica', 12); c.setFillColor(colors.HexColor('#475569'))
    c.drawCentredString(W / 2, H - 56 * mm, 'This certifies that')
    c.setFont('Helvetica-Bold', 26); c.setFillColor(navy)
    c.drawCentredString(W / 2, H - 68 * mm, name)
    c.setFont('Helvetica', 12); c.setFillColor(colors.HexColor('#475569'))
    weeks = f" · {proto.get('duration_weeks')} weeks" if proto and proto.get('duration_weeks') else ''
    started = membership.get('membership_started_at') or (proto or {}).get('created_at')
    period = ''
    if started:
        period = f" · {started.strftime('%b %Y')} – {datetime.utcnow().strftime('%b %Y')}"
    c.drawCentredString(W / 2, H - 78 * mm, f"completed the {plan_name} coaching plan{weeks}{period}")

    y = H - 92 * mm
    if results:
        stats = []
        if results.get('weight_change_kg') is not None:
            stats.append((f"{results['weight_change_kg']:+.1f} kg", f"{results['start_weight_kg']} → {results['end_weight_kg']} kg"))
        if results.get('checkins'):
            stats.append((str(results['checkins']), 'weekly check-ins'))
        if results.get('doses_total'):
            stats.append((f"{round(100 * results['doses_done'] / results['doses_total'])}%", f"doses completed ({results['doses_done']}/{results['doses_total']})"))
        if stats:
            box_w = 60 * mm; gap = 6 * mm; total_w = len(stats) * box_w + (len(stats) - 1) * gap
            x = (W - total_w) / 2
            for big, small in stats:
                c.setFillColor(colors.HexColor('#f4f5f8')); c.roundRect(x, y - 22 * mm, box_w, 22 * mm, 3 * mm, fill=1, stroke=0)
                c.setFillColor(navy); c.setFont('Helvetica-Bold', 20); c.drawCentredString(x + box_w / 2, y - 10 * mm, big)
                c.setFillColor(colors.HexColor('#64748b')); c.setFont('Helvetica', 9); c.drawCentredString(x + box_w / 2, y - 17 * mm, small)
                x += box_w + gap
            y -= 30 * mm

    if photos:
        pw = 48 * mm; ph = 48 * mm; gap = 6 * mm
        total_w = len(photos) * pw + (len(photos) - 1) * gap
        x = (W - total_w) / 2
        for data, _ct in photos[:3]:
            try:
                c.drawImage(ImageReader(io.BytesIO(data)), x, y - ph, pw, ph, preserveAspectRatio=True, anchor='c', mask='auto')
            except Exception as e:
                logger.warning(f'certificate photo skipped: {e}')
            x += pw + gap
        y -= ph + 6 * mm

    style = ParagraphStyle('q', fontName='Helvetica-Oblique', fontSize=11, leading=15, textColor=colors.HexColor('#334155'), alignment=1)
    if review:
        p = Paragraph(f'“{review}”', style); w, h = p.wrap(W - 80 * mm, 60 * mm); p.drawOn(c, 40 * mm, y - h); y -= h + 4 * mm
    if coach_note:
        ns = ParagraphStyle('n', fontName='Helvetica', fontSize=10, leading=14, textColor=colors.HexColor('#475569'), alignment=1)
        p = Paragraph(f'<b>From your coach:</b> {coach_note}', ns); w, h = p.wrap(W - 80 * mm, 60 * mm); p.drawOn(c, 40 * mm, y - h); y -= h

    c.setStrokeColor(accent); c.setLineWidth(1); c.line(W / 2 - 40 * mm, 30 * mm, W / 2 + 40 * mm, 30 * mm)
    c.setFillColor(navy); c.setFont('Helvetica-Bold', 11); c.drawCentredString(W / 2, 25 * mm, coach_name)
    c.setFillColor(colors.HexColor('#64748b')); c.setFont('Helvetica', 8)
    c.drawCentredString(W / 2, 21 * mm, f'Coach · {brand} · issued {datetime.utcnow().strftime("%d %B %Y")} · peer-education programme, not medical advice')
    c.showPage(); c.save()
    return buf.getvalue()


@router.post('/coach/clients/{client_id}/certificate')
async def coach_issue_certificate(client_id: str, payload: CertificateIn, user: dict = Depends(require_coach)):
    client = await _get_coach_client(client_id, user['id'])
    state = await membership_state(client)
    plan = await get_plan(client.get('tier'))
    proto = await db.protocols.find_one({'client_id': client_id}, sort=[('created_at', -1)])
    settings = await db.settings.find_one({}) or {}
    brand = settings.get('site_name') or 'GHP-Health'
    full = (client.get('customer_name') or 'Client').strip()
    name = full.split(' ')[0] if payload.anonymise else full
    if not payload.include_identity:
        name = 'A valued client'
    results = await _results_for(client, proto) if payload.include_results else None
    photos = []
    if payload.include_photos and payload.photo_ids:
        for pid in payload.photo_ids[:3]:
            ph = await db.coaching_photos.find_one({'id': pid, 'client_id': client_id})
            if ph:
                try:
                    photos.append(await _photo_bytes(ph))
                except Exception as e:
                    logger.warning(f'photo fetch failed: {e}')
    coach_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or 'Your coach'
    pdf = _build_pdf(brand, '#c8a24a', name, (plan or {}).get('name', 'Coaching'), proto, client, results, photos,
                     payload.review_text.strip() if payload.include_review else '',
                     payload.coach_note.strip() if payload.include_coach_note else '', coach_name, payload.headline.strip() or 'Certificate of Completion')
    cid = str(uuid.uuid4())
    path = f"{APP_NAME}/coaching-certificates/{client_id}/{cid}.pdf"
    try:
        put_object(path, pdf, 'application/pdf')
    except Exception as e:
        raise HTTPException(500, f'Storage upload failed: {e}')
    doc = {'id': cid, 'client_id': client_id, 'coach_id': user['id'], 'storage_path': path, 'options': payload.model_dump(),
           'name_shown': name, 'plan_name': (plan or {}).get('name'), 'tier': state['tier'], 'results': results,
           'created_at': datetime.utcnow()}
    await db.coaching_certificates.insert_one(dict(doc))
    return _cert_out(doc)


@router.get('/coach/clients/{client_id}/certificates')
async def coach_certificates(client_id: str, user: dict = Depends(require_coach)):
    await _get_coach_client(client_id, user['id'])
    docs = await db.coaching_certificates.find({'client_id': client_id}).sort('created_at', -1).to_list(50)
    return [_cert_out(c) for c in docs]


@router.delete('/coach/certificates/{cert_id}')
async def coach_delete_certificate(cert_id: str, user: dict = Depends(require_coach)):
    res = await db.coaching_certificates.delete_one({'id': cert_id, 'coach_id': user['id']})
    if res.deleted_count == 0:
        raise HTTPException(404, 'Certificate not found')
    return {'ok': True}


@router.get('/my/certificates')
async def my_certificates(user: dict = Depends(get_current_user)):
    client = await _my_client(user)
    if not client:
        return []
    docs = await db.coaching_certificates.find({'client_id': client['id']}).sort('created_at', -1).to_list(50)
    return [_cert_out(c) for c in docs]


@router.get('/certificates/{cert_id}/pdf')
async def certificate_pdf(cert_id: str, user: dict = Depends(get_current_user)):
    cert = await db.coaching_certificates.find_one({'id': cert_id})
    if not cert:
        raise HTTPException(404, 'Certificate not found')
    if user.get('role') != 'admin' and not await _can_view_client(user, cert['client_id']):
        raise HTTPException(404, 'Certificate not found')
    data, _ = get_object(cert['storage_path'])
    return Response(content=data, media_type='application/pdf',
                    headers={'Content-Disposition': f'inline; filename="certificate-{cert_id[:8]}.pdf"'})
