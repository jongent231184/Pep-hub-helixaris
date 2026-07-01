import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import Breadcrumbs from '../components/Breadcrumbs';
import { Button } from '../components/ui/button';
import { useAuth } from '../context/AuthContext';
import { LogOut, ShoppingBag, Loader2 } from 'lucide-react';
import { Orders } from '../lib/api';
import ChangePasswordCard from '../components/ChangePasswordCard';

const Account = () => {
  const { user, logout, loading } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Orders.mine().then(setOrders).catch(() => setOrders([])).finally(() => setOrdersLoading(false));
  }, [user]);

  if (loading) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-20 grid place-items-center"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>
      </Layout>
    );
  }

  if (!user) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <h1 className="text-2xl font-bold mb-4">Please log in</h1>
          <Link to="/login" className="text-sky-600">Go to login</Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-10">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'My Account' }]} />
        <div className="flex items-center justify-between mt-6 mb-8">
          <h1 className="text-3xl md:text-4xl font-black uppercase">My Account</h1>
          <Button onClick={() => { logout(); navigate('/'); }} variant="outline" className="gap-2">
            <LogOut className="h-4 w-4" /> Log out
          </Button>
        </div>
        <p className="text-slate-700 mb-6">Welcome, <span className="font-bold">{user.first_name || user.email}</span></p>
        {user.role === 'admin' && (
          <Link to="/admin" className="inline-block mb-6 bg-slate-900 text-white px-5 py-2.5 rounded uppercase font-bold text-sm tracking-wider hover:bg-slate-800">Go to Admin Dashboard</Link>
        )}

        <h2 className="text-xl font-bold uppercase mb-4 flex items-center gap-2"><ShoppingBag className="h-5 w-5" /> My Orders</h2>
        {ordersLoading ? (
          <div className="py-8 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-sky-500" /></div>
        ) : orders.length === 0 ? (
          <div className="border rounded-lg p-8 text-center text-slate-500">No orders yet.</div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 uppercase text-xs">
                <tr><th className="p-3 text-left">Order</th><th className="p-3 text-left">Date</th><th className="p-3 text-left">Total</th><th className="p-3 text-left">Payment</th><th className="p-3 text-left">Status</th></tr>
              </thead>
              <tbody className="divide-y">
                {orders.map(o => (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono">{o.order_number}</td>
                    <td className="p-3">{new Date(o.created_at).toLocaleDateString()}</td>
                    <td className="p-3 font-bold">£{Number(o.total).toFixed(2)}</td>
                    <td className="p-3 capitalize">{o.payment_status}</td>
                    <td className="p-3 capitalize">{o.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-10 border-t pt-6">
          <ChangePasswordCard />
        </div>
      </div>
    </Layout>
  );
};

export default Account;
