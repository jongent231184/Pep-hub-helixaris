import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Orders, Wallid, Square, Blocklist } from '../../lib/api';
import { Loader2, Download, Trash2, Link as LinkIcon, RefreshCw, CreditCard, FileText, ShieldBan, Send } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { useToast } from '../../hooks/use-toast';
import CreatePaylinkModal from './CreatePaylinkModal';
import PaymentSourceBadge from '../../components/PaymentSourceBadge';
import CustomerBlocklist from './CustomerBlocklist';

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
  const [syncing, setSyncing] = useState(false);
  const [syncingSquare, setSyncingSquare] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [tab, setTab] = useState('orders');
  const [blockedIds, setBlockedIds] = useState(new Set());
  const [blockingId, setBlockingId] = useState(null);
  const [resendingId, setResendingId] = useState(null);
  const [bulkSending, setBulkSending] = useState(false);
  const { toast } = useToast();

  const loadBlocked = () => Blocklist.matchingOrders().then(r => setBlockedIds(new Set(r.order_ids || []))).catch(() => {});
  const load = () => {
    loadBlocked();
    return Orders.all().then(setOrders).catch(() => setOrders([])).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleBlock = async (order) => {
    const name = `${order.shipping_address?.first_name || ''} ${order.shipping_address?.last_name || ''}`.trim();
    const reason = window.prompt(`Block ${name} (${order.shipping_address?.email}) from ordering again?\n\nReason (internal, optional):`, '');
    if (reason === null) return;
    setBlockingId(order.id);
    try {
      await Blocklist.fromOrder(order.id, reason);
      toast({ title: 'Customer blocked', description: `${name} — name, email and address from ${order.order_number} added to the blocklist.` });
      loadBlocked();
    } catch (e) {
      toast({ title: 'Block failed', description: String(e.response?.data?.detail || e.message), variant: 'destructive' });
    } finally {
      setBlockingId(null);
    }
  };

  const handleSyncFromWallid = async () => {
    setSyncing(true);
    try {
      const res = await Wallid.syncPending();
      const changesText = (res.changes || [])
        .map(c => `${c.order_number}: ${c.from} → ${c.to}`)
        .join(', ');
      toast({
        title: `Checked ${res.checked} pending order${res.checked !== 1 ? 's' : ''}`,
        description: res.updated
          ? `${res.now_paid} newly paid · ${res.updated} updated${changesText ? ` (${changesText})` : ''}`
          : res.checked === 0
            ? 'No pending Wallid orders to sync.'
            : 'No changes — all pending orders are still awaiting payment.',
      });
      if (res.updated > 0) load();
    } catch (e) {
      toast({
        title: 'Sync failed',
        description: String(e.response?.data?.detail || e.message),
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncFromSquare = async () => {
    setSyncingSquare(true);
    try {
      const res = await Square.syncPending();
      const changesText = (res.changes || [])
        .map(c => `${c.order_number}: ${c.from} → ${c.to}`)
        .join(', ');
      toast({
        title: `Checked ${res.checked} pending Square order${res.checked !== 1 ? 's' : ''}`,
        description: res.updated
          ? `${res.now_paid} newly paid · ${res.updated} updated${changesText ? ` (${changesText})` : ''}`
          : res.checked === 0
            ? 'No pending Square orders to sync.'
            : 'No changes — all pending orders are still awaiting payment.',
      });
      if (res.updated > 0) load();
    } catch (e) {
      toast({
        title: 'Sync failed',
        description: String(e.response?.data?.detail || e.message),
        variant: 'destructive',
      });
    } finally {
      setSyncingSquare(false);
    }
  };

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

  const handleDownloadInvoice = async (order) => {
    setDownloadingId(order.id);
    try {
      const blob = await Orders.downloadInvoicePdf(order.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Invoice-${order.order_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast({ title: 'Invoice download failed', description: String(e.response?.data?.detail || e.message), variant: 'destructive' });
    } finally {
      setDownloadingId(null);
    }
  };

  const filtered = orders.filter(o => {
    if (!query) return true;
    const q = query.toLowerCase();
    return o.order_number.toLowerCase().includes(q) ||
      o.shipping_address?.email?.toLowerCase().includes(q) ||
      `${o.shipping_address?.first_name} ${o.shipping_address?.last_name}`.toLowerCase().includes(q);
  });

  const hasEmail = (o) => o.shipping_address?.email && o.shipping_address.email !== 'pending@ghp-health.com';
  const unpaidWithEmail = filtered.filter(o => o.payment_status !== 'paid' && hasEmail(o));

  const handleResendInvoice = async (order) => {
    setResendingId(order.id);
    try {
      const r = await Orders.resendInvoice(order.id);
      toast({
        title: 'Invoice emailed',
        description: r.mode === 'bank_transfer'
          ? `${order.order_number} sent to ${r.sent_to} with bank-transfer details.`
          : `${order.order_number} sent to ${r.sent_to}.`,
      });
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, invoice_resent_at: new Date().toISOString() } : o));
    } catch (e) {
      toast({ title: 'Could not send', description: String(e.response?.data?.detail || e.message), variant: 'destructive' });
    } finally {
      setResendingId(null);
    }
  };

  const handleResendAllUnpaid = async () => {
    const n = unpaidWithEmail.length;
    if (!n) return;
    if (!window.confirm(`Email a fresh invoice to ${n} unpaid order${n === 1 ? '' : 's'}? Unpaid orders will include your bank-transfer details as a new payment option.`)) return;
    setBulkSending(true);
    try {
      const r = await Orders.resendInvoices(unpaidWithEmail.map(o => o.id));
      toast({
        title: `${r.sent.length} invoice${r.sent.length === 1 ? '' : 's'} emailed`,
        description: r.failed.length ? `${r.failed.length} failed: ${r.failed.map(f => f.error).slice(0, 2).join('; ')}` : 'All sent successfully.',
        variant: r.failed.length ? 'destructive' : undefined,
      });
      load();
    } catch (e) {
      toast({ title: 'Bulk send failed', description: String(e.response?.data?.detail || e.message), variant: 'destructive' });
    } finally {
      setBulkSending(false);
    }
  };

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
        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={handleSyncFromWallid}
            disabled={syncing}
            variant="outline"
            className="gap-2"
            data-testid="sync-all-wallid-btn"
            title="Poll Wallid for every pending order and update their payment status"
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sync from Wallid
          </Button>
          <Button
            onClick={handleSyncFromSquare}
            disabled={syncingSquare}
            variant="outline"
            className="gap-2"
            data-testid="sync-all-square-btn"
            title="Poll Square for every pending card / Apple-Pay / Google-Pay order and update its payment status"
          >
            {syncingSquare ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            Sync from Square
          </Button>
          <Button
            onClick={() => setPaylinkOpen(true)}
            className="bg-sky-500 hover:bg-sky-600 text-white gap-2"
            data-testid="create-paylink-btn"
          >
            <LinkIcon className="h-4 w-4" /> Create pay link
          </Button>
          <Button onClick={exportCSV} variant="outline" className="gap-2"><Download className="h-4 w-4" /> Export CSV</Button>
          {tab === 'orders' && unpaidWithEmail.length > 0 && (
            <Button
              onClick={handleResendAllUnpaid}
              disabled={bulkSending}
              variant="outline"
              className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              data-testid="resend-all-unpaid-btn"
              title="Email every unpaid order a fresh invoice with your bank-transfer details"
            >
              {bulkSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Email invoices to unpaid ({unpaidWithEmail.length})
            </Button>
          )}
        </div>
      </div>
      <CreatePaylinkModal
        open={paylinkOpen}
        onClose={() => setPaylinkOpen(false)}
        onCreated={() => load()}
      />
      <div className="flex gap-1 border-b mb-4" data-testid="orders-tabs">
        <button
          type="button"
          onClick={() => setTab('orders')}
          data-testid="orders-tab-list"
          className={`px-4 py-2 text-sm font-semibold uppercase tracking-wide border-b-2 -mb-px transition-colors ${tab === 'orders' ? 'border-sky-500 text-sky-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          Orders
        </button>
        <button
          type="button"
          onClick={() => setTab('blocklist')}
          data-testid="orders-tab-blocklist"
          className={`px-4 py-2 text-sm font-semibold uppercase tracking-wide border-b-2 -mb-px transition-colors flex items-center gap-2 ${tab === 'blocklist' ? 'border-red-500 text-red-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          <ShieldBan className="h-4 w-4" /> Blocked customers
        </button>
      </div>

      {tab === 'blocklist' && <CustomerBlocklist onChange={loadBlocked} />}

      {tab === 'orders' && (
        <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by order #, name or email…" className="max-w-md mb-4" />
      )}

      {tab !== 'orders' ? null : loading ? (
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
                    <p className="font-semibold flex items-center gap-2">
                      {o.shipping_address?.first_name} {o.shipping_address?.last_name}
                      {blockedIds.has(o.id) && (
                        <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-800 text-[10px] font-bold uppercase" data-testid={`blocked-badge-${o.order_number}`}>Blocked</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">{o.shipping_address?.email}</p>
                    {o.invoice_resent_at && (
                      <p className="text-[10px] text-emerald-700" data-testid={`invoice-resent-${o.order_number}`}>Invoice emailed {new Date(o.invoice_resent_at).toLocaleDateString()}</p>
                    )}
                  </td>
                  <td className="p-3 text-xs">{o.items?.length} item{o.items?.length !== 1 ? 's' : ''}</td>
                  <td className="p-3 font-bold">£{Number(o.total).toFixed(2)}</td>
                  <td className="p-3">
                    <div className="flex flex-col items-start gap-1">
                      <span className={`px-2 py-1 rounded text-xs font-semibold uppercase ${statusColor(o.payment_status)}`}>{o.payment_status}</span>
                      {o.payment_status === 'paid' && <PaymentSourceBadge source={o.payment_source} />}
                      {o.payment_status !== 'paid' && o.payment_provider === 'bank_transfer' && (
                        <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 text-[10px] font-bold uppercase" data-testid={`bank-transfer-badge-${o.order_number}`}>Awaiting transfer</span>
                      )}
                    </div>
                  </td>
                  <td className="p-3"><span className={`px-2 py-1 rounded text-xs font-semibold uppercase ${statusColor(o.status)}`}>{o.status}</span></td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDownloadInvoice(o)}
                        disabled={downloadingId === o.id}
                        title={`Download invoice PDF for ${o.order_number}`}
                        data-testid={`download-invoice-${o.order_number}`}
                        className="text-sky-600 hover:text-sky-700 hover:bg-sky-50 h-8 w-8"
                      >
                        {downloadingId === o.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <FileText className="h-4 w-4" />}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleResendInvoice(o)}
                        disabled={resendingId === o.id || !hasEmail(o)}
                        title={o.payment_status !== 'paid' ? 'Email invoice with bank-transfer details' : 'Email a copy of the invoice'}
                        data-testid={`resend-invoice-${o.order_number}`}
                        className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 h-8 w-8"
                      >
                        {resendingId === o.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Send className="h-4 w-4" />}
                      </Button>
                      {!blockedIds.has(o.id) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleBlock(o)}
                          disabled={blockingId === o.id}
                          title={`Block this customer from ordering again`}
                          data-testid={`block-customer-${o.order_number}`}
                          className="text-slate-500 hover:text-red-700 hover:bg-red-50 h-8 w-8"
                        >
                          {blockingId === o.id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <ShieldBan className="h-4 w-4" />}
                        </Button>
                      )}
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
                    </div>
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
