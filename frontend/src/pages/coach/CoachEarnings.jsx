import React, { useEffect, useState } from 'react';
import { Coaches } from '../../lib/api';
import { Loader2, PoundSterling, CheckCircle2, CircleDashed } from 'lucide-react';

const fmt = (n) => `£${Number(n || 0).toFixed(2)}`;
const dt = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB') : '—');

const Kpi = ({ label, value, tone = 'slate' }) => {
  const map = {
    slate: 'bg-slate-50 text-slate-900',
    emerald: 'bg-emerald-50 text-emerald-900',
    amber: 'bg-amber-50 text-amber-900',
    sky: 'bg-sky-50 text-sky-900',
  };
  return (
    <div className={`rounded-lg p-4 ${map[tone]}`}>
      <p className="text-[10px] uppercase tracking-widest font-bold opacity-75 mb-1">{label}</p>
      <p className="text-2xl font-black">{value}</p>
    </div>
  );
};

const CoachEarnings = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    Coaches.myEarnings()
      .then(setData)
      .catch(e => setErr(e?.response?.data?.detail || e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>;
  if (err) return <div className="p-4 bg-rose-50 border border-rose-200 rounded text-sm text-rose-700">Failed to load earnings: {err}</div>;
  if (!data) return null;

  return (
    <div className="space-y-6" data-testid="coach-earnings-page">
      <div>
        <h1 className="text-3xl font-black uppercase text-slate-900 tracking-tight">My Earnings</h1>
        <p className="text-sm text-slate-500">Paid orders from your coaching clients. Payouts are recorded by GHP-Health admin.</p>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Orders" value={data.earnings.orders_count} tone="slate" />
        <Kpi label="Total Gross" value={fmt(data.earnings.gross_total)} tone="sky" />
        <Kpi label="Paid Out" value={fmt(data.earnings.total_paid_out)} tone="emerald" />
        <Kpi label="Pending" value={fmt(data.earnings.pending_payout)} tone="amber" />
      </div>

      {/* Orders */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-800">Attributed Orders</h2>
          <span className="text-xs text-slate-500">{(data.orders || []).length} total</span>
        </div>
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] sticky top-0 z-10">
              <tr>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Order</th>
                <th className="p-3 text-left">Date</th>
                <th className="p-3 text-left">Customer</th>
                <th className="p-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(data.orders || []).map(o => (
                <tr key={o.id} className={o.coach_payout_paid ? 'bg-slate-50/50 text-slate-500' : ''} data-testid={`my-earnings-row-${o.order_number}`}>
                  <td className="p-3">
                    {o.coach_payout_paid ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Paid</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700"><CircleDashed className="h-4 w-4" /> Pending</span>
                    )}
                  </td>
                  <td className="p-3 font-mono font-bold text-sky-700">{o.order_number}</td>
                  <td className="p-3 text-slate-600">{dt(o.created_at)}</td>
                  <td className="p-3">
                    <p className="font-semibold text-slate-900 leading-tight">{o.shipping_address?.first_name} {o.shipping_address?.last_name}</p>
                    <p className="text-xs text-slate-500 truncate max-w-[200px]">{o.shipping_address?.email}</p>
                  </td>
                  <td className="p-3 text-right font-bold text-slate-900">{fmt(o.total)}</td>
                </tr>
              ))}
              {(data.orders || []).length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-slate-500">No paid orders yet from your coaching clients.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payout history */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b bg-slate-50 flex items-center gap-2">
          <PoundSterling className="h-4 w-4 text-emerald-600" />
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-800">Payout History</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 uppercase text-[10px]">
            <tr>
              <th className="p-3 text-left">Date</th>
              <th className="p-3 text-left">Orders covered</th>
              <th className="p-3 text-left">Note</th>
              <th className="p-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(data.payouts || []).map(p => (
              <tr key={p.id}>
                <td className="p-3 text-xs">{dt(p.created_at)}</td>
                <td className="p-3 text-xs text-slate-600 font-mono">
                  {(p.order_numbers || []).length > 0
                    ? (p.order_numbers.length <= 3 ? p.order_numbers.join(', ') : `${p.order_numbers.slice(0, 2).join(', ')} +${p.order_numbers.length - 2} more`)
                    : <span className="italic text-slate-400">Manual</span>}
                </td>
                <td className="p-3 text-xs text-slate-600">{p.note || '—'}</td>
                <td className="p-3 text-right font-bold text-emerald-700">{fmt(p.amount)}</td>
              </tr>
            ))}
            {(data.payouts || []).length === 0 && (
              <tr><td colSpan={4} className="p-6 text-center text-slate-500 text-sm">No payouts recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CoachEarnings;
