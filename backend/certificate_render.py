"""Certificate PDF + square share image renderers (brand-aware)."""
import io
import logging
import os
from datetime import datetime
from typing import Optional

logger = logging.getLogger('ghp.certificate')

ASSETS = os.path.join(os.path.dirname(__file__), 'assets')
FONT_DIR = '/usr/share/fonts/truetype/liberation'
BRANDS = {
    'helixaris': {'logo': 'helixaris-logo.png', 'accent': '#7ec8ff', 'accent_dark': '#2b7fc2', 'navy': '#070e1f', 'tagline': 'Advancing Peptide Research'},
    'ghp-health': {'logo': 'ghp-health-logo.jpg', 'accent': '#c8a24a', 'accent_dark': '#8a6a1a', 'navy': '#0b1528', 'tagline': 'Coaching · Peer-education programme'},
}


def brand_theme(brand_name: str) -> dict:
    key = 'helixaris' if 'helixaris' in (brand_name or '').lower() else 'ghp-health'
    t = dict(BRANDS[key]); t['key'] = key; t['name'] = brand_name or ('Helixaris' if key == 'helixaris' else 'GHP-Health')
    t['logo_path'] = os.path.join(ASSETS, t['logo'])
    return t


def _fonts():
    """Register Liberation fonts for reportlab; fall back to Helvetica."""
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    names = {'serif': 'LiberationSerif-Regular', 'serif_b': 'LiberationSerif-Bold', 'serif_i': 'LiberationSerif-Italic',
             'sans': 'LiberationSans-Regular', 'sans_b': 'LiberationSans-Bold', 'sans_i': 'LiberationSans-Italic'}
    out = {}
    for k, n in names.items():
        try:
            if n not in pdfmetrics.getRegisteredFontNames():
                pdfmetrics.registerFont(TTFont(n, os.path.join(FONT_DIR, n + '.ttf')))
            out[k] = n
        except Exception:
            out[k] = {'serif': 'Times-Roman', 'serif_b': 'Times-Bold', 'serif_i': 'Times-Italic', 'sans': 'Helvetica', 'sans_b': 'Helvetica-Bold', 'sans_i': 'Helvetica-Oblique'}[k]
    return out


def stat_rows(results: Optional[dict], short: bool = False) -> list[tuple[str, str]]:
    if not results:
        return []
    stats = []
    if results.get('weeks_completed'):
        stats.append((f"{results['weeks_completed']}", 'weeks completed' if short else f"weeks completed of {results.get('weeks_total') or results['weeks_completed']}"))
    if results.get('weight_change_kg') is not None:
        stats.append((f"{results['weight_change_kg']:+.1f} kg", 'weight change' if short else f"{results['start_weight_kg']} → {results['end_weight_kg']} kg"))
    if results.get('checkins'):
        stats.append((str(results['checkins']), 'check-ins' if short else 'weekly check-ins'))
    if results.get('doses_total'):
        stats.append((f"{round(100 * results['doses_done'] / results['doses_total'])}%", 'doses done' if short else f"doses completed ({results['doses_done']}/{results['doses_total']})"))
    return stats


def _feathered_logo(path: str, bg_rgb: tuple) -> 'bytes':
    """Logo pasted on the panel colour with edges faded out, so the rectangular image blends into the panel."""
    from PIL import Image, ImageDraw, ImageFilter
    logo = Image.open(path).convert('RGB')
    w, h = logo.size
    pad = int(min(w, h) * 0.12)
    canvas = Image.new('RGB', (w + 2 * pad, h + 2 * pad), bg_rgb)
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((pad, pad, w - pad, h - pad), radius=pad, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(pad * 0.9))
    canvas.paste(logo, (pad, pad), mask)
    out = io.BytesIO(); canvas.save(out, 'PNG'); out.seek(0)
    return out


def _logo_bg(path: str) -> tuple:
    from PIL import Image
    try:
        return Image.open(path).convert('RGB').getpixel((3, 3))
    except Exception:
        return (11, 21, 40)


def build_pdf(brand: str, name: str, plan_name: str, proto: Optional[dict], membership: dict, results: Optional[dict],
              photos: list, review: str, coach_note: str, coach_name: str, headline: str,
              summary: str = '', review_by: str = '', cert_id: str = '') -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas
    from reportlab.platypus import Paragraph

    T = brand_theme(brand); F = _fonts()
    navy = colors.HexColor(T['navy']); accent = colors.HexColor(T['accent']); accent_dark = colors.HexColor(T['accent_dark'])
    grey = colors.HexColor('#64748b'); ink = colors.HexColor('#0f172a'); soft = colors.HexColor('#f4f5f8')
    buf = io.BytesIO(); W, H = landscape(A4)
    c = canvas.Canvas(buf, pagesize=(W, H)); c.setTitle(f'{headline} · {name}'); c.setAuthor(T['name'])

    # ---- left brand panel (colour sampled from the logo so it blends seamlessly) ----
    PW = 215
    px = _logo_bg(T['logo_path'])
    navy = colors.Color(px[0] / 255, px[1] / 255, px[2] / 255)
    c.setFillColor(navy); c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(colors.white); c.rect(PW, 0, W - PW, H, fill=1, stroke=0)
    c.setFillColor(accent); c.rect(PW, 0, 3, H, fill=1, stroke=0)
    # decorative rings bottom-left
    c.saveState(); c.setStrokeColor(accent); c.setLineWidth(0.6)
    for i, r in enumerate((70, 95, 120, 145)):
        c.setStrokeAlpha(0.28 - i * 0.06); c.circle(30, 40, r, fill=0, stroke=1)
    c.restoreState()
    # logo
    try:
        img = ImageReader(_feathered_logo(T['logo_path'], px)); iw, ih = img.getSize()
        max_w, max_h = PW - 30, 215
        s = min(max_w / iw, max_h / ih); lw, lh = iw * s, ih * s
        c.drawImage(img, (PW - lw) / 2, H - 36 - lh, lw, lh, mask='auto')
        y_left = H - 36 - lh - 16
    except Exception as e:
        logger.warning(f'logo missing: {e}')
        c.setFillColor(colors.white); c.setFont(F['sans_b'], 18); c.drawCentredString(PW / 2, H - 80, T['name']); y_left = H - 110
    c.setStrokeColor(accent); c.setLineWidth(1); c.line(PW / 2 - 30, y_left, PW / 2 + 30, y_left)
    c.setFillColor(accent); c.setFont(F['sans_b'], 8.5)
    c.drawCentredString(PW / 2, y_left - 16, 'COACHING PROGRAMME')
    c.setFillColor(colors.HexColor('#94a3b8')); c.setFont(F['sans'], 8)
    c.drawCentredString(PW / 2, y_left - 29, T['tagline'][:40])
    # signature block
    c.setStrokeColor(accent); c.setLineWidth(0.8); c.line(28, 92, PW - 28, 92)
    c.setFillColor(colors.white); c.setFont(F['serif_i'], 16); c.drawCentredString(PW / 2, 100, coach_name)
    c.setFillColor(colors.HexColor('#94a3b8')); c.setFont(F['sans'], 7.5)
    c.drawCentredString(PW / 2, 80, f'Coach · {T["name"]}')
    c.drawCentredString(PW / 2, 69, f'Issued {datetime.utcnow().strftime("%d %B %Y")}')
    if cert_id:
        c.setFont(F['sans'], 6.5); c.setFillColor(colors.HexColor('#64748b')); c.drawCentredString(PW / 2, 56, f'Certificate no. {cert_id[:8].upper()}')

    # ---- right content ----
    L = PW + 34; R = W - 34; CW = R - L
    # seal
    sx, sy, sr = R - 30, H - 56, 26
    c.setFillColor(accent); c.circle(sx, sy, sr, fill=1, stroke=0)
    c.setStrokeColor(colors.white); c.setLineWidth(1.2); c.circle(sx, sy, sr - 4, fill=0, stroke=1)
    c.setFillColor(navy); c.setFont(F['sans_b'], 6.5); c.drawCentredString(sx, sy + 5, 'COMPLETED')
    c.setFont(F['serif_b'], 11); c.drawCentredString(sx, sy - 8, datetime.utcnow().strftime('%Y'))

    def flow(c, extra, measure=False):
        """Draw the content column; `extra` is added after each block. Returns final y."""
        y = H - 46
        c.setFillColor(accent_dark); c.setFont(F['sans_b'], 8.5)
        c.drawString(L, y, f'{plan_name.upper()} PLAN  ·  CERTIFICATE & REVIEW'); y -= 30
        c.setFillColor(navy); c.setFont(F['serif_b'], 30); c.drawString(L, y, headline); y -= 22
        c.setFillColor(grey); c.setFont(F['sans'], 11); c.drawString(L, y, 'This certifies that'); y -= 34
        c.setFillColor(ink); c.setFont(F['serif_b'], 34); c.drawString(L, y, name)
        nw = c.stringWidth(name, F['serif_b'], 34)
        c.setStrokeColor(accent); c.setLineWidth(2); c.line(L, y - 7, L + min(nw, CW * 0.6), y - 7); y -= 24
        weeks = f" · {proto.get('duration_weeks')} weeks" if proto and proto.get('duration_weeks') else ''
        started = membership.get('membership_started_at') or (proto or {}).get('created_at')
        period = f" · {started.strftime('%b %Y')} – {datetime.utcnow().strftime('%b %Y')}" if started else ''
        c.setFillColor(grey); c.setFont(F['sans'], 11)
        c.drawString(L, y, f"has completed the {plan_name} coaching plan{weeks}{period}"); y -= 22 + extra

        stats = stat_rows(results)
        if stats:
            gap = 10; bw = (CW - gap * (len(stats) - 1)) / len(stats); bh = 52 + extra * 0.8
            x = L
            for big, small in stats:
                c.setFillColor(soft); c.roundRect(x, y - bh, bw, bh, 6, fill=1, stroke=0)
                c.setFillColor(accent); c.rect(x + 10, y - 3, bw - 20, 2, fill=1, stroke=0)
                c.setFillColor(navy); c.setFont(F['serif_b'], 22 + extra / 3); c.drawCentredString(x + bw / 2, y - bh / 2 - 1, big)
                c.setFillColor(grey); c.setFont(F['sans'], 8); c.drawCentredString(x + bw / 2, y - bh + 10, small)
                x += bw + gap
            y -= bh + 16 + extra

        if photos:
            ph = (118 if not (summary or review) else 96) + min(extra, 20) * 2; pw = ph; gap = 12
            n = min(len(photos), 3); total = n * pw + (n - 1) * gap
            x = L + (CW - total) / 2
            for i, (data, _ct) in enumerate(photos[:3]):
                try:
                    c.setFillColor(soft); c.roundRect(x - 3, y - ph - 3, pw + 6, ph + 6, 6, fill=1, stroke=0)
                    if not measure:
                        c.drawImage(ImageReader(io.BytesIO(data)), x, y - ph, pw, ph, preserveAspectRatio=True, anchor='c', mask='auto')
                    if n == 2:
                        c.setFillColor(grey); c.setFont(F['sans_b'], 7); c.drawCentredString(x + pw / 2, y - ph - 13, ('BEFORE', 'AFTER')[i])
                except Exception as e:
                    logger.warning(f'certificate photo skipped: {e}')
                x += pw + gap
            y -= ph + (24 if n == 2 else 14) + extra

        def para(text, style, max_h=90):
            nonlocal y
            p = Paragraph(text, style); _w, h = p.wrap(CW, max_h); p.drawOn(c, L, y - h); y -= h + 8 + extra

        if summary:
            c.setFillColor(accent_dark); c.setFont(F['sans_b'], 7.5); c.drawString(L, y, 'THE JOURNEY'); y -= 11
            para(summary, ParagraphStyle('s', fontName=F['sans'], fontSize=9.5, leading=13, textColor=colors.HexColor('#334155')))
        if review:
            c.setFillColor(accent); c.setFont(F['serif_b'], 40); c.drawString(L - 4, y - 16, '“')
            q = ParagraphStyle('q', fontName=F['serif_i'], fontSize=12, leading=16, textColor=ink, leftIndent=22)
            para(f'{review}' + (f' <font name="{F["sans"]}" size="8" color="#64748b">— {review_by}</font>' if review_by else ''), q)
        if coach_note:
            para(f'<b>From your coach:</b> {coach_note}', ParagraphStyle('n', fontName=F['sans'], fontSize=9, leading=12.5, textColor=colors.HexColor('#475569')))
        return y

    # pass 1: measure on scratch canvases, picking the largest spacing that still fits above the footer
    extra = 0
    for cand in (30, 24, 18, 12, 6, 0):
        if flow(canvas.Canvas(io.BytesIO(), pagesize=(W, H)), cand, measure=True) >= 58:
            extra = cand
            break
    flow(c, extra)

    c.setStrokeColor(colors.HexColor('#e2e8f0')); c.setLineWidth(0.6); c.line(L, 40, R, 40)
    c.setFillColor(colors.HexColor('#94a3b8')); c.setFont(F['sans'], 7)
    c.drawString(L, 29, f'{T["name"]} coaching is a peer-education programme based on personal experience — not medical advice.')
    c.drawRightString(R, 29, 'Shared with the client’s permission.')
    c.showPage(); c.save()
    return buf.getvalue()


def build_share_image(brand: str, name: str, plan_name: str, results: Optional[dict], photos: list,
                      review: str, coach_name: str, headline: str) -> bytes:
    """1080x1080 PNG for Instagram / group chats."""
    from PIL import Image, ImageDraw, ImageFont, ImageOps

    T = brand_theme(brand)
    S = 1080
    bg = _logo_bg(T['logo_path'])
    img = Image.new('RGB', (S, S), bg)
    d = ImageDraw.Draw(img)
    F = os.path.join(FONT_DIR, 'LiberationSans-Bold.ttf'); FR = os.path.join(FONT_DIR, 'LiberationSans-Regular.ttf')
    FS = os.path.join(FONT_DIR, 'LiberationSerif-Bold.ttf'); FI = os.path.join(FONT_DIR, 'LiberationSerif-Italic.ttf')
    font = lambda p, s: ImageFont.truetype(p, s)  # noqa: E731
    accent = T['accent']
    d.rounded_rectangle((36, 36, S - 36, S - 36), radius=40, outline=accent, width=5)
    y = 62
    try:
        logo = Image.open(_feathered_logo(T['logo_path'], bg)).convert('RGB')
        logo.thumbnail((420, 170))
        img.paste(logo, ((S - logo.width) // 2, y)); y += logo.height + 6
    except Exception as e:
        logger.warning(f'share logo missing: {e}')
        d.text((S / 2, y + 20), T['name'].upper(), fill=accent, font=font(F, 30), anchor='mm'); y += 60
    d.text((S / 2, y), headline.upper(), fill='white', font=font(FS, 50), anchor='mt'); y += 64
    d.text((S / 2, y), name, fill=accent, font=font(FS, 62), anchor='mt'); y += 76
    d.text((S / 2, y), f'completed the {plan_name} plan', fill='#cbd5e1', font=font(FR, 28), anchor='mt'); y += 54
    if photos:
        pw, ph = 300, (230 if review else 360)
        n = min(len(photos), 2); total = n * pw + (n - 1) * 30
        x = (S - total) // 2
        for data, _ in photos[:2]:
            try:
                p = ImageOps.fit(Image.open(io.BytesIO(data)).convert('RGB'), (pw, ph), centering=(0.5, 0.35))
                frame = Image.new('RGB', (pw, ph), '#13223d'); frame.paste(p, (0, 0))
                mask = Image.new('L', (pw, ph), 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, pw - 1, ph - 1), radius=18, fill=255)
                img.paste(frame, (x, y), mask)
            except Exception as e:
                logger.warning(f'share image photo skipped: {e}')
            x += pw + 30
        if n == 2:
            d.text((S / 2 - 165, y + ph + 26), 'BEFORE', fill='#94a3b8', font=font(F, 22), anchor='mm')
            d.text((S / 2 + 165, y + ph + 26), 'AFTER', fill='#94a3b8', font=font(F, 22), anchor='mm')
        y += ph + (56 if n == 2 else 30)
    stats = stat_rows(results, short=True)[:4]
    if stats:
        th = 100 if (review and photos) else 116
        bw = 220 if len(stats) > 3 else 260; gap = 22; total = len(stats) * bw + (len(stats) - 1) * gap
        x = (S - total) // 2
        for big, small in stats:
            d.rounded_rectangle((x, y, x + bw, y + th), radius=20, fill='#13223d')
            d.rounded_rectangle((x + 20, y, x + bw - 20, y + 4), radius=2, fill=accent)
            d.text((x + bw / 2, y + th * 0.42), big, fill='white', font=font(FS, 42 if th > 100 else 38), anchor='mm')
            d.text((x + bw / 2, y + th - 24), small, fill='#94a3b8', font=font(FR, 20), anchor='mm')
            x += bw + gap
        y += th + 28
    room = (S - 130) - y
    if review and room > 40:
        max_lines = max(1, min(4, int(room // 38)))
        words = review.split(); lines = []; cur = ''
        for w in words:
            t = (cur + ' ' + w).strip()
            if d.textlength(t, font=font(FI, 30)) > S - 220:
                lines.append(cur); cur = w
            else:
                cur = t
        if cur:
            lines.append(cur)
        if len(lines) > max_lines:
            lines = lines[:max_lines]; lines[-1] = lines[-1].rstrip('.,;') + '…'
        for i, ln in enumerate(lines):
            d.text((S / 2, y + 14), ('“' if i == 0 else '') + ln + ('”' if i == len(lines) - 1 else ''), fill='#e2e8f0', font=font(FI, 30), anchor='mm'); y += 38
    d.text((S / 2, S - 100), f'Coach {coach_name}', fill='white', font=font(F, 26), anchor='mm')
    d.text((S / 2, S - 66), 'peer-education programme · not medical advice', fill='#64748b', font=font(FR, 18), anchor='mm')
    out = io.BytesIO(); img.save(out, 'PNG', optimize=True)
    return out.getvalue()
