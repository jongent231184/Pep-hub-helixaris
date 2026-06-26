import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Admin, resolveImage } from '../../lib/api';
import {
  PoundSterling, ShoppingBag, Package, Users, Loader2, TrendingUp
} from 'lucide-react';

const Stat = ({ icon: Icon, label, value, accent = 'sky' }) => (
  <div className="bg-white rounded-lg border p-5 flex items-center gap-4">
    <div className={`h-12 w-12 rounded-full bg-${accent}-50 grid place-items-center text-${accent}-600`}>
      <Icon className="h-6 w-6" />
    </div>
    <div>
      <p className="text-xs uppercase tracking-widest text-slate-500">{label}</p>
      <p className="text-2xl font-black mt-0.5">{value}</p>
    </div>
  </div>
);

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Admin.stats().then(setStats).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>;
  }

  if (!stats) return <p className="text-slate-500">Could not load stats.</p>;

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat icon={PoundSterling} label="Revenue today" value={`£${stats.revenue_today.toFixed(2)}`} accent="emerald" />
        <Stat icon={TrendingUp} label="Revenue 7 days" value={`£${stats.revenue_week.toFixed(2)}`} accent="sky" />
        <Stat icon={TrendingUp} label="Revenue 30 days" value={`£${stats.revenue_month.toFixed(2)}`} accent="indigo" />
        <Stat icon={ShoppingBag} label="Total orders" value={stats.orders_total} accent="amber" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <Stat icon={ShoppingBag} label="Pending payments" value={stats.orders_pending} accent="amber" />
        <Stat icon={Package} label="Total products" value={stats.products_total} accent="slate" />
        <Stat icon={Users} label="Customers" value={stats.customers_total} accent="sky" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        {/* Recent orders */}
        <div className="bg-white border rounded-lg p-5">
          <h2 className="text-base font-bold uppercase tracking-wide mb-4">Recent Orders</h2>
          {stats.recent_orders.length === 0 ? (
            <p className="text-sm text-slate-500">No orders yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr><th className="text-left pb-2">Order</th><th className="text-left pb-2">Total</th><th className="text-left pb-2">Status</th></tr>
              </thead>
              <tbody className="divide-y">
                {stats.recent_orders.map(o => (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="py-2"><Link to={`/admin/orders/${o.id}`} className="text-sky-600 hover:underline font-mono text-xs">{o.order_number}</Link></td>
                    <td className="py-2 font-semibold">£{Number(o.total).toFixed(2)}</td>
                    <td className="py-2 capitalize text-xs">{o.payment_status} / {o.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Top products */}
        <div className="bg-white border rounded-lg p-5">
          <h2 className="text-base font-bold uppercase tracking-wide mb-4">Top Products</h2>
          {stats.top_products.length === 0 ? (
            <p className="text-sm text-slate-500">No sales yet.</p>
          ) : (
            <ul className="divide-y">
              {stats.top_products.map(tp => (
                <li key={tp.product_id} className="py-2 flex items-center gap-3">
                  {tp.image && <img src={resolveImage(tp.image)} alt="" className="w-10 h-10 object-contain bg-slate-50 rounded border" />}
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{tp.name}</p>
                    <p className="text-xs text-slate-500">Qty sold: {tp.qty}</p>
                  </div>
                  <p className="font-bold text-sm">£{Number(tp.revenue).toFixed(2)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
