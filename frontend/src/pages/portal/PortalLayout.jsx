import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Coaches } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import BRAND from '../../config/brand';
import { TierBadge } from '../../components/coaching/TierCards';
import { LayoutDashboard, ClipboardList, CalendarCheck, TrendingUp, MessageSquare, BookOpen, Lock, Loader2, ArrowLeft, Menu, X } from 'lucide-react';

export const PortalContext = React.createContext(null);

const NAV = [
  { to: '/portal', label: 'Dashboard', icon: LayoutDashboard, end: true, module: null },
  { to: '/portal/plan', label: 'My Plan', icon: ClipboardList, module: 'plan' },
  { to: '/portal/check-in', label: 'Weekly Check-in', icon: CalendarCheck, module: 'checkin' },
  { to: '/portal/progress', label: 'Progress', icon: TrendingUp, module: 'progress' },
  { to: '/portal/messages', label: 'Messages', icon: MessageSquare, module: 'messages' },
  { to: '/portal/resources', label: 'Resources', icon: BookOpen, module: 'resources' },
];

const PortalLayout = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [m, setM] = useState(null);
  const [plans, setPlans] = useState([]);
  const [busy, setBusy] = useState(true);
  const [open, setOpen] = useState(false);

  const reload = () => Coaches.myMembership().then(setM).catch(() => setM(null));
  useEffect(() => {
    if (loading) return;
    if (!user) { navigate('/login?returnTo=/portal'); return; }
    Promise.all([reload(), Coaches.plans().then(setPlans).catch(() => {})]).finally(() => setBusy(false));
  }, [user, loading, navigate]);

  if (loading || busy) return <div className="min-h-screen grid place-items-center bg-[#0b1528]"><Loader2 className="h-8 w-8 animate-spin text-[color:var(--portal-accent)]" style={{ '--portal-accent': BRAND.accent }} /></div>;

  if (!m?.active) return <PortalLocked m={m} />;

  const has = (mod) => !mod || (m.modules || []).includes(mod);

  return (
    <PortalContext.Provider value={{ membership: m, plans, reload, has }}>
      <div className="min-h-screen bg-[#f4f5f8] md:grid md:grid-cols-[240px_1fr]" style={{ '--portal-accent': BRAND.accent }} data-testid="coaching-portal">
        <aside className={`bg-[#0b1528] text-slate-200 md:sticky md:top-0 md:h-screen flex flex-col ${open ? 'fixed inset-0 z-40' : 'hidden md:flex'}`}>
          <div className="p-6 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3">
              <img src={BRAND.logo} alt={BRAND.name} className="h-10 w-10 rounded-lg object-cover bg-white/10" />
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Client portal</p>
                <p className="font-black text-white leading-tight">{BRAND.name}</p>
              </div>
            </Link>
            <button className="md:hidden text-slate-300" onClick={() => setOpen(false)} data-testid="portal-nav-close"><X className="h-5 w-5" /></button>
          </div>
          <nav className="px-3 space-y-1 flex-1">
            {NAV.map(n => {
              const locked = !has(n.module);
              return (
                <NavLink
                  key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)}
                  className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${isActive ? 'text-[#0b1528]' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
                  style={({ isActive }) => isActive ? { backgroundColor: BRAND.accent } : undefined}
                  data-testid={`portal-nav-${n.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <n.icon className="h-4 w-4" /> <span className="flex-1">{n.label}</span>
                  {locked && <Lock className="h-3.5 w-3.5 opacity-60" />}
                </NavLink>
              );
            })}
          </nav>
          <div className="p-5 border-t border-white/10 text-xs text-slate-400">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate">{user.first_name || user.email}</span>
              <TierBadge tier={m.tier} />
            </div>
            <p className="mt-2">Renews {m.paid_until ? new Date(m.paid_until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</p>
            <Link to="/account" className="mt-3 inline-flex items-center gap-1 text-slate-300 hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Back to account</Link>
          </div>
        </aside>
        <div className="min-w-0">
          <header className="md:hidden flex items-center justify-between px-4 py-3 bg-[#0b1528] text-white">
            <button onClick={() => setOpen(true)} data-testid="portal-nav-open"><Menu className="h-5 w-5" /></button>
            <p className="text-[10px] uppercase tracking-[0.25em]">Client portal</p>
            <TierBadge tier={m.tier} />
          </header>
          <main className="p-4 md:p-8 max-w-6xl">
            <Outlet />
          </main>
        </div>
      </div>
    </PortalContext.Provider>
  );
};

const PortalLocked = ({ m }) => {
  const pending = m?.pending_order;
  return (
    <div className="min-h-screen bg-[#0b1528] text-white grid place-items-center p-6" data-testid="portal-locked">
      <div className="max-w-md w-full bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
        <div className="h-14 w-14 mx-auto rounded-full grid place-items-center" style={{ backgroundColor: BRAND.accent }}><Lock className="h-6 w-6 text-[#0b1528]" /></div>
        <h1 className="text-2xl font-black mt-5">Your portal is {m?.paid_until ? 'paused' : 'not active yet'}</h1>
        <p className="text-sm text-slate-300 mt-3">
          {pending
            ? `Pay this month's ${pending.tier || ''} membership (£${pending.amount.toFixed(2)}) and the portal unlocks straight away.`
            : m?.client_id
              ? 'Your coach will send your monthly pay link shortly. You will receive it by email and it will appear here.'
              : 'Choose a coaching plan to get started.'}
        </p>
        <div className="mt-6 flex flex-col gap-3">
          {pending && <Link to={pending.payment_link} className="font-bold uppercase tracking-wider text-sm py-3 rounded-lg text-[#0b1528]" style={{ backgroundColor: BRAND.accent }} data-testid="portal-pay-btn">Pay £{pending.amount.toFixed(2)} now</Link>}
          {!m?.client_id && <Link to="/coaching" className="font-bold uppercase tracking-wider text-sm py-3 rounded-lg text-[#0b1528]" style={{ backgroundColor: BRAND.accent }} data-testid="portal-choose-plan-btn">View plans</Link>}
          <Link to="/account" className="text-sm text-slate-300 hover:text-white">Back to my account</Link>
        </div>
      </div>
    </div>
  );
};

export default PortalLayout;
