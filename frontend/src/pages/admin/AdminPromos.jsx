import React, { useEffect, useState } from 'react';
import { Promos } from '../../lib/api';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import { Switch } from '../../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { useToast } from '../../hooks/use-toast';

const EMPTY_FORM = {
  code: '',
  type: 'percent',
  value: '',
  active: true,
  min_subtotal: '',
  max_uses: '',
  expires_at: '',
};

const typeLabel = (t) => ({
  percent: '% off',
  fixed: '£ off',
  free_shipping: 'Free shipping',
}[t] || t);

const typeBadgeClass = (t) => ({
  percent: 'bg-sky-100 text-sky-800',
  fixed: 'bg-emerald-100 text-emerald-800',
  free_shipping: 'bg-indigo-100 text-indigo-800',
}[t] || 'bg-slate-100 text-slate-800');

const AdminPromos = () => {
  const { toast } = useToast();
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  const load = () => {
    setLoading(true);
    Promos.list().then(setPromos).catch(() => setPromos([])).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.code.trim()) {
      toast({ title: 'Code is required', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        type: form.type,
        value: form.type === 'free_shipping' ? 0 : Number(form.value || 0),
        active: form.active,
        min_subtotal: form.min_subtotal ? Number(form.min_subtotal) : 0,
        max_uses: form.max_uses ? Number(form.max_uses) : null,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      };
      await Promos.create(payload);
      setForm(EMPTY_FORM);
      toast({ title: 'Promo created', description: payload.code });
      load();
    } catch (err) {
      toast({ title: 'Create failed', description: String(err.response?.data?.detail || err.message), variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (p) => {
    if (!window.confirm(`Delete promo code ${p.code}? This cannot be undone.`)) return;
    setDeletingId(p.id);
    try {
      await Promos.remove(p.id);
      setPromos(prev => prev.filter(x => x.id !== p.id));
      toast({ title: 'Promo deleted', description: p.code });
    } catch (err) {
      toast({ title: 'Delete failed', description: String(err.response?.data?.detail || err.message), variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleActive = async (p) => {
    setTogglingId(p.id);
    try {
      const updated = await Promos.update(p.id, { active: !p.active });
      setPromos(prev => prev.map(x => x.id === p.id ? updated : x));
    } catch (err) {
      toast({ title: 'Update failed', description: String(err.response?.data?.detail || err.message), variant: 'destructive' });
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-black uppercase mb-6">Promo Codes</h1>

      {/* Create form */}
      <div className="bg-white border rounded-lg p-6 mb-8">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600 mb-4">Create a new promo</h2>
        <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-6">
          <div className="md:col-span-2">
            <Label>Code</Label>
            <Input
              value={form.code}
              onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="e.g. LAUNCH10"
              className="mt-1 font-mono"
              data-testid="promo-code-input"
              required
            />
          </div>
          <div>
            <Label>Type</Label>
            <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
              <SelectTrigger className="mt-1" data-testid="promo-type-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Percent off</SelectItem>
                <SelectItem value="fixed">Fixed £ off</SelectItem>
                <SelectItem value="free_shipping">Free shipping</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.type !== 'free_shipping' && (
            <div>
              <Label>{form.type === 'percent' ? 'Percent (%)' : 'Amount (£)'}</Label>
              <Input
                type="number"
                min="0"
                step={form.type === 'percent' ? '1' : '0.01'}
                value={form.value}
                onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                placeholder={form.type === 'percent' ? '10' : '5.00'}
                className="mt-1"
                required
              />
            </div>
          )}
          <div>
            <Label>Min basket £ (optional)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.min_subtotal}
              onChange={e => setForm(f => ({ ...f, min_subtotal: e.target.value }))}
              placeholder="0.00"
              className="mt-1"
            />
          </div>
          <div>
            <Label>Max uses (optional)</Label>
            <Input
              type="number"
              min="1"
              value={form.max_uses}
              onChange={e => setForm(f => ({ ...f, max_uses: e.target.value }))}
              placeholder="Unlimited"
              className="mt-1"
            />
          </div>
          <div className="md:col-span-2">
            <Label>Expires (optional)</Label>
            <Input
              type="datetime-local"
              value={form.expires_at}
              onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
              className="mt-1"
            />
          </div>
          <div className="md:col-span-2 flex items-end gap-3">
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={v => setForm(f => ({ ...f, active: v }))} id="promo-active" />
              <Label htmlFor="promo-active">Active</Label>
            </div>
          </div>
          <div className="md:col-span-2 flex items-end">
            <Button
              type="submit"
              disabled={creating}
              data-testid="create-promo-btn"
              className="w-full bg-sky-500 hover:bg-sky-600 text-white h-11 gap-2"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create promo
            </Button>
          </div>
        </form>
      </div>

      {/* List */}
      {loading ? (
        <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>
      ) : (
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-slate-50 text-slate-600 uppercase text-xs">
              <tr>
                <th className="p-3 text-left">Code</th>
                <th className="p-3 text-left">Type</th>
                <th className="p-3 text-left">Value</th>
                <th className="p-3 text-left">Min Basket</th>
                <th className="p-3 text-left">Uses</th>
                <th className="p-3 text-left">Expires</th>
                <th className="p-3 text-left">Active</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {promos.map(p => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="p-3 font-mono font-bold">{p.code}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-xs font-semibold uppercase ${typeBadgeClass(p.type)}`}>
                      {typeLabel(p.type)}
                    </span>
                  </td>
                  <td className="p-3">
                    {p.type === 'percent' && `${p.value}%`}
                    {p.type === 'fixed' && `£${Number(p.value).toFixed(2)}`}
                    {p.type === 'free_shipping' && '—'}
                  </td>
                  <td className="p-3">{p.min_subtotal ? `£${Number(p.min_subtotal).toFixed(2)}` : '—'}</td>
                  <td className="p-3">
                    {p.uses}{p.max_uses ? ` / ${p.max_uses}` : ''}
                  </td>
                  <td className="p-3 text-xs">
                    {p.expires_at ? new Date(p.expires_at).toLocaleString() : '—'}
                  </td>
                  <td className="p-3">
                    <Switch
                      checked={p.active}
                      disabled={togglingId === p.id}
                      onCheckedChange={() => handleToggleActive(p)}
                    />
                  </td>
                  <td className="p-3 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(p)}
                      disabled={deletingId === p.id}
                      data-testid={`delete-promo-${p.code}`}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 w-8"
                    >
                      {deletingId === p.id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </td>
                </tr>
              ))}
              {promos.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500">
                    No promo codes yet. Create your first one above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminPromos;
