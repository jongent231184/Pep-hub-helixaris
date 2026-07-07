import React, { useEffect, useState } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import api from '../lib/api';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { Input } from './ui/input';
import { Button } from './ui/button';

const BYPASS_PATH_PREFIXES = ['/admin', '/login', '/pay/'];

const SitePasswordGate = ({ children }) => {
  const location = useLocation();
  const { settings, loading: storeLoading } = useStore();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem('ghp_site_unlocked') === '1');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Admin and login routes are always accessible
  const bypass = BYPASS_PATH_PREFIXES.some(p => location.pathname.startsWith(p));

  useEffect(() => {
    // If the admin is logged in, auto-unlock the storefront too
    if (isAdmin) {
      sessionStorage.setItem('ghp_site_unlocked', '1');
      setUnlocked(true);
    }
  }, [isAdmin]);

  if (storeLoading || authLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
      </div>
    );
  }

  // Allow through if: bypassed route, site is published, already unlocked, or user is admin
  if (bypass || settings?.published || unlocked) {
    return children;
  }

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/settings/verify-password', { password });
      sessionStorage.setItem('ghp_site_unlocked', '1');
      setUnlocked(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Incorrect password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-slate-900 text-white p-4">
      <div className="max-w-sm w-full bg-slate-800 rounded-xl p-8 shadow-2xl text-center">
        <div className="h-14 w-14 mx-auto rounded-full bg-sky-500/20 grid place-items-center text-sky-400 mb-4">
          <Lock className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-black uppercase tracking-wider">{settings?.site_name || 'Site'}</h1>
        <p className="text-sm text-slate-400 mt-2">This site is private. Please enter the password to view.</p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <Input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Site password"
            autoFocus
            className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold uppercase tracking-wider h-11">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enter'}
          </Button>
        </form>
        <p className="text-[11px] text-slate-500 mt-6">
          Admin? <a href="/login" className="text-sky-400 hover:underline">Log in</a> to access the dashboard.
        </p>
      </div>
    </div>
  );
};

export default SitePasswordGate;
