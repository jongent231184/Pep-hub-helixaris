import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Ambassadors } from '../../lib/api';
import { Loader2, ArrowLeft } from 'lucide-react';
import { resolveImage } from '../../lib/api';

const statusColor = (s) => ({
  pending: 'bg-amber-100 text-amber-800',
  paid: 'bg-emerald-100 text-emerald-800',
  processing: 'bg-sky-100 text-sky-800',
  shipped: 'bg-indigo-100 text-indigo-800',
  delivered: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-800',
  refunded: 'bg-slate-100 text-slate-800',
}[s] || 'bg-slate-100 text-slate-800');

const AddressBlock = ({ label, addr }) => {
  if (!addr) return null;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">{label}</p>
      <div className="text-sm text-slate-700 space-y-0.5">
        <p className="font-semibold">{addr.first_name} {addr.last_name}</p>
        <p>{addr.email}</p>
        {addr.phone && <p>{addr.phone}</p>}
        <p>{addr.address1}</p>
        {addr.address2 && <p>{addr.address2}</p>}
        <p>{addr.city}, {addr.postcode}</p>
        <p>{addr.country}</p>
      </div>
    </div>
  );
};

const AmbassadorOrderDetail = () => {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    Promise.all([Ambassadors.me(), Ambassadors.order(orderId)])
      .then(([m, o]) => { setMe(m); setOrder(o); })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [orderId]);

  if (loading) {
    return <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>;
  }

  if (notFound || !order) {
    return (
      <div className="max-w-md">
        <Link to="/ambassador/orders" className="text-sm text-emerald-700 hover:underline inline-flex items-center gap-1 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to orders
        </Link>
        <p className="text-slate-700">Order not found or it doesn&apos;t belong to your code.</p>
      </div>
    );
  }

  const commissionRate = me?.user?.commission_rate || 15;
  const net = Number(order.subtotal || 0) - Number(order.discount || 0);
  const commission = net * (commissionRate / 100);

  return (
    <div className="max-w-4xl" data-testid="ambassador-order-detail">
      <Link to="/ambassador/orders" className="text-sm text-emerald-700 hover:underline inline-flex items-center gap-1 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to orders
      </Link>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500 font-bold">Order</p>
          <h1 className="text-3xl font-black uppercase font-mono">{order.order_number}</h1>
          <p className="text-sm text-slate-600 mt-1">{new Date(order.created_at).toLocaleString('en-GB')}</p>
        </div>
        <div className="flex gap-2">
          <span className={`px-3 py-1.5 rounded text-xs font-semibold uppercase ${statusColor(order.payment_status)}`}>
            {order.payment_status}
          </span>
          <span className={`px-3 py-1.5 rounded text-xs font-semibold uppercase ${statusColor(order.status)}`}>
            {order.status}
          </span>
        </div>
      </div>

      {/* Commission summary highlight */}
      <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-6 mb-8">
        <p className="text-[10px] uppercase tracking-widest text-emerald-700 font-bold mb-1">Your commission on this order</p>
        <p className="text-4xl font-black text-emerald-900" data-testid="order-commission">£{commission.toFixed(2)}</p>
        <p className="text-xs text-emerald-800 mt-2">
          {commissionRate}% of net sales (£{net.toFixed(2)} = subtotal £{Number(order.subtotal).toFixed(2)}{Number(order.discount) > 0 ? ` − discount £${Number(order.discount).toFixed(2)}` : ''})
        </p>
      </div>

      {/* Items */}
      <div className="bg-white border rounded-lg overflow-hidden mb-8">
        <div className="bg-slate-50 px-4 py-3 border-b">
          <h2 className="text-xs uppercase tracking-widest font-bold text-slate-600">Items</h2>
        </div>
        <ul className="divide-y">
          {(order.items || []).map((it, i) => (
            <li key={i} className="flex items-center gap-4 p-4">
              {it.image && (
                <img src={resolveImage(it.image)} alt={it.name} className="h-14 w-14 rounded object-cover border" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900">{it.name}</p>
                {it.option && <p className="text-xs text-slate-500">{it.option}</p>}
              </div>
              <p className="text-sm text-slate-600">× {it.qty}</p>
              <p className="text-sm font-bold w-20 text-right">£{(Number(it.price) * Number(it.qty)).toFixed(2)}</p>
            </li>
          ))}
        </ul>
        <div className="bg-slate-50 px-4 py-4 border-t space-y-1 text-sm">
          <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>£{Number(order.subtotal).toFixed(2)}</span></div>
          {Number(order.discount) > 0 && (
            <div className="flex justify-between text-emerald-700"><span>Discount ({order.promo_code})</span><span>−£{Number(order.discount).toFixed(2)}</span></div>
          )}
          <div className="flex justify-between text-slate-600"><span>Shipping</span><span>£{Number(order.shipping).toFixed(2)}</span></div>
          <div className="flex justify-between font-black text-slate-900 text-base pt-2 border-t">
            <span>Total</span><span>£{Number(order.total).toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Addresses */}
      <div className="grid md:grid-cols-2 gap-6 bg-white border rounded-lg p-6">
        <AddressBlock label="Shipping to" addr={order.shipping_address} />
        {order.billing_address && (
          <AddressBlock label="Billed to" addr={order.billing_address} />
        )}
      </div>
    </div>
  );
};

export default AmbassadorOrderDetail;
