import React from 'react';
import { Link, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { CheckCircle2 } from 'lucide-react';

const OrderConfirmation = () => {
  const { orderId } = useParams();
  const data = (() => {
    try { return JSON.parse(sessionStorage.getItem('ghp_last_order') || '{}'); }
    catch { return {}; }
  })();

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="h-20 w-20 mx-auto rounded-full bg-emerald-100 grid place-items-center text-emerald-600">
          <CheckCircle2 className="h-12 w-12" />
        </div>
        <h1 className="text-3xl md:text-4xl font-black uppercase mt-6">Thank you for your order!</h1>
        <p className="text-slate-600 mt-3">Order reference: <span className="font-bold text-slate-900">{orderId}</span></p>
        {data.email && <p className="text-slate-600 mt-1">A confirmation has been sent to <span className="font-semibold">{data.email}</span></p>}
        {data.total != null && (
          <p className="mt-2 text-lg font-bold">Total paid: £{Number(data.total).toFixed(2)}</p>
        )}
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
