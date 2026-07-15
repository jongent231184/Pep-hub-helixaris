import React from 'react';
import { Zap, Search, Hand } from 'lucide-react';

/**
 * Small pill badge indicating how a paid order was verified.
 * - webhook  → instant confirmation from Wallid's push event
 * - polling  → we asked Wallid via /status because the webhook was late/missing
 * - manual   → an admin flipped the payment_status themselves
 */
const CONFIG = {
  webhook: {
    label: 'Auto-verified',
    Icon: Zap,
    className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  polling: {
    label: 'Verified via poll',
    Icon: Search,
    className: 'bg-sky-100 text-sky-800 border-sky-200',
  },
  manual: {
    label: 'Manual',
    Icon: Hand,
    className: 'bg-slate-100 text-slate-700 border-slate-200',
  },
};

const PaymentSourceBadge = ({ source, className = '' }) => {
  const cfg = CONFIG[source];
  if (!cfg) return null;
  const { label, Icon } = cfg;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${cfg.className} ${className}`}
      title={
        source === 'webhook'
          ? 'Confirmed instantly by Wallid webhook'
          : source === 'polling'
          ? 'Confirmed via status poll (webhook was delayed or missing)'
          : 'Marked paid manually by an admin'
      }
      data-testid={`payment-source-badge-${source}`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
};

export default PaymentSourceBadge;
