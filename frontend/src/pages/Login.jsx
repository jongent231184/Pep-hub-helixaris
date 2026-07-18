import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import Breadcrumbs from '../components/Breadcrumbs';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../hooks/use-toast';
import { Loader2 } from 'lucide-react';

const Login = () => {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo');
  const { toast } = useToast();
  const [mode, setMode] = useState('login');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', firstName: '', lastName: '' });

  const update = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      let user;
      if (mode === 'login') {
        user = await login(form.email, form.password);
        toast({ title: 'Welcome back!' });
      } else {
        user = await register(form);
        toast({ title: 'Account created' });
      }
      if (user.role === 'admin') {
        navigate('/admin');
      } else if (user.role === 'ambassador') {
        navigate('/ambassador');
      } else {
        navigate(returnTo || '/account');
      }
    } catch (err) {
      const msg = err.response?.data?.detail || err.message;
      toast({ title: mode === 'login' ? 'Login failed' : 'Registration failed', description: String(msg), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-md mx-auto px-4 py-10">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: mode === 'login' ? 'Log In' : 'Register' }]} />
        <h1 className="text-3xl font-black uppercase mt-6 mb-6">{mode === 'login' ? 'Log In' : 'Create Account'}</h1>
        <form onSubmit={submit} className="space-y-4 border rounded-lg p-6 bg-white">
          {mode === 'register' && (
            <div className="grid grid-cols-2 gap-4">
              <div><Label>First Name</Label><Input required value={form.firstName} onChange={update('firstName')} className="mt-1" /></div>
              <div><Label>Last Name</Label><Input required value={form.lastName} onChange={update('lastName')} className="mt-1" /></div>
            </div>
          )}
          <div><Label>Email</Label><Input required type="email" autoComplete="email" value={form.email} onChange={update('email')} className="mt-1" /></div>
          <div><Label>Password</Label><Input required type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={update('password')} className="mt-1" /></div>
          <Button type="submit" disabled={busy} className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold uppercase tracking-wider h-11">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (mode === 'login' ? 'Log In' : 'Create Account')}
          </Button>
          <p className="text-sm text-center text-slate-600">
            {mode === 'login' ? (
              <>No account? <button type="button" onClick={() => setMode('register')} className="text-sky-600 font-semibold">Register</button></>
            ) : (
              <>Already have an account? <button type="button" onClick={() => setMode('login')} className="text-sky-600 font-semibold">Log in</button></>
            )}
          </p>
          <p className="text-[11px] text-slate-500 text-center pt-2 border-t">Admin? Log in with your admin credentials to access <Link to="/admin" className="text-sky-600">the dashboard</Link>.</p>
        </form>
      </div>
    </Layout>
  );
};

export default Login;
