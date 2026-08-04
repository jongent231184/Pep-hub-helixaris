import React, { useEffect, useState } from 'react';
import { Ambassadors } from '../../lib/api';
import { Loader2, PoundSterling } from 'lucide-react';

const AmbassadorPayouts = () => {
  const [me, setMe] = useState(null);
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([Ambassadors.me(), Ambassadors.payouts()])
      .then(([m, p]) => { setMe(m); setPayouts(p); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>;
  }

  const earnings = me?.earnings || { commission_earned: 0, total_paid_out: 0, pending_payout: 0 };

  return (
    <div data-testid="ambassador-payouts-page">
      <h1 className="text-2xl md:text-3xl font-black uppercase mb-2">Payouts</h1>
      <p className="text-sm text-slate-600 mb-6">A record of commission settlements from GHP-Health.</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Total commission earned</p>
          <p className="text-3xl font-black">£{earnings.commission_earned.toFixed(2)}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
          <p className="text-[10px] uppercase tracking-widest text-emerald-700 font-bold mb-2">Paid out</p>
          <p className="text-3xl font-black text-emerald-800">£{earnings.total_paid_out.toFixed(2)}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <p className="text-[10px] uppercase tracking-widest text-amber-700 font-bold mb-2">Pending payout</p>
          <p className="text-3xl font-black text-amber-800">£{earnings.pending_payout.toFixed(2)}</p>
        </div>
      </div>

      <div className="bg-white border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 uppercase text-xs">
            <tr>
              <th className="p-3 text-left">Date</th>
              <th className="p-3 text-left">Orders covered</th>
              <th className="p-3 text-left">Note</th>
              <th className="p-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {payouts.map(p => (
              <tr key={p.id}>
                <td className="p-3">{new Date(p.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                <td className="p-3 text-xs font-mono text-slate-700 max-w-[240px]" title={(p.order_numbers || []).join(', ')}>
                  {(p.order_numbers || []).length > 0
                    ? (p.order_numbers.length <= 4
                        ? p.order_numbers.join(', ')
                        : `${p.order_numbers.slice(0, 3).join(', ')} +${p.order_numbers.length - 3} more`)
                    : <span className="italic text-slate-400 font-sans">Manual adjustment</span>}
                </td>
                <td className="p-3 text-slate-700">{p.note || '—'}</td>
                <td className="p-3 text-right font-bold text-emerald-700">£{Number(p.amount).toFixed(2)}</td>
              </tr>
            ))}
            {payouts.length === 0 && (
              <tr>
                <td colSpan={4} className="p-10 text-center text-slate-500">
                  <PoundSterling className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                  No payouts have been settled yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AmbassadorPayouts;
