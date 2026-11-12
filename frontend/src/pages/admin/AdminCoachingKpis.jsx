import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Coaches } from '../../lib/api';
import { Loader2, Users, PoundSterling, Award, CalendarCheck, MessageSquare, ClipboardList } from 'lucide-react';
import { AdminFeedbackSection } from '../../components/coaching/FeedbackSummary';

const Stat = ({ icon: Icon, label, value, sub, testId }) => (
  <div className="bg-white border border-slate-200 rounded-xl p-5" data-testid={testId}>
    <div className="flex items-center justify-between"><p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{label}</p><Icon className="h-4 w-4 text-slate-400" /></div>
    <p className="text-3xl font-black text-slate-900 mt-2">{value}</p>
    {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
  </div>
);

const gbp = (n) => `£${Number(n || 0).toFixed(2)}`;

const AdminCoachingKpis = () => {
  const [k, setK] = useState(null);
  const [earn, setEarn] = useState([]);
  useEffect(() => {
    Coaches.adminKpis().then(setK).catch(() => setK({}));
    Coaches.adminEarningsList().then(setEarn).catch(() => {});
  }, []);
  if (!k) return <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>;
  const m = k.members || {}, p = k.plans_purchased || {}, r = k.revenue || {}, q = k.requests || {}, e = k.engagement || {};
  const maxRev = Math.max(1, ...(k.monthly || []).map(x => x.revenue));
  const tierName = (t) => (t || 'unknown').charAt(0).toUpperCase() + (t || 'unknown').slice(1);

  return (
    <div className="space-y-8" data-testid="admin-coaching-kpis">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div><h1 className="text-2xl font-black">Coaching KPIs</h1><p className="text-sm text-slate-600">Owner view of the coaching programme · as of {new Date(k.as_of).toLocaleString('en-GB')}</p></div>
        <Link to="/admin/coach-earnings" className="text-sm font-bold text-sky-600 hover:underline">Payouts & earnings →</Link>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat icon={PoundSterling} label="Revenue this month" value={gbp(r.this_month)} sub={`${gbp(r.last_30_days)} last 30 days · ${gbp(r.all_time)} all time`} testId="kpi-revenue" />
        <Stat icon={Users} label="Active members" value={m.active ?? 0} sub={`${m.lapsed ?? 0} lapsed · ${m.awaiting_first_payment ?? 0} awaiting first payment`} testId="kpi-active" />
        <Stat icon={Award} label="Plans purchased" value={p.total_payments ?? 0} sub={`${p.first_months ?? 0} first months · ${p.renewals ?? 0} renewals · ${p.unpaid_links ?? 0} unpaid links`} testId="kpi-plans" />
        <Stat icon={ClipboardList} label="Requests → paying" value={`${q.conversion_pct ?? 0}%`} sub={`${q.total ?? 0} requests · ${q.new ?? 0} new · ${q.last_30_days ?? 0} in 30 days`} testId="kpi-conversion" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="bg-white border rounded-xl p-5" data-testid="kpi-by-tier">
          <h2 className="text-xs uppercase tracking-widest text-slate-500 font-bold mb-3">Plans purchased by tier</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500 uppercase"><th className="py-1">Tier</th><th>Payments</th><th>Revenue</th><th>Active now</th></tr></thead>
            <tbody className="divide-y">
              {(p.by_tier || []).map(t => (
                <tr key={t.tier}><td className="py-2 font-bold capitalize">{tierName(t.tier)}</td><td>{t.count}</td><td>{gbp(t.revenue)}</td><td>{(m.by_tier || {})[t.tier] || 0}</td></tr>
              ))}
              {(p.by_tier || []).length === 0 && <tr><td colSpan={4} className="py-3 text-slate-500">No membership payments yet.</td></tr>}
            </tbody>
          </table>
          {r.legacy_plans > 0 && <p className="text-xs text-slate-500 mt-3">Plus {gbp(r.legacy_plans)} from one-off protocol pay links before memberships.</p>}
        </section>
        <section className="bg-white border rounded-xl p-5" data-testid="kpi-monthly">
          <h2 className="text-xs uppercase tracking-widest text-slate-500 font-bold mb-3">Membership revenue · last 6 months</h2>
          <div className="flex items-end gap-3 h-40">
            {(k.monthly || []).map(x => (
              <div key={x.month} className="flex-1 h-full flex flex-col justify-end items-center gap-1" title={`${x.month}: ${gbp(x.revenue)} (${x.payments} payments)`}>
                <span className="text-[10px] font-bold text-slate-700">{x.revenue ? gbp(x.revenue).replace('.00', '') : ''}</span>
                <div className="w-full rounded-t bg-[#0b1528]" style={{ height: `${(x.revenue / maxRev) * 100}%`, minHeight: x.revenue ? 4 : 1 }} />
                <span className="text-[10px] text-slate-500">{x.month.split(' ')[0]}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat icon={CalendarCheck} label="Check-ins (30d)" value={e.checkins_30d ?? 0} sub={`${e.reviewed_pct ?? 0}% reviewed · avg reply ${e.avg_review_hours ?? '–'}h`} testId="kpi-checkins" />
        <Stat icon={MessageSquare} label="Messages (30d)" value={e.messages_30d ?? 0} sub={`${e.coach_replies_30d ?? 0} coach replies`} testId="kpi-messages" />
        <Stat icon={Award} label="Certificates issued" value={e.certificates_issued ?? 0} sub={`${e.photos_uploaded ?? 0} progress photos uploaded`} testId="kpi-certs" />
        <Stat icon={Users} label="New members (30d)" value={m.new_last_30_days ?? 0} sub={`${m.total_ever_paid ?? 0} have ever paid`} testId="kpi-new-members" />
      </div>

      <section className="bg-white border rounded-xl p-5" data-testid="kpi-payouts">
        <h2 className="text-xs uppercase tracking-widest text-slate-500 font-bold mb-3">Coach earnings & payouts</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-slate-500 uppercase"><th className="py-1">Coach</th><th>Gross earned</th><th>Paid out</th><th>Owed</th><th></th></tr></thead>
          <tbody className="divide-y">
            {earn.map(c => (
              <tr key={c.user?.id}><td className="py-2 font-bold">{`${c.user?.first_name || ''} ${c.user?.last_name || ''}`.trim() || c.user?.email}</td><td>{gbp(c.earnings?.gross_total)}</td><td>{gbp(c.earnings?.total_paid_out)}</td><td className="font-bold">{gbp(c.earnings?.pending_payout)}</td><td><Link to="/admin/coach-earnings" className="text-sky-600 text-xs font-bold">Manage →</Link></td></tr>
            ))}
            {earn.length === 0 && <tr><td colSpan={5} className="py-3 text-slate-500">No coach earnings yet.</td></tr>}
          </tbody>
        </table>
      </section>
      <AdminFeedbackSection />
    </div>
  );
};

export default AdminCoachingKpis;
