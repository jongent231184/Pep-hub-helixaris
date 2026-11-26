import React from 'react';
import { ShieldCheck } from 'lucide-react';

/**
 * Trust-badge row shown next to the "Pay by Bank" CTA.
 * Uses simpleicons.org for reliable, monochrome bank logos.
 * The colour parameter forces a consistent slate tint that reads well on
 * both light and slate backgrounds.
 */
const BANKS = [
  { slug: 'visa',            label: 'Visa' },
  { slug: 'mastercard',      label: 'Mastercard' },
  { slug: 'americanexpress', label: 'American Express' },
  { slug: 'applepay',        label: 'Apple Pay' },
  { slug: 'googlepay',       label: 'Google Pay' },
];

// Slate-500 hex without the leading '#'
const TINT = '64748b';

const BankTrustBadges = ({ compact = false }) => {
  return (
    <div
      className="mt-4 border border-slate-200 rounded-lg bg-white px-4 py-3"
      data-testid="bank-trust-badges"
    >
      <div className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-2">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
        <span>Secure card checkout · 3-D Secure · PCI DSS compliant</span>
      </div>
      <div className={`flex flex-wrap items-center justify-center ${compact ? 'gap-3' : 'gap-4'}`}>
        {BANKS.map((b) => (
          <img
            key={b.slug}
            src={`https://cdn.simpleicons.org/${b.slug}/${TINT}`}
            alt={b.label}
            title={b.label}
            className="h-5 w-auto opacity-70 hover:opacity-100 transition-opacity"
            loading="lazy"
          />
        ))}
        <span className="text-[11px] font-medium text-slate-400 ml-1">
          Card details are never stored by us
        </span>
      </div>
    </div>
  );
};

export default BankTrustBadges;
