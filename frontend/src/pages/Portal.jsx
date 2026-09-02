import React, { useEffect, useState } from 'react';
import { Loader2, Lock, Mail, ArrowRight, LogOut, ShieldCheck } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

const TOKEN_KEY = 'ghp_portal_token';
const API_BASE = `${process.env.REACT_APP_BACKEND_URL}/api/portal`;

const api = async (path, opts = {}) => {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
};

// -------- Login form --------
const LoginPanel = ({ onSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const r = await api('/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      localStorage.setItem(TOKEN_KEY, r.access_token);
      onSuccess(r.user);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md" data-testid="portal-login-panel">
      <div className="mb-8 text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 border border-white/10 mb-4">
          <ShieldCheck className="h-7 w-7 text-white/80" />
        </div>
        <h1 className="text-3xl font-black tracking-tight text-white">Operator Portal</h1>
        <p className="text-sm text-white/50 mt-2">One login. All your brands in one place.</p>
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
        <div>
          <Label className="text-white/70 text-xs uppercase tracking-widest">Email</Label>
          <div className="relative mt-1">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="owner@…"
              className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/30"
              data-testid="portal-email"
            />
          </div>
        </div>
        <div>
          <Label className="text-white/70 text-xs uppercase tracking-widest">Password</Label>
          <div className="relative mt-1">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="•••••••••"
              className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/30"
              data-testid="portal-password"
            />
          </div>
        </div>

        {err && <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded px-3 py-2">{err}</div>}

        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-white text-slate-900 hover:bg-white/90 gap-2 h-11 font-bold"
          data-testid="portal-login-submit"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Continue <ArrowRight className="h-4 w-4" /></>}
        </Button>
      </form>

      <p className="text-center text-xs text-white/30 mt-6">
        This portal is separate from each brand's admin login.<br />
        You'll re-authenticate inside each brand for security.
      </p>
    </div>
  );
};

// -------- Brand hub --------
const BrandHub = ({ user, onLogout }) => {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    api('/brands')
      .then(setBrands)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  const launch = (b) => {
    if (!b.admin_url) return;
    // Open in same tab so it feels like navigating INTO the brand
    window.location.href = b.admin_url;
  };

  return (
    <div className="w-full max-w-5xl" data-testid="portal-hub">
      <div className="flex items-center justify-between mb-10">
        <div>
          <p className="text-white/40 text-xs uppercase tracking-[0.3em]">Signed in as</p>
          <p className="text-white font-bold text-lg">{user?.email}</p>
        </div>
        <Button
          variant="ghost"
          onClick={onLogout}
          className="text-white/50 hover:text-white hover:bg-white/5 gap-2"
          data-testid="portal-logout"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </div>

      <div className="mb-10">
        <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">Choose a brand</h1>
        <p className="text-white/50 mt-2">Click a card to open its admin. Each brand has its own login.</p>
      </div>

      {loading ? (
        <div className="text-white/50"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : err ? (
        <div className="text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded p-4">{err}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {brands.map((b) => {
            const disabled = !b.admin_url;
            return (
              <button
                key={b.key}
                type="button"
                onClick={() => launch(b)}
                disabled={disabled}
                data-testid={`brand-card-${b.key}`}
                className={`group relative overflow-hidden rounded-3xl border p-8 text-left transition-all ${
                  disabled
                    ? 'border-white/5 bg-white/[0.02] cursor-not-allowed opacity-60'
                    : 'border-white/10 bg-white/[0.04] hover:border-white/30 hover:bg-white/[0.06] hover:-translate-y-1 cursor-pointer'
                }`}
                style={{ '--brand-accent': b.accent_color }}
              >
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-30 transition-opacity"
                  style={{
                    background: `radial-gradient(600px circle at 0% 0%, ${b.accent_color}22, transparent 70%)`,
                  }}
                />
                <div className="relative z-10 flex flex-col h-full min-h-[220px]">
                  <div className="flex-1 flex items-center justify-center mb-6">
                    {b.logo ? (
                      <img
                        src={b.logo}
                        alt={b.name}
                        className="max-h-24 max-w-full object-contain"
                      />
                    ) : (
                      <div className="text-2xl font-black text-white">{b.name}</div>
                    )}
                  </div>
                  <div className="border-t border-white/10 pt-4 flex items-center justify-between">
                    <div>
                      <p className="text-white font-bold text-lg leading-tight">{b.name}</p>
                      <p className="text-white/40 text-xs mt-0.5">{b.tagline || (disabled ? 'Coming soon' : 'Open admin')}</p>
                    </div>
                    {!disabled && (
                      <div
                        className="h-10 w-10 rounded-full grid place-items-center border transition-all group-hover:translate-x-1"
                        style={{
                          borderColor: b.accent_color + '55',
                          background: b.accent_color + '15',
                          color: b.accent_color,
                        }}
                      >
                        <ArrowRight className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// -------- Portal shell --------
const Portal = () => {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setChecking(false); return; }
    api('/me')
      .then(setUser)
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setChecking(false));
  }, []);

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 relative overflow-hidden">
      {/* Backdrop layers */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,#1e3a8a25,transparent_50%),radial-gradient(circle_at_80%_90%,#c8a24a15,transparent_50%)]" />
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%224%22 height=%224%22><circle cx=%221%22 cy=%221%22 r=%220.4%22 fill=%22white%22 opacity=%220.03%22/></svg>')]" />

      <div className="relative z-10 min-h-screen grid place-items-center px-4 py-16">
        {checking ? (
          <Loader2 className="h-8 w-8 animate-spin text-white/40" />
        ) : user ? (
          <BrandHub user={user} onLogout={logout} />
        ) : (
          <LoginPanel onSuccess={setUser} />
        )}
      </div>
    </div>
  );
};

export default Portal;
