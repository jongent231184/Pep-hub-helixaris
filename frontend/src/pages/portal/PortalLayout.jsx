import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { Coaches } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import BRAND from '../../config/brand';
import { TierBadge } from '../../components/coaching/TierCards';
import { LayoutDashboard, ClipboardList, CalendarCheck, TrendingUp, MessageSquare, BookOpen, Lock, Loader2, ArrowLeft, Menu, X, Eye } from 'lucide-react';

export const PortalContext = React.createContext(null);

const NAV = [
  { path: '', label: 'Dashboard', icon: LayoutDashboard, end: true, module: null },
  { path: 'plan', label: 'My Plan', icon: ClipboardList, module: 'plan' },
  { path: 'check-in', label: 'Weekly Check-in', icon: CalendarCheck, module: 'checkin' },
  { path: 'progress', label: 'Progress', icon: TrendingUp, module: 'progress' },
  { path: 'messages', label: 'Messages', icon: MessageSquare, module: 'messages' },
  { path: 'resources', label: 'Resources', icon: BookOpen, module: 'resources' },
];

// Data source: the member's own endpoints, or (coach view) the per-client ones.
const memberSrc = () => ({
  readOnly: false, coachView: false,
  protocol: () => Coaches.myProtocol(),
  checkins: () => Coaches.myCheckins(),
  submitCheckin: (d) => Coaches.submitCheckin(d),
  messages: () => Coaches.myMessages(),
  sendMessage: (b) => Coaches.sendMyMessage(b),
  resources: () => Coaches.myResources(),
  weighIns: null,
});

const coachSrc = (clientId, bundle) => ({
  readOnly: true, coachView: true, clientId,
  protocol: async () => bundle.protocol,
  checkins: async () => bundle.checkins,
  submitCheckin: async () => { throw new Error('Coach view is read-only'); },
  messages: () => Coaches.clientMessages(clientId),
  sendMessage: (b) => Coaches.sendMessage(clientId, b),
  resources: async () => bundle.resources,
  weighIns: () => Coaches.coachWeighIns(clientId),
});

const PortalLayout = () => {
  const { user, loading } = useAuth();
  const { clientId } = useParams();
  const coachView = Boolean(clientId);
  const base = coachView ? `/coach/clients/${clientId}/portal` : '/portal';
  const navigate = useNavigate();
  const [m, setM] = useState(null);
  const [bundle, setBundle] = useState(null);
  const [plans, setPlans] = useState([]);
  const [busy, setBusy] = useState(true);
  const [open, setOpen] = useState(false);

  const reload = useCallback(async () => {
    if (coachView) {
      const b = await Coaches.portalView(clientId);
      setBundle(b);
      setM(b.membership);
    } else {
      setM(await Coaches.myMembership());
    }
  }, [coachView, clientId]);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate(`/login?returnTo=${encodeURIComponent(base)}`); return; }
    Promise.all([reload().catch(() => setM(null)), Coaches.plans().then(setPlans).catch(() => {})]).finally(() => setBusy(false));
  }, [user, loading, navigate, reload, base]);

  const src = useMemo(() => (coachView && bundle ? coachSrc(clientId, bundle) : memberSrc()), [coachView, clientId, bundle]);

  if (loading || busy) return <div className="min-h-screen grid place-items-center bg-[#0b1528]"><Loader2 className="h-8 w-8 animate-spin" style={{ color: BRAND.accent }} /></div>;

  if (!coachView && !m?.active) return <PortalLocked m={m} />;
  if (coachView && !m) return <div className="min-h-screen grid place-items-center text-slate-600">Client not found. <Link to="/coach/clients" className="ml-2 text-sky-600">Back</Link></div>;

  // Coach sees exactly what the client sees: locked modules when inactive or not in tier.
  const has = (mod) => !mod || (m.active && (m.modules || []).includes(mod));
  const sidebarName = coachView ? m.client_name : (user.first_name || user.email);

  return (
    <PortalContext.Provider value={{ membership: m, plans, reload, has, src, base, coachView }}>
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
                  key={n.path} to={n.path ? `${base}/${n.path}` : base} end={n.end} onClick={() => setOpen(false)}
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
              <span className="truncate">{sidebarName}</span>
              {m.tier && <TierBadge tier={m.tier} />}
            </div>
            <p className="mt-2">{m.active ? 'Renews' : 'Paid until'} {m.paid_until ? new Date(m.paid_until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</p>
            <Link to={coachView ? `/coach/clients/${clientId}` : '/account'} className="mt-3 inline-flex items-center gap-1 text-slate-300 hover:text-white" data-testid="portal-back-link"><ArrowLeft className="h-3.5 w-3.5" /> {coachView ? 'Back to client page' : 'Back to account'}</Link>
          </div>
        </aside>
        <div className="min-w-0">
          {coachView && (
            <div className="bg-amber-400 text-[#0b1528] text-xs font-bold px-4 py-2 flex items-center gap-2" data-testid="coach-view-banner">
              <Eye className="h-4 w-4" /> Coach view — you're seeing {m.client_name}'s portal exactly as they do{!m.active ? ' (currently locked for them)' : ''}. Messages you send here go to the client.
            </div>
          )}
          <header className="md:hidden flex items-center justify-between px-4 py-3 bg-[#0b1528] text-white">
            <button onClick={() => setOpen(true)} data-testid="portal-nav-open"><Menu className="h-5 w-5" /></button>
            <p className="text-[10px] uppercase tracking-[0.25em]">Client portal</p>
            {m.tier ? <TierBadge tier={m.tier} /> : <span />}
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
