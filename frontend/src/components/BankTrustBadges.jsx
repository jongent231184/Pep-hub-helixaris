import React from 'react';
import { ShieldCheck } from 'lucide-react';

/**
 * Trust-badge row shown next to the "Pay by Bank" CTA.
 * Uses simpleicons.org for reliable, monochrome bank logos.
 * The colour parameter forces a consistent slate tint that reads well on
 * both light and slate backgrounds.
 */
const BANKS = [
  { slug: 'barclays',     label: 'Barclays' },
  { slug: 'hsbc',         label: 'HSBC' },
  { slug: 'monzo',        label: 'Monzo' },
  { slug: 'starlingbank', label: 'Starling' },
  { slug: 'revolut',      label: 'Revolut' },
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
        <span>Connects securely to your bank · FCA-regulated</span>
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
          + Lloyds, NatWest, Santander & 50+ more
        </span>
      </div>
    </div>
  );
};

export default BankTrustBadges;
