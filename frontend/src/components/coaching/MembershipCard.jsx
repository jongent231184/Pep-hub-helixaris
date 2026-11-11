import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Coaches } from '../../lib/api';
import { TierBadge } from './TierCards';
import BRAND from '../../config/brand';
import { HeartPulse, Loader2, ArrowRight, Lock } from 'lucide-react';

const MembershipCard = () => {
  const [m, setM] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { Coaches.myMembership().then(setM).catch(() => setM(null)).finally(() => setLoading(false)); }, []);
  if (loading) return <div className="py-8 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-sky-500" /></div>;

  if (!m?.client_id) {
    return (
      <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center" data-testid="membership-none">
        <HeartPulse className="h-8 w-8 mx-auto text-slate-300 mb-3" />
        {m?.request ? (
          <>
            <p className="text-slate-700 font-semibold">Your {m.request.tier ? `${m.request.tier} plan` : 'coaching'} request is {m.request.status === 'new' ? 'with your coach' : m.request.status}.</p>
            <p className="text-sm text-slate-500 mt-1">Once accepted you'll get an email with your first month's pay link, and the portal will unlock here.</p>
          </>
        ) : (
          <>
            <p className="text-slate-600 font-semibold">No coaching plan yet.</p>
            <p className="text-sm text-slate-500 mt-1">Bronze, Silver and Gold monthly plans. <Link to="/coaching" className="text-sky-600 hover:underline font-semibold">See plans</Link></p>
          </>
        )}
      </div>
    );
  }

  const pending = m.pending_order;
  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200" data-testid="membership-card">
      <div className="bg-[#0b1528] text-white p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Coaching portal</p>
          <div className="flex items-center gap-3 mt-1">
            <h3 className="text-xl font-black">{m.plan?.name || 'Coaching'} plan</h3>
            {m.tier && <TierBadge tier={m.tier} />}
          </div>
          <p className="text-sm text-slate-300 mt-2">
            {m.active
              ? <>Active · paid until <strong className="text-white">{new Date(m.paid_until).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</strong> · coach {m.coach_name}</>
              : m.paid_until ? 'Paused — this month hasn\'t been paid yet' : 'Awaiting your first payment'}
          </p>
        </div>
        {m.active ? (
          <Link to="/portal" className="inline-flex items-center justify-center gap-2 font-bold uppercase tracking-wider text-sm px-5 py-3 rounded-lg text-[#0b1528]" style={{ backgroundColor: BRAND.accent }} data-testid="open-portal-btn">Open portal <ArrowRight className="h-4 w-4" /></Link>
        ) : (
          <span className="inline-flex items-center gap-2 text-sm text-slate-300"><Lock className="h-4 w-4" /> Portal locked</span>
        )}
      </div>
      {pending && (
        <div className="bg-amber-50 border-t border-amber-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm text-amber-900"><strong>{m.active ? 'Next month' : 'This month'}:</strong> {pending.tier} membership · £{pending.amount.toFixed(2)} · ref {pending.order_number}</p>
          <Link to={pending.payment_link} className="inline-flex items-center justify-center bg-slate-900 hover:bg-slate-800 text-white font-bold uppercase tracking-wider text-xs px-4 py-2.5 rounded-lg" data-testid="pay-membership-btn">Pay £{pending.amount.toFixed(2)}</Link>
        </div>
      )}
      {!pending && !m.active && <div className="bg-slate-50 p-4 text-sm text-slate-600">Your coach will email your monthly pay link shortly.</div>}
    </div>
  );
};

export default MembershipCard;
