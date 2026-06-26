import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { CheckCircle2, Loader2, Clock } from 'lucide-react';
import { Orders } from '../lib/api';

const OrderConfirmation = () => {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Orders.get(orderId).then(setOrder).catch(() => setOrder(null)).finally(() => setLoading(false));
  }, [orderId]);

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
        <div className="mt-10">
          <Link to="/" className="inline-block bg-sky-500 hover:bg-sky-600 text-white px-7 py-3 rounded font-bold uppercase tracking-wider text-sm">
            Continue Shopping
          </Link>
        </div>
      </div>
    </Layout>
  );
};

export default OrderConfirmation;
