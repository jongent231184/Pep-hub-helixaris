import React, { useState } from 'react';
import { Auth } from '../lib/api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Loader2, KeyRound, Eye, EyeOff } from 'lucide-react';
import { useToast } from '../hooks/use-toast';

const ChangePasswordCard = ({ compact = false }) => {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const submit = async (e) => {
    e.preventDefault();
    if (form.next !== form.confirm) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    if (form.next.length < 8) {
      toast({ title: 'Password must be at least 8 characters', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      await Auth.changePassword(form.current, form.next);
      toast({ title: 'Password updated', description: 'Use your new password next time you log in.' });
      setForm({ current: '', next: '', confirm: '' });
    } catch (err) {
      toast({ title: 'Update failed', description: String(err.response?.data?.detail || err.message), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const type = show ? 'text' : 'password';
  return (
    <section className={`bg-white ${compact ? '' : 'border rounded-lg'} p-6`}>
      <h2 className="text-base font-bold uppercase tracking-wide mb-1 flex items-center gap-2">
        <KeyRound className="h-5 w-5" /> Change password
      </h2>
      <p className="text-xs text-slate-500 mb-4">Update the password you use to sign in.</p>
      <form onSubmit={submit} className="space-y-4 max-w-md">
        <div>
          <Label>Current password</Label>
          <Input required type={type} value={form.current} onChange={e => setForm(f => ({ ...f, current: e.target.value }))} className="mt-1" />
        </div>
        <div>
          <Label>New password (min 8 characters)</Label>
          <Input required type={type} value={form.next} onChange={e => setForm(f => ({ ...f, next: e.target.value }))} className="mt-1" />
        </div>
        <div>
          <Label>Confirm new password</Label>
          <Input required type={type} value={form.confirm} onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} className="mt-1" />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
          <input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} className="accent-sky-500" />
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} Show passwords
        </label>
        <Button type="submit" disabled={busy} className="bg-sky-500 hover:bg-sky-600 text-white">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update password'}
        </Button>
      </form>
    </section>
  );
};

export default ChangePasswordCard;
