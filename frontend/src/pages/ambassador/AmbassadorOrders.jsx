import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ambassadors } from '../../lib/api';
import { Loader2, Download, Search, CheckCircle2, Clock } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';

const AmbassadorOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'pending' | 'paid'

  useEffect(() => {
    Promise.all([Ambassadors.me(), Ambassadors.orders()])
      .then(([m, o]) => { setMe(m); setOrders(o); })
      .catch(() => { setMe(null); setOrders([]); })
      .finally(() => setLoading(false));
  }, []);

  const commissionRate = me?.user?.commission_rate || 15;

  const filtered = useMemo(() => {
    let result = orders;
    if (statusFilter === 'paid') result = result.filter(o => o.ambassador_commission_paid);
    if (statusFilter === 'pending') result = result.filter(o => !o.ambassador_commission_paid);
    if (query) {
      const q = query.toLowerCase();
      result = result.filter(o =>
        (o.order_number || '').toLowerCase().includes(q) ||
        (o.shipping_address?.email || '').toLowerCase().includes(q) ||
        `${o.shipping_address?.first_name || ''} ${o.shipping_address?.last_name || ''}`.toLowerCase().includes(q)
      );
    }
    return result;
  }, [orders, query, statusFilter]);

  const totals = useMemo(() => {
    const t = { count: 0, netSales: 0, gross: 0, commission: 0, pending: 0, paid: 0 };
    filtered.forEach(o => {
      const net = Number(o.subtotal || 0) - Number(o.discount || 0);
      const c = net * (commissionRate / 100);
      t.count += 1;
      t.netSales += net;
      t.gross += Number(o.total || 0);
      t.commission += c;
      if (o.ambassador_commission_paid) t.paid += c; else t.pending += c;
    });
    return t;
  }, [filtered, commissionRate]);

  const exportCSV = () => {
    const rows = [
      ['Order #', 'Date', 'Customer', 'Email', 'Items', 'Subtotal', 'Discount', 'Net Sales', 'Shipping', 'Total', 'Your Commission', 'Commission Status'],
      ...filtered.map(o => {
        const net = Number(o.subtotal || 0) - Number(o.discount || 0);
        const commission = net * (commissionRate / 100);
        const itemDesc = (o.items || []).map(i => `${i.qty}x ${i.name}${i.option ? ` (${i.option})` : ''}`).join('; ');
        return [
          o.order_number,
          new Date(o.created_at).toISOString(),
          `${o.shipping_address?.first_name || ''} ${o.shipping_address?.last_name || ''}`.trim(),
          o.shipping_address?.email || '',
          itemDesc,
          Number(o.subtotal || 0).toFixed(2),
          Number(o.discount || 0).toFixed(2),
          net.toFixed(2),
          Number(o.shipping || 0).toFixed(2),
          Number(o.total || 0).toFixed(2),
          commission.toFixed(2),
          o.ambassador_commission_paid ? 'Paid' : 'Pending',
        ];
      }),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ambassador-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const earnings = me?.earnings;
  const filters = [
    { key: 'all', label: 'All', count: orders.length },
    { key: 'pending', label: 'Pending', count: orders.filter(o => !o.ambassador_commission_paid).length },
    { key: 'paid', label: 'Paid', count: orders.filter(o => o.ambassador_commission_paid).length },
  ];

  return (
    <div data-testid="ambassador-orders-page">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black uppercase">Orders</h1>
          <p className="text-sm text-slate-600 mt-1">All paid orders that used your code.</p>
        </div>
        <Button
          onClick={exportCSV}
          variant="outline"
          className="gap-2"
          disabled={filtered.length === 0}
          data-testid="amb-export-csv"
        >
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      {/* Summary tiles */}
      {earnings && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Total commission</p>
            <p className="text-2xl font-black">£{earnings.commission_earned.toFixed(2)}</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-widest text-emerald-700 font-bold mb-1">Paid to you</p>
            <p className="text-2xl font-black text-emerald-800">£{earnings.total_paid_out.toFixed(2)}</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-widest text-amber-700 font-bold mb-1">Outstanding</p>
            <p className="text-2xl font-black text-amber-800">£{earnings.pending_payout.toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* Filter tabs + search */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1" data-testid="status-filter">
          {filters.map(f => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatusFilter(f.key)}
              className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest transition-colors ${
                statusFilter === f.key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              data-testid={`filter-${f.key}`}
            >
              {f.label} <span className="text-slate-400 font-normal ml-1">{f.count}</span>
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by order #, name or email…"
            className="pl-9"
            data-testid="amb-orders-search"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>
      ) : (
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[880px]">
            <thead className="bg-slate-50 text-slate-600 uppercase text-xs">
              <tr>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Order</th>
                <th className="p-3 text-left">Date</th>
                <th className="p-3 text-left">Customer</th>
                <th className="p-3 text-left">Items</th>
                <th className="p-3 text-right">Net</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3 text-right">Commission</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(o => {
                const net = Number(o.subtotal || 0) - Number(o.discount || 0);
                const commission = net * (commissionRate / 100);
                const isPaid = !!o.ambassador_commission_paid;
                return (
                  <tr key={o.id} className={`hover:bg-slate-50 ${isPaid ? 'text-slate-500' : ''}`}>
                    <td className="p-3">
                      {isPaid ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold text-[10px] uppercase tracking-wider">
                          <CheckCircle2 className="h-3 w-3" /> Paid
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold text-[10px] uppercase tracking-wider">
                          <Clock className="h-3 w-3" /> Pending
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <Link to={`/ambassador/orders/${o.id}`} className="text-emerald-700 hover:underline font-mono text-xs font-bold" data-testid={`amb-order-${o.order_number}`}>
                        {o.order_number}
                      </Link>
                    </td>
                    <td className="p-3 text-xs">{new Date(o.created_at).toLocaleDateString('en-GB')}</td>
                    <td className="p-3">
                      <p className="font-semibold text-slate-900">{o.shipping_address?.first_name} {o.shipping_address?.last_name}</p>
                      <p className="text-xs text-slate-500 truncate max-w-[200px]">{o.shipping_address?.email}</p>
                    </td>
                    <td className="p-3 text-xs">{o.items?.length} item{o.items?.length !== 1 ? 's' : ''}</td>
                    <td className="p-3 text-right font-semibold">£{net.toFixed(2)}</td>
                    <td className="p-3 text-right">£{Number(o.total || 0).toFixed(2)}</td>
                    <td className={`p-3 text-right font-bold ${isPaid ? 'text-emerald-700' : 'text-amber-700'}`}>£{commission.toFixed(2)}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center text-slate-500">
                  {orders.length === 0
                    ? 'No orders using your code yet. Start sharing!'
                    : statusFilter !== 'all'
                      ? `No ${statusFilter} orders match your filter.`
                      : 'No orders match your search.'}
                </td></tr>
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="bg-slate-50 font-bold">
                <tr>
                  <td className="p-3" colSpan={5}>{totals.count} order{totals.count !== 1 ? 's' : ''}</td>
                  <td className="p-3 text-right">£{totals.netSales.toFixed(2)}</td>
                  <td className="p-3 text-right">£{totals.gross.toFixed(2)}</td>
                  <td className="p-3 text-right text-emerald-700">£{totals.commission.toFixed(2)}</td>
                </tr>
                {statusFilter === 'all' && (totals.paid > 0 || totals.pending > 0) && (
                  <tr className="text-[11px]">
                    <td className="p-3 text-slate-500 font-normal" colSpan={7}>
                      of which: <strong className="text-emerald-700">£{totals.paid.toFixed(2)} paid</strong> · <strong className="text-amber-700">£{totals.pending.toFixed(2)} outstanding</strong>
                    </td>
                    <td className="p-3"></td>
                  </tr>
                )}
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
};

export default AmbassadorOrders;
