import React, { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PortalContext } from './PortalLayout';
import BRAND from '../../config/brand';
import { TierBadge } from '../../components/coaching/TierCards';
import { CalendarCheck, ClipboardList, MessageSquare, TrendingUp, ArrowRight, Lock, CheckCircle2, Megaphone } from 'lucide-react';

export const PortalHeader = ({ title, sub }) => (
  <div className="mb-6">
    <h1 className="text-3xl md:text-4xl font-black text-slate-900">{title}</h1>
    {sub && <p className="text-slate-600 mt-1">{sub}</p>}
  </div>
);

export const Card = ({ title, action, children, className = '', testId }) => (
  <section className={`bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-sm ${className}`} data-testid={testId}>
    {(title || action) && (
      <div className="flex items-center justify-between gap-3 mb-4">
        {title && <h2 className="text-lg font-black text-slate-900">{title}</h2>}
        {action}
      </div>
    )}
    {children}
  </section>
);

export const LockedModule = ({ name, plans, tier }) => {
  const needed = plans.find(p => (p.modules || []).includes(name));
  return (
    <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center" data-testid={`locked-${name}`}>
      <Lock className="h-8 w-8 mx-auto text-slate-300" />
      <h2 className="text-xl font-black text-slate-900 mt-4">Not included in your {tier} plan</h2>
      <p className="text-sm text-slate-600 mt-2">{needed ? `Upgrade to ${needed.name} (£${Number(needed.price_monthly).toFixed(0)}/month) to unlock this.` : 'Ask your coach about upgrading.'}</p>
      <Link to="../messages" relative="path" className="mt-6 inline-flex items-center gap-2 font-bold uppercase tracking-wider text-sm px-5 py-2.5 rounded-lg text-[#0b1528]" style={{ backgroundColor: BRAND.accent }}>Ask your coach to upgrade <ArrowRight className="h-4 w-4" /></Link>
    </div>
  );
};

const PortalDashboard = () => {
  const { membership: m, has, src, base, coachView } = useContext(PortalContext);
  const [proto, setProto] = useState(null);
  const [checkins, setCheckins] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  useEffect(() => {
    src.protocol().then(setProto).catch(() => {});
    src.broadcasts().then(setBroadcasts).catch(() => {});
    if (has('checkin')) src.checkins().then(setCheckins).catch(() => {});
  }, [has, src]);

  const today = new Date().toISOString().slice(0, 10);
  const todays = (proto?.calendar || []).filter(e => e.date === today);
  const done = todays.filter(e => e.done).length;
  const latest = checkins[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const dueCheckin = has('checkin') && (!latest || new Date(latest.created_at) < weekAgo);

  const tiles = [
    { to: `${base}/plan`, icon: ClipboardList, label: 'My Plan', value: proto ? proto.title : 'Being prepared', sub: proto ? `${proto.duration_weeks} weeks · ${proto.items?.length || 0} items` : 'Your coach is building it', mod: 'plan' },
    { to: `${base}/check-in`, icon: CalendarCheck, label: 'Weekly Check-in', value: dueCheckin ? 'Due now' : (latest ? 'Submitted' : 'Not yet'), sub: latest ? `Last: week ending ${latest.week_ending}` : 'Tell your coach how the week went', mod: 'checkin' },
    { to: `${base}/progress`, icon: TrendingUp, label: 'Progress', value: latest?.weight_kg ? `${latest.weight_kg} kg` : '—', sub: 'Weight, energy, sleep & training', mod: 'progress' },
    { to: `${base}/messages`, icon: MessageSquare, label: 'Messages', value: m.coach_name, sub: 'Your coach', mod: 'messages' },
  ];

  return (
    <div data-testid="portal-dashboard">
      <PortalHeader title={coachView ? `${m.client_name}'s portal` : 'Welcome back'} sub="Everything you need between coaching reviews." />
      {broadcasts.length > 0 && (
        <div className="space-y-3 mb-6" data-testid="broadcasts">
          {broadcasts.map(b => (
            <div key={b.id} className="rounded-2xl border-l-4 bg-white border border-slate-200 p-4 md:p-5 shadow-sm" style={{ borderLeftColor: BRAND.accent }} data-testid={`broadcast-${b.id}`}>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-slate-500">
                <Megaphone className="h-3.5 w-3.5" /> From {b.coach_name} · {new Date(b.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}{b.pinned && ' · Pinned'}
              </div>
              <p className="font-black text-slate-900 mt-1">{b.title}</p>
              {b.body && <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{b.body}</p>}
            </div>
          ))}
        </div>
      )}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {tiles.map(t => {
          const locked = !has(t.mod);
          return (
            <Link key={t.to} to={t.to} className={`bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow ${locked ? 'opacity-70' : ''}`} data-testid={`dash-tile-${t.mod}`}>
              <div className="flex items-center justify-between">
                <div className="h-9 w-9 rounded-lg grid place-items-center text-[#0b1528]" style={{ backgroundColor: BRAND.accent }}><t.icon className="h-4 w-4" /></div>
                {locked && <Lock className="h-4 w-4 text-slate-400" />}
              </div>
              <p className="text-xs uppercase tracking-widest font-bold text-slate-500 mt-4">{t.label}</p>
              <p className="text-lg font-black text-slate-900 mt-1 truncate">{locked ? 'Upgrade to unlock' : t.value}</p>
              <p className="text-xs text-slate-500 mt-1">{t.sub}</p>
            </Link>
          );
        })}
      </div>
      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-4">
        <Card title="Today's doses" action={<Link to={`${base}/plan`} className="text-sm font-bold text-slate-700 hover:underline">Full calendar →</Link>} testId="today-doses">
          {todays.length === 0 ? <p className="text-sm text-slate-500">Nothing scheduled for today.</p> : (
            <ul className="space-y-2">
              {todays.map(e => (
                <li key={e.id} className="flex items-center gap-3 text-sm">
                  <CheckCircle2 className={`h-5 w-5 ${e.done ? 'text-emerald-500' : 'text-slate-300'}`} />
                  <span className={e.done ? 'line-through text-slate-400' : 'text-slate-800'}><strong>{e.item_name}</strong>{e.dose && ` · ${e.dose}`}{e.time_of_day && ` · ${e.time_of_day}`}</span>
                </li>
              ))}
            </ul>
          )}
          {todays.length > 0 && <p className="text-xs text-slate-500 mt-3">{done}/{todays.length} done</p>}
        </Card>
        <Card title="Your membership" testId="membership-summary">
          <div className="flex items-center gap-3"><TierBadge tier={m.tier} /><span className="text-sm text-slate-700">{m.plan?.name} · £{Number(m.plan?.price_monthly || 0).toFixed(0)}/month</span></div>
          <p className="text-sm text-slate-600 mt-3">Paid until <strong>{m.paid_until ? new Date(m.paid_until).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</strong> ({m.days_left} days left). We email your next pay link a few days before — nothing is taken automatically.</p>
          {m.pending_order && <Link to={m.pending_order.payment_link} className="mt-4 inline-block text-sm font-bold text-[#0b1528] px-4 py-2 rounded-lg" style={{ backgroundColor: BRAND.accent }} data-testid="dash-pay-renewal">Pay next month · £{m.pending_order.amount.toFixed(2)}</Link>}
          {proto?.next_review_date && <p className="text-sm text-slate-600 mt-3" data-testid="next-review-date">Next plan review: <strong>{new Date(proto.next_review_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</strong></p>}
          {proto?.notes && <div className="mt-4 p-3 bg-slate-50 border rounded-lg text-xs text-slate-700 whitespace-pre-wrap" data-testid="coach-notes"><p className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1">Coach notes</p>{proto.notes}</div>}
        </Card>
      </div>
    </div>
  );
};

export default PortalDashboard;
