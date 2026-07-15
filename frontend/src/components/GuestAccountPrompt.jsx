import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, Loader2, CheckCircle2 } from 'lucide-react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../hooks/use-toast';

/**
 * Post-purchase account creation card — shown to guest customers on the
 * order-confirmation page. Their email + name are pre-filled from the
 * shipping address; they just pick a password. On register we auto-adopt
 * their new (and any past) guest orders into their account.
 */
const GuestAccountPrompt = ({ order }) => {
  const { register } = useAuth();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);

  const ship = order?.shipping_address || {};
  const email = ship.email || '';

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 8) {
      toast({ title: 'Password too short', description: 'Please use at least 8 characters.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      await register({
        email,
        password,
        firstName: ship.first_name || '',
        lastName: ship.last_name || '',
      });
      setCreated(true);
      toast({ title: 'Account created', description: 'Your order is now saved to your account.' });
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Something went wrong';
      const already = String(msg).toLowerCase().includes('already registered');
      toast({
        title: already ? 'You already have an account' : 'Could not create account',
        description: already ? 'Sign in with your existing password to see this order.' : String(msg),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <div
        className="mt-10 border border-emerald-200 bg-emerald-50 rounded-lg p-6 flex items-start gap-4 text-left"
        data-testid="guest-account-success"
      >
        <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-emerald-900 uppercase text-sm tracking-wider">Account created</p>
          <p className="text-sm text-slate-700 mt-1">
            This order &mdash; and any past orders under {email} &mdash; are now saved to your account.
          </p>
          <Link to="/account" className="inline-block mt-3 text-sm text-sky-700 hover:text-sky-800 font-semibold underline">
            View my account &rarr;
          </Link>
        </div>
      </div>
    );
  }

  if (!email) return null;

  return (
    <div
      className="mt-10 border border-slate-200 bg-white rounded-lg p-6 text-left"
      data-testid="guest-account-prompt"
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="h-10 w-10 rounded-full bg-sky-100 grid place-items-center shrink-0">
          <UserPlus className="h-5 w-5 text-sky-700" />
        </div>
        <div>
          <p className="font-bold uppercase text-sm tracking-wider">Save this order to your account</p>
          <p className="text-sm text-slate-600 mt-1">
            Set a password to track this order and reorder faster next time. We&apos;ll use <span className="font-mono text-xs">{email}</span>.
          </p>
        </div>
      </div>
      <form onSubmit={submit} className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
        <div>
          <Label htmlFor="guest-pw">Choose a password</Label>
          <Input
            id="guest-pw"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="mt-1"
            data-testid="guest-password-input"
          />
        </div>
        <Button
          type="submit"
          disabled={busy}
          className="h-10 bg-sky-600 hover:bg-sky-700 text-white font-bold uppercase tracking-wider text-xs whitespace-nowrap"
          data-testid="guest-create-account-btn"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create account'}
        </Button>
      </form>
      <p className="text-[11px] text-slate-500 mt-3">
        Already have an account? <Link to="/login" className="text-sky-600 hover:text-sky-700 font-semibold">Log in</Link> and this order will be automatically linked to your account.
      </p>
    </div>
  );
};

export default GuestAccountPrompt;
