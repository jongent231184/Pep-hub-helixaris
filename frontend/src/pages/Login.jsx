import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import Breadcrumbs from '../components/Breadcrumbs';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../hooks/use-toast';

const Login = () => {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', firstName: '', lastName: '' });

  const update = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    if (mode === 'login') {
      login(form.email, form.password);
      toast({ title: 'Welcome back!' });
    } else {
      register(form);
      toast({ title: 'Account created' });
    }
    navigate('/account');
  };

  return (
    <Layout>
      <div className="max-w-md mx-auto px-4 py-10">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: mode === 'login' ? 'Log In' : 'Register' }]} />
        <h1 className="text-3xl font-black uppercase mt-6 mb-6">{mode === 'login' ? 'Log In' : 'Create Account'}</h1>
        <form onSubmit={submit} className="space-y-4 border rounded-lg p-6">
          {mode === 'register' && (
            <div className="grid grid-cols-2 gap-4">
              <div><Label>First Name</Label><Input required value={form.firstName} onChange={update('firstName')} className="mt-1" /></div>
              <div><Label>Last Name</Label><Input required value={form.lastName} onChange={update('lastName')} className="mt-1" /></div>
            </div>
          )}
          <div><Label>Email</Label><Input required type="email" value={form.email} onChange={update('email')} className="mt-1" /></div>
          <div><Label>Password</Label><Input required type="password" value={form.password} onChange={update('password')} className="mt-1" /></div>
          <Button type="submit" className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold uppercase tracking-wider h-11">
            {mode === 'login' ? 'Log In' : 'Create Account'}
          </Button>
          <p className="text-sm text-center text-slate-600">
            {mode === 'login' ? (
              <>No account? <button type="button" onClick={() => setMode('register')} className="text-sky-600 font-semibold">Register</button></>
            ) : (
              <>Already have an account? <button type="button" onClick={() => setMode('login')} className="text-sky-600 font-semibold">Log in</button></>
            )}
          </p>
        </form>
      </div>
    </Layout>
  );
};

export default Login;
