import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Orders, resolveImage } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { ArrowLeft, Loader2, FileText, Trash2 } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';

const STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
const PAY_STATUSES = ['pending', 'paid', 'failed', 'refunded'];

const AdminOrderDetail = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [notes, setNotes] = useState('');
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    Orders.get(orderId).then((o) => {
      setOrder(o);
      setStatus(o.status);
      setPaymentStatus(o.payment_status);
      setNotes(o.notes || '');
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(load, [orderId]);

  const save = async () => {
    setSaving(true);
    try {
      await Orders.patch(order.id, { status, payment_status: paymentStatus, notes });
      toast({ title: 'Order updated' });
      load();
    } catch (e) {
      toast({ title: 'Update failed', description: String(e.response?.data?.detail || e.message), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  if (loading) return <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>;
  if (!order) return <p>Order not found.</p>;

  const a = order.shipping_address || {};

  return (
    <div className="max-w-5xl">
      <Link to="/admin/orders" className="text-sm text-sky-600 hover:underline flex items-center gap-1 mb-3"><ArrowLeft className="h-3.5 w-3.5" /> Back to orders</Link>
      <div className="flex items-baseline justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-black uppercase">Order <span className="font-mono text-sky-600">{order.order_number}</span></h1>
          <p className="text-sm text-slate-500">Placed {new Date(order.created_at).toLocaleString()}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Link to={`/admin/orders/${order.id}/invoice`}>
            <Button variant="outline" className="gap-2"><FileText className="h-4 w-4" /> View invoice</Button>
          </Link>
          <Button
            variant="outline"
            className="gap-2 text-red-600 hover:bg-red-50 border-red-200"
            onClick={async () => {
              if (!window.confirm(`Delete order ${order.order_number}? This cannot be undone.`)) return;
              try {
                await Orders.remove(order.id);
                toast({ title: 'Order deleted' });
                navigate('/admin/orders');
              } catch (e) {
                toast({ title: 'Delete failed', description: String(e.response?.data?.detail || e.message), variant: 'destructive' });
              }
            }}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
          <p className="text-3xl font-black">£{Number(order.total).toFixed(2)}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Items */}
        <div className="lg:col-span-2 bg-white border rounded-lg p-5">
          <h2 className="font-bold uppercase text-sm tracking-wide mb-4">Items</h2>
          <ul className="divide-y">
            {order.items.map((it, idx) => (
              <li key={idx} className="py-3 flex gap-3">
                {it.image && <img src={resolveImage(it.image)} alt={it.name} className="w-16 h-16 object-contain bg-slate-50 rounded border" />}
                <div className="flex-1">
                  <p className="font-semibold">{it.name}</p>
                  {it.option && <p className="text-xs text-slate-500">{it.option}</p>}
                  <p className="text-xs text-slate-500">Qty: {it.qty} · £{Number(it.price).toFixed(2)} each</p>
                </div>
                <p className="font-bold">£{(it.price * it.qty).toFixed(2)}</p>
              </li>
            ))}
          </ul>
          <div className="border-t mt-4 pt-4 text-sm space-y-1">
            <div className="flex justify-between"><span>Subtotal</span><span>£{Number(order.subtotal).toFixed(2)}</span></div>
            <div className="flex justify-between"><span>Shipping</span><span>{order.shipping === 0 ? 'FREE' : `£${Number(order.shipping).toFixed(2)}`}</span></div>
            <div className="flex justify-between font-bold text-base pt-2 border-t"><span>Total</span><span>£{Number(order.total).toFixed(2)}</span></div>
          </div>
        </div>

        {/* Customer + status */}
        <div className="space-y-4">
          <div className="bg-white border rounded-lg p-5">
            <h2 className="font-bold uppercase text-sm tracking-wide mb-3">Customer</h2>
            <p className="font-semibold">{a.first_name} {a.last_name}</p>
            <p className="text-sm text-slate-600">{a.email}</p>
            <p className="text-sm text-slate-600">{a.phone}</p>
            <div className="mt-3 pt-3 border-t text-sm text-slate-700">
              <p>{a.address1}</p>
              {a.address2 && <p>{a.address2}</p>}
              <p>{a.city}, {a.postcode}</p>
              <p>{a.country}</p>
            </div>
          </div>

          <div className="bg-white border rounded-lg p-5 space-y-4">
            <h2 className="font-bold uppercase text-sm tracking-wide">Status</h2>
            <div>
              <Label className="text-xs">Payment status</Label>
              <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAY_STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Fulfilment status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="mt-1" />
            </div>
            <Button onClick={save} disabled={saving} className="w-full bg-sky-500 hover:bg-sky-600 text-white">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save changes'}
            </Button>
          </div>

          {order.payment_id && (
            <div className="bg-white border rounded-lg p-5 text-xs text-slate-600 space-y-1">
              <p className="font-bold uppercase tracking-wide text-slate-700">Payment</p>
              <p>Provider: {order.payment_provider}</p>
              <p className="font-mono break-all">ID: {order.payment_id}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminOrderDetail;
