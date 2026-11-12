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
from certificate_render import build_pdf, build_share_image
from db import db
from routes.coaching_routes import _get_coach_client, _my_client
from routes.coaching_plans_routes import membership_state, require_member, get_plan, feedback_pending
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


def _normalise_photo(data: bytes, ct: str) -> tuple[bytes, str]:
    """HEIC → JPEG (browsers/certificates can't read HEIC), fix EXIF rotation, cap at 2000px."""
    from PIL import Image, ImageOps
    try:
        if ct == 'image/heic':
            import pillow_heif
            pillow_heif.register_heif_opener()
        im = Image.open(io.BytesIO(data))
        im = ImageOps.exif_transpose(im)
        if ct == 'image/heic' or max(im.size) > 2000 or len(data) > 3 * 1024 * 1024:
            im.thumbnail((2000, 2000))
            out = io.BytesIO()
            im.convert('RGB').save(out, 'JPEG', quality=88, optimize=True)
            return out.getvalue(), 'image/jpeg'
        return data, ct
    except Exception as e:
        logger.warning(f'photo normalise skipped: {e}')
        return data, ct


@router.post('/my/photos')
async def my_upload_photo(file: UploadFile = File(...), caption: str = '', taken_on: str = '', client: dict = Depends(require_member)):
    ct = (file.content_type or '').lower()
    if ct == 'image/heif':
        ct = 'image/heic'
    if ct not in IMG_TYPES:
        raise HTTPException(400, 'Please upload a JPG, PNG, WEBP or HEIC image')
    data = await file.read()
    if len(data) > MAX_PHOTO:
        raise HTTPException(400, 'Photo too large (max 10MB)')
    data, ct = _normalise_photo(data, ct)
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
    # Journey summary: which auto numbers to show (coach picks)
    stats: list[str] = ['weight', 'checkins', 'doses', 'weeks']
    include_photos: bool = False
    photo_ids: list[str] = []
    include_review: bool = True
    review_text: str = ''
    feedback_id: Optional[str] = None  # use the client's own testimonial instead of review_text
    include_summary: bool = False
    summary_text: str = ''  # coach's written journey summary
    include_coach_note: bool = True
    coach_note: str = ''
    headline: str = 'Certificate of Completion'
    send_email: bool = True
    skip_feedback_check: bool = False


def _cert_out(c: dict) -> dict:
    d = doc_to_dict(c)
    d.pop('storage_path', None)
    d.pop('image_path', None)
    d['pdf_url'] = f"/api/coaching/certificates/{c['id']}/pdf"
    d['image_url'] = f"/api/coaching/certificates/{c['id']}/image" if c.get('image_path') else None
    return d


async def _results_for(client: dict, proto: Optional[dict], stats: Optional[list[str]] = None) -> dict:
    weigh = await db.weigh_ins.find({'client_id': client['id']}).sort('date', 1).to_list(500)
    checkins = await db.coaching_checkins.count_documents({'client_id': client['id']})
    done = await db.calendar_entries.count_documents({'client_id': client['id'], 'done': True}) if proto else 0
    total = await db.calendar_entries.count_documents({'client_id': client['id']}) if proto else 0
    start_w = weigh[0]['weight_kg'] if weigh else None
    end_w = weigh[-1]['weight_kg'] if weigh else None
    weeks = None
    if proto and proto.get('created_at'):
        weeks = min(proto.get('duration_weeks') or 0, max(1, (datetime.utcnow() - proto['created_at']).days // 7 + 1))
    out = {'start_weight_kg': start_w, 'end_weight_kg': end_w,
           'weight_change_kg': round(end_w - start_w, 1) if start_w is not None and end_w is not None else None,
           'checkins': checkins, 'doses_done': done, 'doses_total': total,
           'weeks_completed': weeks, 'weeks_total': (proto or {}).get('duration_weeks')}
    if stats is not None:
        if 'weight' not in stats:
            out['weight_change_kg'] = None
        if 'checkins' not in stats:
            out['checkins'] = 0
        if 'doses' not in stats:
            out['doses_total'] = 0
        if 'weeks' not in stats:
            out['weeks_completed'] = None
    return out


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
    if not payload.skip_feedback_check and await feedback_pending(client):
        raise HTTPException(409, "The client hasn't answered your end-of-plan feedback request yet. Wait for it, withdraw the request, or tick 'issue anyway'.")
    results = await _results_for(client, proto, payload.stats) if payload.include_results else None
    review = payload.review_text.strip() if payload.include_review else ''
    review_by = ''
    if payload.include_review and payload.feedback_id:
        fb = await db.coaching_feedback.find_one({'id': payload.feedback_id, 'client_id': client_id})
        if not fb or not fb.get('allow_certificate') or not fb.get('testimonial'):
            raise HTTPException(400, "That feedback can't be used — the client hasn't allowed their quote on the certificate.")
        review = fb['testimonial'].strip()
        review_by = (client.get('customer_name') or 'the client').split(' ')[0] if payload.include_identity else 'the client'
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
    cid = str(uuid.uuid4())
    pdf = build_pdf(brand, name, (plan or {}).get('name', 'Coaching'), proto, client, results, photos,
                    review, payload.coach_note.strip() if payload.include_coach_note else '', coach_name,
                    payload.headline.strip() or 'Certificate of Completion',
                    summary=payload.summary_text.strip() if payload.include_summary else '', review_by=review_by, cert_id=cid)
    path = f"{APP_NAME}/coaching-certificates/{client_id}/{cid}.pdf"
    img_path = f"{APP_NAME}/coaching-certificates/{client_id}/{cid}.png"
    try:
        put_object(path, pdf, 'application/pdf')
        png = build_share_image(brand, name, (plan or {}).get('name', 'Coaching'), results, photos,
                                review, coach_name, payload.headline.strip() or 'Certificate of Completion')
        put_object(img_path, png, 'image/png')
    except Exception as e:
        raise HTTPException(500, f'Storage upload failed: {e}')
    doc = {'id': cid, 'client_id': client_id, 'coach_id': user['id'], 'storage_path': path, 'image_path': img_path,
           'options': {**payload.model_dump(), 'review_text': review},
           'name_shown': name, 'plan_name': (plan or {}).get('name'), 'tier': state['tier'], 'results': results,
           'created_at': datetime.utcnow()}
    await db.coaching_certificates.insert_one(dict(doc))
    if payload.send_email and client.get('customer_email'):
        try:
            from email_service import send_certificate_email
            await send_certificate_email(client, doc, pdf, payload.coach_note.strip(), coach_name)
            await db.coaching_certificates.update_one({'id': cid}, {'$set': {'emailed_at': datetime.utcnow()}})
            doc['emailed_at'] = datetime.utcnow()
        except Exception as e:
            logger.error(f'certificate email failed: {e}')
            doc['email_error'] = str(e)[:200]
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


# ---------- Wall of Wins (members-only results page) ----------
async def _wall_viewer(user: dict = Depends(get_current_user)) -> dict:
    if user.get('role') in ('coach', 'admin'):
        return user
    client = await _my_client(user)
    if not client:
        raise HTTPException(403, 'No coaching membership')
    if not (await membership_state(client))['active']:
        raise HTTPException(402, 'Coaching membership is not active')
    return user


def _wall_out(c: dict) -> dict:
    return {'id': c['id'], 'name_shown': c.get('name_shown'), 'plan_name': c.get('plan_name'), 'tier': c.get('tier'),
            'headline': (c.get('options') or {}).get('headline'), 'results': c.get('results'),
            'review_text': (c.get('options') or {}).get('review_text') if (c.get('options') or {}).get('include_review') else '',
            'shared_at': c.get('shared_at'), 'created_at': c.get('created_at'),
            'image_url': f"/api/coaching/wall/{c['id']}/image"}


@router.get('/wall')
async def wall_of_wins(_=Depends(_wall_viewer)):
    docs = await db.coaching_certificates.find({'shared_to_wall': True, 'image_path': {'$exists': True}}).sort('shared_at', -1).to_list(200)
    return [_wall_out(c) for c in docs]


@router.get('/wall/{cert_id}/image')
async def wall_image(cert_id: str, _=Depends(_wall_viewer)):
    cert = await db.coaching_certificates.find_one({'id': cert_id, 'shared_to_wall': True})
    if not cert or not cert.get('image_path'):
        raise HTTPException(404, 'Not on the wall')
    data, _ct = get_object(cert['image_path'])
    return Response(content=data, media_type='image/png', headers={'Cache-Control': 'private, max-age=3600'})


class ShareIn(BaseModel):
    shared: bool


@router.patch('/my/certificates/{cert_id}/share')
async def my_share_certificate(cert_id: str, payload: ShareIn, user: dict = Depends(get_current_user)):
    client = await _my_client(user)
    cert = await db.coaching_certificates.find_one({'id': cert_id}) if client else None
    if not cert or cert['client_id'] != client['id']:
        raise HTTPException(404, 'Certificate not found')
    if payload.shared and not cert.get('image_path'):
        raise HTTPException(400, 'This certificate has no share image')
    await db.coaching_certificates.update_one({'id': cert_id}, {'$set': {'shared_to_wall': payload.shared, 'shared_at': datetime.utcnow() if payload.shared else None}})
    return _cert_out(await db.coaching_certificates.find_one({'id': cert_id}))


@router.patch('/coach/certificates/{cert_id}/share')
async def coach_share_certificate(cert_id: str, payload: ShareIn, user: dict = Depends(require_coach)):
    cert = await db.coaching_certificates.find_one({'id': cert_id, 'coach_id': user['id']})
    if not cert:
        raise HTTPException(404, 'Certificate not found')
    await db.coaching_certificates.update_one({'id': cert_id}, {'$set': {'shared_to_wall': payload.shared, 'shared_at': datetime.utcnow() if payload.shared else None}})
    return _cert_out(await db.coaching_certificates.find_one({'id': cert_id}))


@router.get('/certificates/{cert_id}/image')
async def certificate_image(cert_id: str, user: dict = Depends(get_current_user)):
    cert = await db.coaching_certificates.find_one({'id': cert_id})
    if not cert or not cert.get('image_path'):
        raise HTTPException(404, 'Share image not found')
    if user.get('role') != 'admin' and not await _can_view_client(user, cert['client_id']):
        raise HTTPException(404, 'Share image not found')
    data, _ = get_object(cert['image_path'])
    return Response(content=data, media_type='image/png',
                    headers={'Content-Disposition': f'attachment; filename="certificate-{cert_id[:8]}.png"'})


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
