import React from 'react';
import { MessageCircle } from 'lucide-react';
import { BRAND } from '../config/brand';

export const paylinkMessage = (order, url, discountPct) => {
  const items = (order.items || []).map(it => `${it.qty}× ${it.name}${it.option ? ` (${it.option})` : ''}`).join(', ');
  const name = order.shipping_address?.first_name ? `Hi ${order.shipping_address.first_name}, ` : 'Hi, ';
  const disc = Number(order.discount) > 0
    ? ` (${discountPct ? `${discountPct}% discount` : 'discount'} of £${Number(order.discount).toFixed(2)} already applied)`
    : '';
  return `${name}here's your ${BRAND.name} order link for ${items} — £${Number(order.total).toFixed(2)}${disc}.\n\nPay securely by card, Apple Pay or Google Pay here:\n${url}\n\nFor in-vitro laboratory research use only.`;
};

export const whatsappHref = (text, phone) => {
  const digits = (phone || '').replace(/\D/g, '').replace(/^0/, '44');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
};

export const WhatsAppShareButton = ({ order, url, discountPct, phone, size = 'sm', className = '', testId }) => (
  <a
    href={whatsappHref(paylinkMessage(order, url, discountPct), phone)}
    target="_blank"
    rel="noopener noreferrer"
    data-testid={testId || `whatsapp-share-${order.order_number}`}
    className={`inline-flex items-center gap-1.5 rounded font-semibold bg-[#25D366] hover:bg-[#1ebe5d] text-white transition-colors ${size === 'sm' ? 'text-xs px-3 h-9' : 'text-sm px-4 h-10'} ${className}`}
  >
    <MessageCircle className="h-4 w-4" /> WhatsApp
  </a>
);
