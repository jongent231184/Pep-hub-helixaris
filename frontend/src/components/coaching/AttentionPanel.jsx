import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Coaches } from '../../lib/api';
import { CalendarCheck, MessageSquare, Clock, AlertTriangle, CreditCard } from 'lucide-react';

const Row = ({ to, icon: Icon, title, sub, tone }) => (
  <Link to={to} className={`flex items-start gap-3 p-3 rounded-lg border bg-white hover:border-sky-300 transition-colors ${tone || ''}`} data-testid="attention-row">
    <Icon className="h-4 w-4 mt-0.5 shrink-0 text-slate-500" />
    <div className="min-w-0">
      <p className="text-sm font-bold text-slate-900 truncate">{title}</p>
      <p className="text-xs text-slate-600 truncate">{sub}</p>
    </div>
  </Link>
);

const AttentionPanel = () => {
  const [a, setA] = useState(null);
  useEffect(() => { Coaches.attention().then(setA).catch(() => setA({})); }, []);
  if (!a) return null;
  const total = (a.pending_checkins?.length || 0) + (a.unanswered_messages?.length || 0) + (a.expiring?.length || 0) + (a.lapsed?.length || 0) + (a.unpaid_first_month?.length || 0);
  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—';
  return (
    <section className="bg-white border rounded-xl p-6" data-testid="attention-panel">
      <h2 className="text-xs uppercase tracking-widest text-slate-500 font-bold mb-4">Needs your attention <span className="ml-1 text-slate-900">({total})</span></h2>
      {total === 0 ? <p className="text-sm text-slate-500">All caught up — no check-ins, messages or renewals waiting.</p> : (
        <div className="grid md:grid-cols-2 gap-3">
          {a.pending_checkins?.map(c => <Row key={c.id} to={`/coach/clients/${c.client_id}`} icon={CalendarCheck} title={`${c.customer_name} · check-in to review`} sub={`Week ending ${fmt(c.week_ending)}`} />)}
          {a.unanswered_messages?.map(m => <Row key={m.client_id} to={`/coach/clients/${m.client_id}/portal/messages`} icon={MessageSquare} title={`${m.customer_name} · message waiting`} sub={m.body} />)}
          {a.expiring?.map(c => <Row key={c.client_id} to={`/coach/clients/${c.client_id}`} icon={Clock} title={`${c.customer_name} · renews in ${c.days_left} day${c.days_left === 1 ? '' : 's'}`} sub={c.pending_order ? `Pay link ${c.pending_order.order_number} sent` : 'Renewal link not created yet'} tone="border-amber-200" />)}
          {a.lapsed?.map(c => <Row key={c.client_id} to={`/coach/clients/${c.client_id}`} icon={AlertTriangle} title={`${c.customer_name} · membership lapsed`} sub={`Paid until ${fmt(c.paid_until)} · portal paused`} tone="border-red-200" />)}
          {a.unpaid_first_month?.map(c => <Row key={c.client_id} to={`/coach/clients/${c.client_id}`} icon={CreditCard} title={`${c.customer_name} · first month unpaid`} sub={`Pay link ${c.pending_order?.order_number} · £${Number(c.pending_order?.amount || 0).toFixed(2)}`} />)}
        </div>
      )}
    </section>
  );
};

export default AttentionPanel;
