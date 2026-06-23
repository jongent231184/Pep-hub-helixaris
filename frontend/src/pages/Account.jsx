import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import Breadcrumbs from '../components/Breadcrumbs';
import { Button } from '../components/ui/button';
import { useAuth } from '../context/AuthContext';
import { LogOut, ShoppingBag, MapPin } from 'lucide-react';

const Account = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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
        <p className="text-slate-700 mb-6">Welcome back, <span className="font-bold">{user.name}</span></p>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="border rounded-lg p-6">
            <ShoppingBag className="h-8 w-8 text-sky-600 mb-3" />
            <h3 className="font-bold uppercase tracking-wide text-sm mb-2">My Orders</h3>
            <p className="text-sm text-slate-600 mb-4">View your previous orders and reorder favourites.</p>
            <Link to="/orders" className="text-sky-600 font-semibold text-sm">View Orders →</Link>
          </div>
          <div className="border rounded-lg p-6">
            <MapPin className="h-8 w-8 text-sky-600 mb-3" />
            <h3 className="font-bold uppercase tracking-wide text-sm mb-2">Addresses</h3>
            <p className="text-sm text-slate-600 mb-4">Manage your saved shipping addresses.</p>
            <Link to="/addresses" className="text-sky-600 font-semibold text-sm">Manage →</Link>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Account;
