import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ambassadors } from '../../lib/api';
import { Loader2, TrendingUp, Package, PoundSterling, Wallet, Copy, Check } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';

const StatCard = ({ label, value, sublabel, icon: Icon, accent = 'sky', testid }) => (
  <div className="bg-white border border-slate-200 rounded-xl p-5" data-testid={testid}>
    <div className="flex items-start justify-between mb-3">
      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{label}</p>
      {Icon && <Icon className={`h-4 w-4 text-${accent}-500`} />}
    </div>
    <p className="text-3xl font-black tracking-tight text-slate-900">{value}</p>
    {sublabel && <p className="text-xs text-slate-500 mt-1">{sublabel}</p>}
  </div>
);

const AmbassadorDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    Ambassadors.me().then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, []);

  const copyCode = () => {
    if (!data?.user?.ambassador_code) return;
    navigator.clipboard.writeText(data.user.ambassador_code);
    setCopied(true);
    toast({ title: 'Copied!', description: `Code ${data.user.ambassador_code} copied to clipboard.` });
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>;
  }

  if (!data) {
    return <p className="text-slate-500">Unable to load dashboard.</p>;
  }

  const { user, earnings } = data;

  return (
    <div className="space-y-8" data-testid="ambassador-dashboard">
      <div>
        <p className="text-xs uppercase tracking-widest text-emerald-600 font-bold">Welcome back</p>
        <h1 className="text-3xl md:text-4xl font-black uppercase mt-1">
          {user.first_name || 'Ambassador'} {user.last_name}
        </h1>
        <p className="text-slate-600 mt-2">Here&apos;s an at-a-glance view of your ambassador programme performance.</p>
      </div>

      {/* Promo code card */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-xl p-6 md:p-8 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold mb-1">Your promo code</p>
            <div className="flex items-center gap-3">
              <p className="text-4xl md:text-5xl font-mono font-black tracking-wider text-white" data-testid="ambassador-code">
                {user.ambassador_code}
              </p>
              <button
                onClick={copyCode}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                aria-label="Copy code"
                data-testid="copy-code-btn"
              >
                {copied ? <Check className="h-5 w-5 text-emerald-400" /> : <Copy className="h-5 w-5" />}
              </button>
            </div>
            <p className="text-sm text-slate-300 mt-2">
              Customers get <strong className="text-white">{user.customer_discount || 10}% off</strong> · You earn <strong className="text-white">{user.commission_rate}%</strong> on net sales
            </p>
          </div>
          <Link
            to="/ambassador/orders"
            className="inline-flex items-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold uppercase text-sm tracking-wider rounded-lg transition-colors"
            data-testid="view-orders-cta"
          >
            View all orders →
          </Link>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Orders using your code"
          value={earnings.orders_count}
          icon={Package}
          accent="sky"
          testid="stat-orders"
        />
        <StatCard
          label="Net sales"
          value={`£${earnings.net_sales.toFixed(2)}`}
          sublabel="Ex-shipping, ex-discount"
          icon={TrendingUp}
          accent="indigo"
          testid="stat-net-sales"
        />
        <StatCard
          label="Commission earned"
          value={`£${earnings.commission_earned.toFixed(2)}`}
          sublabel={`${user.commission_rate}% of net sales`}
          icon={PoundSterling}
          accent="emerald"
          testid="stat-commission"
        />
        <StatCard
          label="Pending payout"
          value={`£${earnings.pending_payout.toFixed(2)}`}
          sublabel={`£${earnings.total_paid_out.toFixed(2)} already paid`}
          icon={Wallet}
          accent="amber"
          testid="stat-pending"
        />
      </div>

      {/* How it works */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-sm font-black uppercase tracking-widest text-slate-600 mb-4">How your commission is calculated</h2>
        <ol className="text-sm text-slate-700 space-y-2 list-decimal list-inside">
          <li>Customer uses code <strong className="font-mono">{user.ambassador_code}</strong> at checkout and gets {user.customer_discount || 10}% off.</li>
          <li>Once the order is paid, it counts toward your commission.</li>
          <li>Your commission = <strong>{user.commission_rate}%</strong> of net sales (subtotal minus the customer&apos;s discount, excluding shipping).</li>
          <li>Refunded or cancelled orders are excluded automatically.</li>
          <li>Payouts are settled by GHP-Health and tracked under Payouts.</li>
        </ol>
      </div>
    </div>
  );
};

export default AmbassadorDashboard;
