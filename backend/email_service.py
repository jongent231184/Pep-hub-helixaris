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

import resend
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
)

logger = logging.getLogger('email_service')

FROM_EMAIL = os.environ.get('RESEND_FROM_EMAIL', 'orders@ghp-health.com')
ADMIN_NOTIFY_EMAIL = os.environ.get('ADMIN_NOTIFY_EMAIL', 'GHP-Health@outlook.com')
BUSINESS_NAME = 'GHP-Health'
BUSINESS_TAGLINE = 'Research-grade peptides'
BUSINESS_URL = 'https://www.ghp-health.com'


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

    # Header
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
    return f"""
<table role="presentation" width="100%" style="border-collapse:collapse;background:#f8fafc;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="600" style="border-collapse:collapse;background:#ffffff;border-radius:8px;overflow:hidden;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">
      <tr>
        <td style="padding:24px 32px;background:#0f172a;color:#ffffff;">
          <div style="font-size:20px;font-weight:800;letter-spacing:0.5px;">{BUSINESS_NAME}</div>
          <div style="font-size:12px;color:#94a3b8;">{BUSINESS_TAGLINE}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:32px;">
          <h1 style="margin:0 0 8px 0;font-size:22px;color:#0f172a;">Thank you for your order!</h1>
          <p style="margin:0 0 16px 0;color:#475569;font-size:14px;">
            We've received your payment and are preparing your order.
          </p>
          <p style="margin:0 0 24px 0;font-size:13px;color:#334155;">
            Order number: <strong style="font-family:'Courier New',monospace;color:#0284c7;">{order.get('order_number','')}</strong>
          </p>
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
    addr = order.get('shipping_address', {})
    cust = f"{addr.get('first_name','')} {addr.get('last_name','')}".strip() or '—'
    items_str = ', '.join(
        f"{int(i.get('qty',0))}× {i.get('name','')}" for i in order.get('items', [])
    )
    return f"""
<div style="font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;padding:16px;">
  <h2 style="color:#0f172a;">New order — {order.get('order_number','')}</h2>
  <p><strong>Customer:</strong> {cust} &lt;{addr.get('email','—')}&gt;</p>
  <p><strong>Items:</strong> {items_str}</p>
  <p><strong>Total:</strong> £{float(order.get('total',0)):.2f} ({order.get('payment_status','')})</p>
  <p><strong>Source:</strong> {order.get('source') or 'web'}</p>
  <p><a href="{BUSINESS_URL}/admin/orders/{order.get('id','')}">Open in admin dashboard</a></p>
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
