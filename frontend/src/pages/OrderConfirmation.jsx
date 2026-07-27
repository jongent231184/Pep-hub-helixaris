import React, { useEffect, useState, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { CheckCircle2, Loader2, Clock } from 'lucide-react';
import { Orders, Wallid } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import PaymentSuccessSplash from '../components/PaymentSuccessSplash';
import GuestAccountPrompt from '../components/GuestAccountPrompt';

const PENDING_ORDER_STORAGE_KEY = 'ghp_pending_wallid_order';

const OrderConfirmation = () => {
  const { orderId } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { clearCart } = useCart();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const pollRef = useRef(null);

  const cameFromWallid = searchParams.get('wallid') === '1';

  const applyOrder = (o) => {
    setOrder(o);
    if (o?.payment_status === 'paid') {
      // Payment confirmed — safe to clear the cart and the pending-order
      // stash. The cart is intentionally preserved until this moment so that
      // failed payments can be retried without the customer losing items.
      try {
        clearCart();
        localStorage.removeItem(PENDING_ORDER_STORAGE_KEY);
      } catch (_) { /* ignore */ }
      const key = `ghp_splash_${o.id}`;
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        setShowSplash(true);
      }
    }
  };

  useEffect(() => {
    Orders.get(orderId)
      .then(applyOrder)
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [orderId]);

  // Self-healing: if the customer came back from Wallid but the webhook
  // hasn't marked the order paid yet (or the webhook isn't configured),
  // poll /api/wallid/verify-status every 4s for up to 30s.
  useEffect(() => {
    if (!order || !cameFromWallid) return;
    if (order.payment_status === 'paid') return;
    if (!order.wallid_api_payment_id) return; // safety: only Wallid orders

    setVerifying(true);
    let attempts = 0;
    const MAX = 8; // ~32s

    const tick = async () => {
      attempts += 1;
      try {
        const res = await Wallid.verifyStatus(order.id);
        if (res.payment_status === 'paid') {
          const fresh = await Orders.get(order.id);
          applyOrder(fresh);
          setVerifying(false);
          if (pollRef.current) clearInterval(pollRef.current);
          return;
        }
        if (['FAILED', 'EXPIRED'].includes((res.wallid_status || '').toUpperCase()) || attempts >= MAX) {
          setVerifying(false);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch (_) {
        if (attempts >= MAX) {
          setVerifying(false);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }
    };

    tick();
    pollRef.current = setInterval(tick, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [order?.id, cameFromWallid]);

  if (loading) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-20 grid place-items-center">
          <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
        </div>
      </Layout>
    );
  }

  if (!order) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <h1 className="text-2xl font-bold">Order not found</h1>
          <Link to="/" className="text-sky-600 mt-4 inline-block">Continue shopping</Link>
        </div>
      </Layout>
    );
  }

  const paid = order.payment_status === 'paid';
  const Icon = paid ? CheckCircle2 : Clock;
  const color = paid ? 'emerald' : 'amber';

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className={`h-20 w-20 mx-auto rounded-full bg-${color}-100 grid place-items-center text-${color}-600`}>
          <Icon className="h-12 w-12" />
        </div>
        <h1 className="text-3xl md:text-4xl font-black uppercase mt-6">
          {paid ? 'Thank you for your order!' : 'Order received'}
        </h1>
        <p className="text-slate-600 mt-3">Order reference: <span className="font-bold text-slate-900">{order.order_number}</span></p>
        <p className="text-slate-600 mt-1">Status: <span className="font-semibold capitalize">{order.status}</span> · Payment: <span className="font-semibold capitalize">{order.payment_status}</span></p>
        <p className="mt-2 text-lg font-bold">Total: £{Number(order.total).toFixed(2)}</p>
        <p className="text-sm text-slate-500 mt-1">A confirmation has been sent to {order.shipping_address?.email}</p>
        {verifying && !paid && (
          <div className="mt-4 inline-flex items-center gap-2 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-full px-4 py-2" data-testid="wallid-verifying">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
            Verifying your payment with your bank…
          </div>
        )}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link to={`/admin/orders/${order.id}/invoice`} target="_blank" className="inline-block border border-slate-300 hover:bg-slate-50 text-slate-800 px-6 py-3 rounded font-bold uppercase tracking-wider text-sm">
            View / Print Invoice
          </Link>
          <Link to="/" className="inline-block bg-sky-500 hover:bg-sky-600 text-white px-7 py-3 rounded font-bold uppercase tracking-wider text-sm">
            Continue Shopping
          </Link>
        </div>
        {!user && paid && <GuestAccountPrompt order={order} />}
      </div>
      {showSplash && (
        <PaymentSuccessSplash
          orderNumber={order.order_number}
          onDismiss={() => setShowSplash(false)}
        />
      )}
    </Layout>
  );
};

export default OrderConfirmation;
