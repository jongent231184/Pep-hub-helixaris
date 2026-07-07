import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Orders } from '../../lib/api';
import { Loader2, Download, Trash2, Link as LinkIcon } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { useToast } from '../../hooks/use-toast';
import CreatePaylinkModal from './CreatePaylinkModal';

const statusColor = (s) => ({
  pending: 'bg-amber-100 text-amber-800',
  paid: 'bg-emerald-100 text-emerald-800',
  processing: 'bg-sky-100 text-sky-800',
  shipped: 'bg-indigo-100 text-indigo-800',
  delivered: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-800',
  refunded: 'bg-slate-100 text-slate-800',
  failed: 'bg-red-100 text-red-800',
}[s] || 'bg-slate-100 text-slate-800');

const AdminOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [paylinkOpen, setPaylinkOpen] = useState(false);
  const { toast } = useToast();

  const load = () => Orders.all().then(setOrders).catch(() => setOrders([])).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const handleDelete = async (order) => {
    if (!window.confirm(`Delete order ${order.order_number}? This cannot be undone.`)) return;
    setDeletingId(order.id);
    try {
      await Orders.remove(order.id);
      setOrders(prev => prev.filter(o => o.id !== order.id));
      toast({ title: 'Order deleted', description: order.order_number });
    } catch (e) {
      toast({ title: 'Delete failed', description: String(e.response?.data?.detail || e.message), variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = orders.filter(o => {
    if (!query) return true;
    const q = query.toLowerCase();
    return o.order_number.toLowerCase().includes(q) ||
      o.shipping_address?.email?.toLowerCase().includes(q) ||
      `${o.shipping_address?.first_name} ${o.shipping_address?.last_name}`.toLowerCase().includes(q);
  });

  const exportCSV = () => {
    const rows = [
      ['Order', 'Date', 'Customer', 'Email', 'Total', 'Payment', 'Status'],
      ...filtered.map(o => [
        o.order_number,
        new Date(o.created_at).toISOString(),
        `${o.shipping_address?.first_name || ''} ${o.shipping_address?.last_name || ''}`.trim(),
        o.shipping_address?.email || '',
        Number(o.total).toFixed(2),
        o.payment_status,
        o.status,
      ])
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-black uppercase">Orders</h1>
        <div className="flex gap-2">
          <Button
            onClick={() => setPaylinkOpen(true)}
            className="bg-sky-500 hover:bg-sky-600 text-white gap-2"
            data-testid="create-paylink-btn"
          >
            <LinkIcon className="h-4 w-4" /> Create pay link
          </Button>
          <Button onClick={exportCSV} variant="outline" className="gap-2"><Download className="h-4 w-4" /> Export CSV</Button>
        </div>
      </div>
      <CreatePaylinkModal
        open={paylinkOpen}
        onClose={() => setPaylinkOpen(false)}
        onCreated={() => load()}
      />
      <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by order #, name or email…" className="max-w-md mb-4" />

      {loading ? (
        <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>
      ) : (
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-slate-50 text-slate-600 uppercase text-xs">
              <tr>
                <th className="p-3 text-left">Order</th>
                <th className="p-3 text-left">Date</th>
                <th className="p-3 text-left">Customer</th>
                <th className="p-3 text-left">Items</th>
                <th className="p-3 text-left">Total</th>
                <th className="p-3 text-left">Payment</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(o => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="p-3"><Link to={`/admin/orders/${o.id}`} className="text-sky-600 hover:underline font-mono text-xs">{o.order_number}</Link></td>
                  <td className="p-3 text-xs">{new Date(o.created_at).toLocaleString()}</td>
                  <td className="p-3">
                    <p className="font-semibold">{o.shipping_address?.first_name} {o.shipping_address?.last_name}</p>
                    <p className="text-xs text-slate-500">{o.shipping_address?.email}</p>
                  </td>
                  <td className="p-3 text-xs">{o.items?.length} item{o.items?.length !== 1 ? 's' : ''}</td>
                  <td className="p-3 font-bold">£{Number(o.total).toFixed(2)}</td>
                  <td className="p-3"><span className={`px-2 py-1 rounded text-xs font-semibold uppercase ${statusColor(o.payment_status)}`}>{o.payment_status}</span></td>
                  <td className="p-3"><span className={`px-2 py-1 rounded text-xs font-semibold uppercase ${statusColor(o.status)}`}>{o.status}</span></td>
                  <td className="p-3 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(o)}
                      disabled={deletingId === o.id}
                      title={`Delete order ${o.order_number}`}
                      data-testid={`delete-order-${o.order_number}`}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 w-8"
                    >
                      {deletingId === o.id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-slate-500">No orders found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminOrders;
