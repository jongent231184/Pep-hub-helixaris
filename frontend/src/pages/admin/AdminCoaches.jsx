import React, { useEffect, useState } from 'react';
import { Coaches } from '../../lib/api';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Button } from '../../components/ui/button';
import { useToast } from '../../hooks/use-toast';

const EMPTY = { email: '', password: '', first_name: '', last_name: '', bio: '', default_price: 9.99 };

const AdminCoaches = () => {
  const { toast } = useToast();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    Coaches.adminList().then(setList).catch(() => setList([])).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      toast({ title: 'Email and password required', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      await Coaches.adminCreate({ ...form, default_price: Number(form.default_price) });
      setForm(EMPTY);
      toast({ title: 'Coach created', description: form.email });
      load();
    } catch (err) {
      toast({ title: 'Create failed', description: String(err.response?.data?.detail || err.message), variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const remove = async (c) => {
    if (!window.confirm(`Remove ${c.email} as a coach?`)) return;
    try {
      await Coaches.adminRemove(c.id);
      load();
      toast({ title: 'Coach removed' });
    } catch (err) {
      toast({ title: 'Remove failed', description: String(err.response?.data?.detail || err.message), variant: 'destructive' });
    }
  };

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-black uppercase mb-6">Coaches</h1>

      <div className="bg-white border rounded-lg p-6 mb-8">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600 mb-4">Add a new coach</h2>
        <p className="text-xs text-slate-500 mb-4">Coaches log in at <code className="bg-slate-100 px-1.5 py-0.5 rounded">/coach</code> and see intake requests + their active clients.</p>
        <form onSubmit={create} className="grid gap-4 md:grid-cols-6">
          <div className="md:col-span-3">
            <Label>Email</Label>
            <Input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="mt-1" data-testid="coach-email-input" />
          </div>
          <div className="md:col-span-3">
            <Label>Temp password</Label>
            <Input required type="text" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="mt-1 font-mono" data-testid="coach-password-input" />
          </div>
          <div className="md:col-span-2">
            <Label>First name</Label>
            <Input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} className="mt-1" placeholder="James" />
          </div>
          <div className="md:col-span-2">
            <Label>Last name</Label>
            <Input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} className="mt-1" />
          </div>
          <div className="md:col-span-2">
            <Label>Default plan price (£)</Label>
            <Input type="number" min="0" step="0.01" value={form.default_price} onChange={e => setForm(f => ({ ...f, default_price: e.target.value }))} className="mt-1" />
          </div>
          <div className="md:col-span-6">
            <Label>Bio (shown to clients)</Label>
            <Textarea rows={2} value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} className="mt-1" placeholder="Experienced peptide user offering peer education." />
          </div>
          <div className="md:col-span-6">
            <Button type="submit" disabled={creating} className="bg-sky-500 hover:bg-sky-600 text-white gap-2" data-testid="create-coach-btn">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create coach
            </Button>
          </div>
        </form>
      </div>

      {loading ? (
        <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>
      ) : list.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center text-slate-500">
          No coaches yet. Add one above.
        </div>
      ) : (
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 uppercase text-xs">
              <tr>
                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-left">Email</th>
                <th className="p-3 text-right">Default price</th>
                <th className="p-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {list.map(c => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="p-3">
                    <p className="font-semibold">{c.first_name} {c.last_name}</p>
                    {c.bio && <p className="text-xs text-slate-500 mt-0.5">{c.bio}</p>}
                  </td>
                  <td className="p-3 text-slate-600">{c.email}</td>
                  <td className="p-3 text-right font-semibold">£{Number(c.default_price || 0).toFixed(2)}</td>
                  <td className="p-3 text-right">
                    <Button variant="ghost" size="icon" onClick={() => remove(c)} className="h-8 w-8 text-red-600 hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminCoaches;
