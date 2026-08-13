"""Order confirmation emails via Resend.

Sends two emails on payment capture:
  1. Customer — branded HTML order summary with PDF invoice attached.
  2. Admin — plain notification of the new sale.

All failures are logged and swallowed so email issues never break the order
flow. Non-blocking via asyncio.to_thread since the Resend SDK is synchronous.
"""
import asyncio
import base64
import io
import logging
import os
from datetime import datetime
from typing import Optional

import httpx
import resend
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image,
)

logger = logging.getLogger('email_service')

FROM_EMAIL = os.environ.get('RESEND_FROM_EMAIL', 'orders@ghp-health.com')
ADMIN_NOTIFY_EMAIL = os.environ.get('ADMIN_NOTIFY_EMAIL', 'GHP-Health@outlook.com')
BUSINESS_NAME = 'GHP-Health'
BUSINESS_TAGLINE = 'Research-grade peptides'
BUSINESS_URL = 'https://www.ghp-health.com'
LOGO_URL = 'https://customer-assets.emergentagent.com/job_ghp-ecommerce-pay/artifacts/0f0tlig3_ghp%20logo.jpg'

# In-memory cache of the logo bytes (fetched once per worker process).
_LOGO_BYTES: Optional[bytes] = None


def _load_logo_bytes() -> Optional[bytes]:
    global _LOGO_BYTES
    if _LOGO_BYTES is not None:
        return _LOGO_BYTES or None
    try:
        r = httpx.get(LOGO_URL, timeout=10.0)
        if r.status_code == 200 and r.content:
            _LOGO_BYTES = r.content
            return _LOGO_BYTES
    except Exception as e:  # pragma: no cover
        logger.warning(f'logo fetch failed: {e}')
    _LOGO_BYTES = b''  # sentinel so we don't retry every send
    return None


def _address_block(a: dict, include_email: bool = False, include_phone: bool = True) -> list[str]:
    """Return non-empty lines describing an address for use in either PDF or HTML."""
    if not a:
        return []
    lines = [f"{a.get('first_name', '')} {a.get('last_name', '')}".strip()]
    if include_email and a.get('email'):
        lines.append(a['email'])
    if include_phone and a.get('phone'):
        lines.append(a['phone'])
    lines.append(a.get('address1', ''))
    if a.get('address2'):
        lines.append(a['address2'])
    city_pc = ', '.join(x for x in [a.get('city', ''), a.get('postcode', '')] if x)
    if city_pc:
        lines.append(city_pc)
    if a.get('country'):
        lines.append(a['country'])
    return [ln for ln in lines if ln]


def _billing_differs(shipping: dict, billing: Optional[dict]) -> bool:
    if not billing:
        return False
    return (
        billing.get('address1') != shipping.get('address1')
        or billing.get('postcode') != shipping.get('postcode')
        or billing.get('city') != shipping.get('city')
        or billing.get('first_name') != shipping.get('first_name')
        or billing.get('last_name') != shipping.get('last_name')
    )


def _init_resend() -> bool:
    key = os.environ.get('RESEND_API_KEY', '').strip()
    if not key:
        return False
    resend.api_key = key
    return True


# ---------------- PDF INVOICE ----------------
def build_invoice_pdf(order: dict) -> bytes:
    """Generate a simple branded PDF invoice from an order document."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=18 * mm, bottomMargin=18 * mm,
        title=f"Invoice {order.get('order_number', '')}",
    )
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle('h1', parent=styles['Heading1'], fontSize=22, textColor=colors.HexColor('#0284c7'))
    small = ParagraphStyle('small', parent=styles['Normal'], fontSize=9, textColor=colors.HexColor('#64748b'))
    label = ParagraphStyle('label', parent=styles['Normal'], fontSize=8, textColor=colors.HexColor('#64748b'), spaceAfter=2)
    body = ParagraphStyle('body', parent=styles['Normal'], fontSize=10, leading=13)

    elems = []

    # Header — logo (if available) + brand text side by side
    logo_bytes = _load_logo_bytes()
    if logo_bytes:
        try:
            logo_img = Image(io.BytesIO(logo_bytes), width=22 * mm, height=22 * mm)
            brand_cell = [
                Paragraph(f"<b>{BUSINESS_NAME}</b>", h1),
                Paragraph(BUSINESS_TAGLINE, small),
                Paragraph(BUSINESS_URL, small),
            ]
            header_tbl = Table([[logo_img, brand_cell]], colWidths=[28 * mm, 145 * mm])
            header_tbl.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('LEFTPADDING', (0, 0), (-1, -1), 0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ]))
            elems.append(header_tbl)
        except Exception as e:
            logger.warning(f'logo embed failed: {e}')
            elems.append(Paragraph(f"<b>{BUSINESS_NAME}</b>", h1))
            elems.append(Paragraph(BUSINESS_TAGLINE, small))
            elems.append(Paragraph(BUSINESS_URL, small))
    else:
        elems.append(Paragraph(f"<b>{BUSINESS_NAME}</b>", h1))
        elems.append(Paragraph(BUSINESS_TAGLINE, small))
        elems.append(Paragraph(BUSINESS_URL, small))
    elems.append(Spacer(1, 8 * mm))

    # Invoice title + meta
    meta_data = [
        [Paragraph('<b>INVOICE</b>', ParagraphStyle('t', parent=styles['Heading2'], fontSize=16)),
         Paragraph(f"<b>Order #</b> {order.get('order_number', '')}", body)],
        ['', Paragraph(f"<b>Date</b> {datetime.utcnow().strftime('%d %b %Y')}", body)],
        ['', Paragraph(f"<b>Status</b> {order.get('payment_status', 'pending').upper()}", body)],
    ]
    meta_tbl = Table(meta_data, colWidths=[110 * mm, 65 * mm])
    meta_tbl.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP')]))
    elems.append(meta_tbl)
    elems.append(Spacer(1, 6 * mm))

    # Bill to (uses billing_address if present, else shipping)
    addr = order.get('shipping_address', {}) or {}
    billing = order.get('billing_address') or None
    billing_differs = bool(billing) and (
        billing.get('address1') != addr.get('address1')
        or billing.get('postcode') != addr.get('postcode')
        or billing.get('city') != addr.get('city')
        or billing.get('first_name') != addr.get('first_name')
        or billing.get('last_name') != addr.get('last_name')
    )
    bill_source = billing if billing_differs else addr
    bill_to_lines = [
        f"{bill_source.get('first_name', '')} {bill_source.get('last_name', '')}".strip(),
        addr.get('email', ''),
        bill_source.get('phone', '') or addr.get('phone', ''),
        bill_source.get('address1', ''),
        bill_source.get('address2', ''),
        f"{bill_source.get('city', '')}, {bill_source.get('postcode', '')}",
        bill_source.get('country', ''),
    ]
    bill_to = '<br/>'.join(line for line in bill_to_lines if line)
    if billing_differs:
        ship_to_lines = [
            f"{addr.get('first_name', '')} {addr.get('last_name', '')}".strip(),
            addr.get('address1', ''),
            addr.get('address2', ''),
            f"{addr.get('city', '')}, {addr.get('postcode', '')}",
            addr.get('country', ''),
        ]
        ship_to = '<br/>'.join(line for line in ship_to_lines if line)
        addr_tbl = Table(
            [[Paragraph('BILL TO', label), Paragraph('SHIP TO', label)],
             [Paragraph(bill_to, body), Paragraph(ship_to, body)]],
            colWidths=[87 * mm, 88 * mm],
        )
        addr_tbl.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP')]))
        elems.append(addr_tbl)
    else:
        elems.append(Paragraph('BILL TO', label))
        elems.append(Paragraph(bill_to, body))
    elems.append(Spacer(1, 6 * mm))

    # Items table
    items = order.get('items', [])
    rows = [['Item', 'Option', 'Qty', 'Price', 'Line total']]
    for it in items:
        rows.append([
            Paragraph(str(it.get('name', '')), body),
            str(it.get('option') or '—'),
            str(int(it.get('qty', 0))),
            f"£{float(it.get('price', 0)):.2f}",
            f"£{float(it.get('price', 0)) * int(it.get('qty', 0)):.2f}",
        ])
    items_tbl = Table(rows, colWidths=[75 * mm, 25 * mm, 15 * mm, 25 * mm, 30 * mm])
    items_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f1f5f9')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#334155')),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    elems.append(items_tbl)
    elems.append(Spacer(1, 6 * mm))

    # Totals
    sub = float(order.get('subtotal', 0))
    disc = float(order.get('discount', 0))
    ship = float(order.get('shipping', 0))
    total = float(order.get('total', 0))
    total_rows = [['Subtotal', f"£{sub:.2f}"]]
    if disc > 0:
        total_rows.append([f"Discount ({order.get('promo_code','')})", f"-£{disc:.2f}"])
    total_rows.append(['Shipping', 'FREE' if ship == 0 else f"£{ship:.2f}"])
    total_rows.append(['Total', f"£{total:.2f}"])
    tot_tbl = Table(total_rows, colWidths=[130 * mm, 40 * mm])
    tot_tbl.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'RIGHT'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, -1), (-1, -1), 12),
        ('TOPPADDING', (0, -1), (-1, -1), 6),
        ('LINEABOVE', (0, -1), (-1, -1), 0.75, colors.HexColor('#334155')),
    ]))
    elems.append(tot_tbl)
    elems.append(Spacer(1, 8 * mm))

    # Footer
    elems.append(Paragraph(
        f"Thank you for your order. If you have any questions, reply to this email or contact us at {BUSINESS_URL}.",
        small,
    ))
    elems.append(Spacer(1, 3 * mm))
    elems.append(Paragraph(
        f"{BUSINESS_NAME} — {BUSINESS_TAGLINE}. Products are supplied strictly for laboratory research use only.",
        small,
    ))

    doc.build(elems)
    return buf.getvalue()


# ---------------- HTML EMAIL ----------------
def _addresses_html(order: dict) -> str:
    """Ship-to + bill-to blocks for HTML emails. Two columns when addresses
    differ, one column when they don't."""
    ship = order.get('shipping_address') or {}
    bill = order.get('billing_address') or None
    differs = _billing_differs(ship, bill)

    def block_html(title: str, lines: list[str]) -> str:
        inner = '<br/>'.join(lines) if lines else '&mdash;'
        return (
            '<td valign="top" style="padding:0 12px 0 0;">'
            f'<div style="font-size:10px;letter-spacing:1px;font-weight:700;color:#94a3b8;text-transform:uppercase;margin-bottom:6px;">{title}</div>'
            f'<div style="font-size:13px;color:#334155;line-height:1.5;">{inner}</div>'
            '</td>'
        )

    if differs:
        cells = (
            block_html('Bill to', _address_block(bill, include_phone=True))
            + block_html('Ship to', _address_block(ship, include_phone=True))
        )
    else:
        cells = block_html('Ship to / Bill to', _address_block(ship, include_email=True, include_phone=True))
    return (
        f'<table role="presentation" width="100%" style="border-collapse:collapse;margin:16px 0 24px 0;">'
        f'<tr>{cells}</tr>'
        f'</table>'
    )


def _order_summary_html(order: dict) -> str:
    items_html = ''
    for it in order.get('items', []):
        opt = f" ({it['option']})" if it.get('option') else ''
        line = float(it.get('price', 0)) * int(it.get('qty', 0))
        items_html += (
            '<tr>'
            f'<td style="padding:8px 4px;border-bottom:1px solid #e2e8f0;">{int(it.get("qty", 0))}× {it.get("name", "")}{opt}</td>'
            f'<td align="right" style="padding:8px 4px;border-bottom:1px solid #e2e8f0;font-variant-numeric:tabular-nums;">£{line:.2f}</td>'
            '</tr>'
        )

    disc = float(order.get('discount', 0))
    disc_row = ''
    if disc > 0:
        disc_row = (
            '<tr>'
            f'<td style="padding:4px;color:#065f46;">Discount ({order.get("promo_code","")})</td>'
            f'<td align="right" style="padding:4px;color:#065f46;">-£{disc:.2f}</td>'
            '</tr>'
        )
    ship = float(order.get('shipping', 0))
    ship_str = 'FREE' if ship == 0 else f'£{ship:.2f}'
    addresses_html = _addresses_html(order)
    return f"""
<table role="presentation" width="100%" style="border-collapse:collapse;background:#f8fafc;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="600" style="border-collapse:collapse;background:#ffffff;border-radius:8px;overflow:hidden;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">
      <tr>
        <td style="padding:24px 32px;background:#0f172a;color:#ffffff;">
          <table role="presentation" width="100%" style="border-collapse:collapse;">
            <tr>
              <td valign="middle" style="width:56px;">
                <img src="{LOGO_URL}" alt="{BUSINESS_NAME}" width="48" height="48" style="display:block;border-radius:6px;" />
              </td>
              <td valign="middle" style="padding-left:14px;">
                <div style="font-size:20px;font-weight:800;letter-spacing:0.5px;">{BUSINESS_NAME}</div>
                <div style="font-size:12px;color:#94a3b8;">{BUSINESS_TAGLINE}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:32px;">
          <h1 style="margin:0 0 8px 0;font-size:22px;color:#0f172a;">Thank you for your order!</h1>
          <p style="margin:0 0 16px 0;color:#475569;font-size:14px;">
            We've received your payment and are preparing your order.
          </p>
          <p style="margin:0 0 8px 0;font-size:13px;color:#334155;">
            Order number: <strong style="font-family:'Courier New',monospace;color:#0284c7;">{order.get('order_number','')}</strong>
          </p>
          {addresses_html}
          <table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px;color:#334155;">
            {items_html}
            <tr><td style="padding:8px 4px;">Subtotal</td>
                <td align="right" style="padding:8px 4px;">£{float(order.get('subtotal',0)):.2f}</td></tr>
            {disc_row}
            <tr><td style="padding:4px;">Shipping</td><td align="right" style="padding:4px;">{ship_str}</td></tr>
            <tr>
              <td style="padding:12px 4px;border-top:2px solid #0f172a;font-weight:700;font-size:16px;">Total</td>
              <td align="right" style="padding:12px 4px;border-top:2px solid #0f172a;font-weight:700;font-size:16px;">£{float(order.get('total',0)):.2f}</td>
            </tr>
          </table>
          <p style="margin:24px 0 0 0;color:#475569;font-size:13px;line-height:1.5;">
            A PDF invoice is attached to this email for your records.
          </p>

          <div style="margin-top:32px;padding:20px 20px 16px 20px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
            <div style="font-size:11px;letter-spacing:1.5px;font-weight:700;color:#0284c7;text-transform:uppercase;margin-bottom:14px;">What happens next?</div>
            <table role="presentation" width="100%" style="border-collapse:collapse;">
              <tr>
                <td valign="top" style="width:32px;padding-bottom:12px;">
                  <div style="width:26px;height:26px;border-radius:50%;background:#0f172a;color:#ffffff;font-weight:700;font-size:12px;text-align:center;line-height:26px;">1</div>
                </td>
                <td valign="top" style="padding-bottom:12px;padding-left:8px;">
                  <div style="font-size:13px;font-weight:700;color:#0f172a;">Order confirmed</div>
                  <div style="font-size:12px;color:#64748b;line-height:1.5;">We're preparing your parcel today.</div>
                </td>
              </tr>
              <tr>
                <td valign="top" style="padding-bottom:12px;">
                  <div style="width:26px;height:26px;border-radius:50%;background:#0f172a;color:#ffffff;font-weight:700;font-size:12px;text-align:center;line-height:26px;">2</div>
                </td>
                <td valign="top" style="padding-bottom:12px;padding-left:8px;">
                  <div style="font-size:13px;font-weight:700;color:#0f172a;">Dispatched within 24 hours</div>
                  <div style="font-size:12px;color:#64748b;line-height:1.5;">You'll receive a tracking email as soon as your parcel is on its way.</div>
                </td>
              </tr>
              <tr>
                <td valign="top">
                  <div style="width:26px;height:26px;border-radius:50%;background:#0f172a;color:#ffffff;font-weight:700;font-size:12px;text-align:center;line-height:26px;">3</div>
                </td>
                <td valign="top" style="padding-left:8px;">
                  <div style="font-size:13px;font-weight:700;color:#0f172a;">Delivery in 1&ndash;3 working days</div>
                  <div style="font-size:12px;color:#64748b;line-height:1.5;">Royal Mail Tracked delivery to your shipping address.</div>
                </td>
              </tr>
            </table>
          </div>

          <p style="margin:20px 0 0 0;color:#64748b;font-size:12px;line-height:1.5;">
            Any questions? Just reply to this email or write to
            <a href="mailto:{ADMIN_NOTIFY_EMAIL}" style="color:#0284c7;">{ADMIN_NOTIFY_EMAIL}</a>.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 32px 24px 32px;background:#f1f5f9;color:#64748b;font-size:11px;">
          {BUSINESS_NAME} · Products supplied strictly for laboratory research use only.<br/>
          <a href="{BUSINESS_URL}" style="color:#0284c7;">{BUSINESS_URL}</a>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
""".strip()


def _admin_notify_html(order: dict) -> str:
    ship = order.get('shipping_address', {}) or {}
    cust = f"{ship.get('first_name','')} {ship.get('last_name','')}".strip() or '—'
    items_str = ', '.join(
        f"{int(i.get('qty',0))}× {i.get('name','')}" for i in order.get('items', [])
    )
    addresses_html = _addresses_html(order)
    return f"""
<div style="font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;padding:16px;max-width:640px;">
  <table role="presentation" width="100%" style="border-collapse:collapse;margin-bottom:16px;">
    <tr>
      <td valign="middle" style="width:56px;">
        <img src="{LOGO_URL}" alt="{BUSINESS_NAME}" width="44" height="44" style="display:block;border-radius:6px;" />
      </td>
      <td valign="middle" style="padding-left:12px;">
        <h2 style="margin:0;color:#0f172a;font-size:18px;">New order — {order.get('order_number','')}</h2>
        <p style="margin:2px 0 0 0;font-size:12px;color:#64748b;">{BUSINESS_NAME}</p>
      </td>
    </tr>
  </table>
  <p style="margin:4px 0;"><strong>Customer:</strong> {cust} &lt;{ship.get('email','—')}&gt;</p>
  <p style="margin:4px 0;"><strong>Items:</strong> {items_str}</p>
  <p style="margin:4px 0;"><strong>Total:</strong> £{float(order.get('total',0)):.2f} ({order.get('payment_status','')})</p>
  <p style="margin:4px 0;"><strong>Source:</strong> {order.get('source') or 'web'}</p>
  {addresses_html}
  <p><a href="{BUSINESS_URL}/admin/orders/{order.get('id','')}" style="color:#0284c7;">Open in admin dashboard</a></p>
</div>
""".strip()


# ---------------- SEND ----------------
async def send_order_emails(order: dict) -> None:
    """Fire the customer confirmation + admin notification for a paid order.
    Never raises — logs failures instead."""
    if not _init_resend():
        logger.warning('RESEND_API_KEY not set — skipping order emails')
        return

    order_number = order.get('order_number', '?')

    # Build the PDF once — used for both customer and admin emails.
    try:
        pdf_bytes = await asyncio.to_thread(build_invoice_pdf, order)
    except Exception as e:
        logger.warning(f'invoice PDF build failed for {order_number}: {e}')
        pdf_bytes = None

    customer_email = (order.get('shipping_address') or {}).get('email', '')
    # Skip the placeholder we use before the customer fills their address
    if customer_email and customer_email != 'pending@ghp-health.com':
        try:
            params = {
                'from': f'{BUSINESS_NAME} <{FROM_EMAIL}>',
                'to': [customer_email],
                'subject': f'Order confirmed — {order_number}',
                'html': _order_summary_html(order),
            }
            if pdf_bytes:
                params['attachments'] = [{
                    'filename': f'Invoice-{order_number}.pdf',
                    'content': list(pdf_bytes),
                }]
            res = await asyncio.to_thread(resend.Emails.send, params)
            logger.info(f'customer email sent for {order_number}: {res.get("id")}')
        except Exception as e:
            logger.error(f'customer email failed for {order_number}: {e}')
    else:
        logger.info(f'skipping customer email for {order_number} — placeholder address')

    if ADMIN_NOTIFY_EMAIL:
        try:
            params = {
                'from': f'{BUSINESS_NAME} orders <{FROM_EMAIL}>',
                'to': [ADMIN_NOTIFY_EMAIL],
                'subject': f'New order {order_number} — £{float(order.get("total", 0)):.2f}',
                'html': _admin_notify_html(order),
            }
            if pdf_bytes:
                params['attachments'] = [{
                    'filename': f'Invoice-{order_number}.pdf',
                    'content': list(pdf_bytes),
                }]
            res = await asyncio.to_thread(resend.Emails.send, params)
            logger.info(f'admin notify sent for {order_number}: {res.get("id")}')
        except Exception as e:
            logger.error(f'admin notify failed for {order_number}: {e}')


AREA_LABELS = {
    'weightloss': 'Weight loss',
    'peptide_info': 'Peptide information',
    'dosage_guide': 'Dosage guide',
    'how_to_guide': 'How-to guide (vials / pens)',
}


async def send_coaching_request_email(req: dict) -> None:
    """Notify the coach that a new coaching intake was received."""
    if not _init_resend():
        logger.warning('coaching notify skipped: RESEND_API_KEY not set')
        return

    coach_email = os.environ.get('COACH_EMAIL', 'ghp-coaching@outlook.com').strip()
    area = AREA_LABELS.get(req.get('area', ''), req.get('area', 'Unknown'))
    name = f"{req.get('first_name', '')} {req.get('last_name', '')}".strip() or req.get('email', '')
    ref = req.get('id', '')[:8]

    html = f"""
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f172a">
      <div style="border-bottom:3px solid #0284c7;padding-bottom:16px;margin-bottom:20px">
        <p style="font-size:11px;letter-spacing:2px;color:#0284c7;font-weight:700;text-transform:uppercase;margin:0">GHP-Health · New coaching request</p>
        <h1 style="font-size:22px;font-weight:900;margin:6px 0 0">You have a new intake from {name}</h1>
      </div>
      <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px">
        <tr><td style="padding:6px 0;color:#64748b;width:110px">Name</td><td><strong>{name}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Email</td><td><a href="mailto:{req.get('email','')}">{req.get('email','')}</a></td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Phone</td><td>{req.get('phone') or '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Area</td><td><strong>{area}</strong></td></tr>
      </table>
      {f'<div style="margin-top:16px;padding:12px;background:#f8fafc;border-radius:8px;font-size:14px;line-height:1.55"><p style="margin:0 0 6px;color:#64748b;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700">Their message</p>{req.get("message","").replace(chr(10),"<br>")}</div>' if req.get('message') else ''}
      <div style="margin-top:20px;padding:12px;background:#ecfdf5;border-left:4px solid #10b981;border-radius:4px;font-size:12px">
        Waiver accepted at submission — peer-education only, not medical advice.
      </div>
      <p style="margin-top:24px;font-size:12px;color:#64748b">Log in at <a href="https://www.ghp-health.com/admin/coaching">the admin dashboard</a> to accept, decline, or reply.</p>
      <p style="font-size:11px;color:#94a3b8;margin-top:12px">Reference: {ref}</p>
    </div>
    """

    try:
        params = {
            'from': f'{BUSINESS_NAME} coaching <{FROM_EMAIL}>',
            'to': [coach_email],
            'reply_to': [req.get('email', FROM_EMAIL)],
            'subject': f'New coaching request · {area} · {name}',
            'html': html,
        }
        res = await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f'coaching notify sent to {coach_email}: {res.get("id")}')
    except Exception as e:
        logger.error(f'coaching notify failed: {e}')
