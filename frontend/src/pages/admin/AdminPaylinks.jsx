import React, { useEffect, useState } from 'react';
import { Orders } from '../../lib/api';
import { Loader2, Link as LinkIcon, Copy, Check, Trash2, Plus, Repeat } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { useToast } from '../../hooks/use-toast';
import CreatePaylinkModal from './CreatePaylinkModal';

const statusColor = (s) => ({
  paid: 'bg-emerald-100 text-emerald-800',
  pending: 'bg-amber-100 text-amber-800',
  failed: 'bg-red-100 text-red-800',
  refunded: 'bg-slate-200 text-slate-800',
}[s] || 'bg-slate-100 text-slate-800');

const AdminPaylinks = () => {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [initialData, setInitialData] = useState(null);

  const load = () => {
    setLoading(true);
    Orders.listPaylinks()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setInitialData(null); setModalOpen(true); };
  const openDuplicate = (o) => { setInitialData(o); setModalOpen(true); };

  const copyLink = async (o) => {
    const url = `${window.location.origin}/pay/${o.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(o.id);
      setTimeout(() => setCopiedId(null), 2000);
      toast({ title: 'Link copied', description: o.order_number });
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' });
    }
  };

  const handleDelete = async (o) => {
    if (!window.confirm(`Delete pay link ${o.order_number}? This cannot be undone.`)) return;
    setDeletingId(o.id);
    try {
      await Orders.remove(o.id);
      setItems(prev => prev.filter(x => x.id !== o.id));
      toast({ title: 'Pay link deleted', description: o.order_number });
    } catch (err) {
      toast({ title: 'Delete failed', description: String(err.response?.data?.detail || err.message), variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = items.filter(o => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      o.order_number.toLowerCase().includes(q) ||
      (o.shipping_address?.email || '').toLowerCase().includes(q) ||
      (`${o.shipping_address?.first_name || ''} ${o.shipping_address?.last_name || ''}`).toLowerCase().includes(q) ||
      o.items.some(i => i.name.toLowerCase().includes(q))
    );
  });

  const itemsSummary = (o) => {
    if (!o.items?.length) return '—';
    const first = o.items[0];
    const rest = o.items.length - 1;
    const base = `${first.qty}× ${first.name}${first.option ? ` (${first.option})` : ''}`;
    return rest > 0 ? `${base} +${rest} more` : base;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-black uppercase">Pay Links</h1>
        <Button
          onClick={openCreate}
          className="bg-sky-500 hover:bg-sky-600 text-white gap-2"
          data-testid="new-paylink-btn"
        >
          <Plus className="h-4 w-4" /> New pay link
        </Button>
      </div>

      <CreatePaylinkModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => load()}
        initialData={initialData}
      />

      <div className="mb-4">
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by order #, customer, item…"
          className="max-w-md"
        />
      </div>

      {loading ? (
        <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>
      ) : (
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-slate-50 text-slate-600 uppercase text-xs">
              <tr>
                <th className="p-3 text-left">Order</th>
                <th className="p-3 text-left">Date</th>
                <th className="p-3 text-left">Customer</th>
                <th className="p-3 text-left">Items</th>
                <th className="p-3 text-left">Total</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(o => {
                const email = o.shipping_address?.email;
                const custName = `${o.shipping_address?.first_name || ''} ${o.shipping_address?.last_name || ''}`.trim();
                const isPending = o.payment_status !== 'paid';
                return (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="p-3">
                      <a href={`/admin/orders/${o.id}`} className="text-sky-600 hover:underline font-mono text-xs">{o.order_number}</a>
                    </td>
                    <td className="p-3 text-xs">{new Date(o.created_at).toLocaleString()}</td>
                    <td className="p-3">
                      <p className="font-semibold text-slate-900">{custName || '—'}</p>
                      <p className="text-xs text-slate-500">{email && email !== 'pending@ghp-health.com' ? email : ''}</p>
                    </td>
                    <td className="p-3 text-xs text-slate-700 max-w-[280px] truncate">{itemsSummary(o)}</td>
                    <td className="p-3 font-bold">£{Number(o.total).toFixed(2)}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs font-semibold uppercase ${statusColor(o.payment_status)}`}>
                        {o.payment_status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-1">
                        {isPending && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => copyLink(o)}
                            className="gap-1 h-8 text-xs"
                            title="Copy customer pay link"
                            data-testid={`copy-paylink-${o.order_number}`}
                          >
                            {copiedId === o.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            {copiedId === o.id ? 'Copied' : 'Copy link'}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openDuplicate(o)}
                          className="gap-1 h-8 text-xs"
                          title="Reuse — creates a new pay link with the same items"
                          data-testid={`duplicate-paylink-${o.order_number}`}
                        >
                          <Repeat className="h-3.5 w-3.5" /> Duplicate
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(o)}
                          disabled={deletingId === o.id}
                          className="text-red-600 hover:bg-red-50 h-8 w-8 p-0"
                          data-testid={`delete-paylink-${o.order_number}`}
                        >
                          {deletingId === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-slate-500">
                    <LinkIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    No pay links yet. Click "New pay link" to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminPaylinks;
