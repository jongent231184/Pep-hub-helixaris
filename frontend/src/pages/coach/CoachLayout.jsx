import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LayoutDashboard, ClipboardList, Users, LogOut, Loader2, ExternalLink, PoundSterling } from 'lucide-react';

const NAV = [
  { to: '/coach', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/coach/requests', label: 'Requests', icon: ClipboardList },
  { to: '/coach/clients', label: 'Clients', icon: Users },
  { to: '/coach/earnings', label: 'Earnings', icon: PoundSterling },
];

const CoachLayout = () => {
  const { user, loading, isCoach, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && (!user || !isCoach)) {
      navigate('/login');
    }
  }, [user, loading, isCoach, navigate]);

  if (loading || !user) {
    return <div className="min-h-screen grid place-items-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>;
  }
  if (!isCoach) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 px-4">
        <div className="max-w-sm text-center">
          <h1 className="text-2xl font-black uppercase">Access denied</h1>
          <p className="text-slate-600 mt-2">This portal is for GHP-Health coaches only.</p>
          <Link to="/" className="inline-block mt-6 bg-sky-500 text-white px-5 py-2.5 rounded font-bold uppercase text-sm tracking-wider">Return to site</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="hidden lg:flex flex-col w-64 bg-slate-900 text-slate-200 sticky top-0 h-screen">
        <div className="p-6 border-b border-slate-800">
          <p className="text-[10px] uppercase tracking-widest text-sky-400">Coach Portal</p>
          <h1 className="text-base font-black text-white mt-1">GHP-Health</h1>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {NAV.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium ${isActive ? 'bg-sky-500 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
              data-testid={`coach-nav-${item.label.toLowerCase()}`}>
              <item.icon className="h-4 w-4" /> {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-800 space-y-2">
          <Link to="/" target="_blank" className="flex items-center gap-2 text-xs text-slate-400 hover:text-white">
            <ExternalLink className="h-3.5 w-3.5" /> View storefront
          </Link>
          <p className="text-xs text-slate-400 truncate">{user.email}</p>
          <button onClick={() => { logout(); navigate('/login'); }} className="flex items-center gap-2 text-sm text-slate-300 hover:text-white">
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </div>
      </aside>

      <div className="lg:hidden fixed top-0 inset-x-0 z-40 bg-slate-900 text-white p-4 flex items-center justify-between">
        <p className="font-bold text-sm">Coach Portal</p>
        <button onClick={() => { logout(); navigate('/login'); }} className="text-xs flex items-center gap-1"><LogOut className="h-4 w-4" /> Out</button>
      </div>
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t flex justify-around">
        {NAV.map(item => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) =>
            `flex flex-col items-center py-2 px-2 text-[10px] flex-1 ${isActive ? 'text-sky-600' : 'text-slate-600'}`}>
            <item.icon className="h-5 w-5" />{item.label}
          </NavLink>
        ))}
      </div>

      <main className="flex-1 p-4 md:p-8 pt-20 lg:pt-8 pb-24 lg:pb-8 max-w-full">
        <Outlet />
      </main>
    </div>
  );
};

export default CoachLayout;
