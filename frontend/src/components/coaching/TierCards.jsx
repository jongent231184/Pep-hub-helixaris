import React from 'react';
import { Check, Crown, Medal, Award } from 'lucide-react';

export const TIER_META = {
  bronze: { icon: Medal, ring: 'border-amber-700/40', chip: 'bg-amber-100 text-amber-900', grad: 'from-amber-700 to-amber-500' },
  silver: { icon: Award, ring: 'border-slate-400/60', chip: 'bg-slate-200 text-slate-800', grad: 'from-slate-500 to-slate-300' },
  gold: { icon: Crown, ring: 'border-yellow-500/70', chip: 'bg-yellow-100 text-yellow-900', grad: 'from-yellow-600 to-yellow-400' },
};

export const TierBadge = ({ tier, className = '' }) => {
  const m = TIER_META[tier] || TIER_META.bronze;
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${m.chip} ${className}`} data-testid={`tier-badge-${tier}`}>
      <Icon className="h-3 w-3" /> {tier}
    </span>
  );
};

const TierCards = ({ plans, selected, onSelect, compact = false }) => (
  <div className={`grid gap-4 ${compact ? 'md:grid-cols-3' : 'md:grid-cols-3'}`} data-testid="tier-cards">
    {plans.map((p, i) => {
      const m = TIER_META[p.tier] || TIER_META.bronze;
      const Icon = m.icon;
      const prev = i > 0 ? plans[i - 1] : null;
      const isSel = selected === p.tier;
      const featured = p.tier === 'silver';
      return (
        <button
          key={p.tier}
          type="button"
          onClick={() => onSelect?.(p.tier)}
          className={`relative text-left rounded-2xl border-2 bg-white p-6 transition-transform duration-200 hover:-translate-y-1 ${isSel ? 'border-slate-900 shadow-xl' : m.ring} ${featured && !isSel ? 'shadow-lg' : ''}`}
          data-testid={`tier-card-${p.tier}`}
        >
          {featured && (
            <span className="absolute -top-3 left-6 bg-slate-900 text-white text-[10px] uppercase tracking-widest font-bold px-3 py-1 rounded-full">Most popular</span>
          )}
          <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${m.grad} text-white grid place-items-center`}>
            <Icon className="h-5 w-5" />
          </div>
          <p className="mt-4 text-xs uppercase tracking-widest font-bold text-slate-500">{p.name}</p>
          <p className="mt-1 text-3xl font-black text-slate-900">£{Number(p.price_monthly).toFixed(0)}<span className="text-sm font-semibold text-slate-500"> / month</span></p>
          <p className="text-sm text-slate-600 mt-2 min-h-[40px]">{p.tagline}</p>
          <ul className="mt-4 space-y-2">
            {prev && (
              <li className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-600" /> Everything in {prev.name}
              </li>
            )}
            {(p.features || []).map((f, j) => (
              <li key={j} className="text-sm text-slate-800 flex items-start gap-2">
                <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" /> {f}
              </li>
            ))}
          </ul>
          {onSelect && (
            <span className={`mt-6 block text-center font-bold uppercase tracking-wider text-sm py-2.5 rounded-lg ${isSel ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-900'}`}>
              {isSel ? 'Selected' : `Choose ${p.name}`}
            </span>
          )}
        </button>
      );
    })}
  </div>
);

export default TierCards;
