import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ambassadors } from '../../lib/api';
import { Loader2, Download, Search } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';

const AmbassadorOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    Promise.all([Ambassadors.me(), Ambassadors.orders()])
      .then(([m, o]) => { setMe(m); setOrders(o); })
      .catch(() => { setMe(null); setOrders([]); })
      .finally(() => setLoading(false));
  }, []);

  const commissionRate = me?.user?.commission_rate || 15;

  const filtered = useMemo(() => {
    if (!query) return orders;
    const q = query.toLowerCase();
    return orders.filter(o =>
      (o.order_number || '').toLowerCase().includes(q) ||
      (o.shipping_address?.email || '').toLowerCase().includes(q) ||
      `${o.shipping_address?.first_name || ''} ${o.shipping_address?.last_name || ''}`.toLowerCase().includes(q)
    );
  }, [orders, query]);

  const exportCSV = () => {
    const rows = [
      ['Order #', 'Date', 'Customer', 'Email', 'Items', 'Subtotal', 'Discount', 'Net Sales', 'Shipping', 'Total', 'Your Commission'],
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

      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by order #, name or email…"
          className="pl-9"
          data-testid="amb-orders-search"
        />
      </div>

      {loading ? (
        <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>
      ) : (
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-slate-50 text-slate-600 uppercase text-xs">
              <tr>
                <th className="p-3 text-left">Order</th>
                <th className="p-3 text-left">Date</th>
                <th className="p-3 text-left">Customer</th>
                <th className="p-3 text-left">Items</th>
                <th className="p-3 text-right">Net</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3 text-right">Your Commission</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(o => {
                const net = Number(o.subtotal || 0) - Number(o.discount || 0);
                const commission = net * (commissionRate / 100);
                return (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="p-3">
                      <Link to={`/ambassador/orders/${o.id}`} className="text-emerald-700 hover:underline font-mono text-xs font-bold" data-testid={`amb-order-${o.order_number}`}>
                        {o.order_number}
                      </Link>
                    </td>
                    <td className="p-3 text-xs">{new Date(o.created_at).toLocaleDateString('en-GB')}</td>
                    <td className="p-3">
                      <p className="font-semibold">{o.shipping_address?.first_name} {o.shipping_address?.last_name}</p>
                      <p className="text-xs text-slate-500 truncate max-w-[200px]">{o.shipping_address?.email}</p>
                    </td>
                    <td className="p-3 text-xs">{o.items?.length} item{o.items?.length !== 1 ? 's' : ''}</td>
                    <td className="p-3 text-right font-semibold">£{net.toFixed(2)}</td>
                    <td className="p-3 text-right">£{Number(o.total || 0).toFixed(2)}</td>
                    <td className="p-3 text-right font-bold text-emerald-700">£{commission.toFixed(2)}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-slate-500">
                  {orders.length === 0 ? 'No orders using your code yet. Start sharing!' : 'No orders match your search.'}
                </td></tr>
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="bg-slate-50 font-bold">
                <tr>
                  <td className="p-3" colSpan={4}>{filtered.length} order{filtered.length !== 1 ? 's' : ''}</td>
                  <td className="p-3 text-right">£{filtered.reduce((s, o) => s + (Number(o.subtotal || 0) - Number(o.discount || 0)), 0).toFixed(2)}</td>
                  <td className="p-3 text-right">£{filtered.reduce((s, o) => s + Number(o.total || 0), 0).toFixed(2)}</td>
                  <td className="p-3 text-right text-emerald-700">
                    £{filtered.reduce((s, o) => s + ((Number(o.subtotal || 0) - Number(o.discount || 0)) * (commissionRate / 100)), 0).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
};

export default AmbassadorOrders;
