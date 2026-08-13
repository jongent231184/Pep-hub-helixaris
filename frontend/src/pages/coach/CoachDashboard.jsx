import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Coaches } from '../../lib/api';
import { Loader2, ClipboardList, Users, Clock, CheckCircle2 } from 'lucide-react';

const CoachDashboard = () => {
  const [me, setMe] = useState(null);
  const [requests, setRequests] = useState([]);
  const [clients, setClients] = useState([]);
  const [atRisk, setAtRisk] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([Coaches.me(), Coaches.requests(), Coaches.clients(), Coaches.atRisk()])
      .then(([m, r, c, ar]) => { setMe(m); setRequests(r); setClients(c); setAtRisk(ar); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => ({
    inbox: requests.filter(r => r.status === 'new').length,
    accepted: requests.filter(r => r.status === 'accepted').length,
    active: clients.filter(c => c.active).length,
  }), [requests, clients]);

  if (loading) return <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>;

  return (
    <div className="space-y-8" data-testid="coach-dashboard">
      <div>
        <p className="text-xs uppercase tracking-widest text-sky-600 font-bold">Welcome back</p>
        <h1 className="text-3xl md:text-4xl font-black uppercase mt-1">
          {me?.first_name || 'Coach'} {me?.last_name}
        </h1>
        <p className="text-slate-600 mt-2">Peer-education coaching · {me?.default_price ? `£${Number(me.default_price).toFixed(2)} default plan` : 'GHP-Health'}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">New requests</p>
            <ClipboardList className="h-4 w-4 text-sky-500" />
          </div>
          <p className="text-3xl font-black">{counts.inbox}</p>
          <Link to="/coach/requests" className="text-xs text-sky-600 hover:underline mt-2 inline-block">View inbox →</Link>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-widest text-emerald-700 font-bold">Active clients</p>
            <Users className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="text-3xl font-black text-emerald-800">{counts.active}</p>
          <Link to="/coach/clients" className="text-xs text-emerald-700 hover:underline mt-2 inline-block">View clients →</Link>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Accepted (open)</p>
            <CheckCircle2 className="h-4 w-4 text-indigo-500" />
          </div>
          <p className="text-3xl font-black text-slate-900">{counts.accepted}</p>
        </div>
      </div>

      {atRisk.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6" data-testid="at-risk-panel">
          <h2 className="text-xs uppercase tracking-widest text-amber-800 font-bold mb-4">⚠️ Clients at risk — missed doses in the last 3 days</h2>
          <ul className="divide-y divide-amber-200">
            {atRisk.map(c => (
              <li key={c.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="font-bold text-slate-900">{c.customer_name}</p>
                  <p className="text-xs text-slate-600">{c.customer_email} · <strong>{c.missed_count} missed dose{c.missed_count === 1 ? '' : 's'}</strong></p>
                </div>
                <Link to={`/coach/clients/${c.id}`} className="text-sm text-sky-600 hover:underline">Check in →</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {counts.inbox > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-xs uppercase tracking-widest text-slate-500 font-bold mb-4 flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" /> Awaiting your review
          </h2>
          <ul className="divide-y">
            {requests.filter(r => r.status === 'new').slice(0, 5).map(r => (
              <li key={r.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-bold text-slate-900">{r.first_name} {r.last_name}</p>
                  <p className="text-xs text-slate-500">{r.email} · {r.area}</p>
                </div>
                <Link to="/coach/requests" className="text-sm text-sky-600 hover:underline">Open →</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default CoachDashboard;
