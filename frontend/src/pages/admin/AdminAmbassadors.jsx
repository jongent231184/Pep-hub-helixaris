import React, { useEffect, useState } from 'react';
import { Ambassadors } from '../../lib/api';
import { Loader2, Plus, Trash2, PoundSterling, ChevronRight, X } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import { Switch } from '../../components/ui/switch';
import { useToast } from '../../hooks/use-toast';

const EMPTY_FORM = {
  email: '',
  password: '',
  first_name: '',
  last_name: '',
  ambassador_code: '',
  commission_rate: 15,
  customer_discount: 10,
};

const AdminAmbassadors = () => {
  const { toast } = useToast();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState(null); // detail modal
  const [detail, setDetail] = useState(null);
  const [payoutForm, setPayoutForm] = useState({ amount: '', note: '' });
  const [savingPayout, setSavingPayout] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const load = () => {
    setLoading(true);
    Ambassadors.adminList().then(setList).catch(() => setList([])).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openDetail = async (a) => {
    setSelected(a);
    setDetail(null);
    setEditForm({
      first_name: a.user.first_name || '',
      last_name: a.user.last_name || '',
      ambassador_code: a.user.ambassador_code || '',
      commission_rate: a.user.commission_rate || 15,
      customer_discount: a.user.customer_discount || 10,
      ambassador_active: a.user.ambassador_active !== false,
    });
    try {
      const d = await Ambassadors.adminGet(a.user.id);
      setDetail(d);
    } catch (e) {
      toast({ title: 'Failed to load ambassador', variant: 'destructive' });
    }
  };

  const closeDetail = () => {
    setSelected(null);
    setDetail(null);
    setPayoutForm({ amount: '', note: '' });
    setEditForm(null);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password || !form.ambassador_code) {
      toast({ title: 'Email, password and code are required', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      await Ambassadors.adminCreate({
        ...form,
        ambassador_code: form.ambassador_code.trim().toUpperCase(),
        commission_rate: Number(form.commission_rate),
        customer_discount: Number(form.customer_discount),
      });
      setForm(EMPTY_FORM);
      toast({ title: 'Ambassador created', description: form.email });
      load();
    } catch (err) {
      toast({ title: 'Create failed', description: String(err.response?.data?.detail || err.message), variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleRemove = async (a) => {
    if (!window.confirm(`Remove ${a.user.email} as ambassador?\n\nTheir promo code will be disabled and their role reverted to customer. Order history is preserved.`)) return;
    try {
      await Ambassadors.adminRemove(a.user.id);
      toast({ title: 'Ambassador removed', description: a.user.email });
      load();
    } catch (err) {
      toast({ title: 'Remove failed', description: String(err.response?.data?.detail || err.message), variant: 'destructive' });
    }
  };

  const handleSaveEdit = async () => {
    if (!selected || !editForm) return;
    setSavingEdit(true);
    try {
      await Ambassadors.adminUpdate(selected.user.id, {
        first_name: editForm.first_name,
        last_name: editForm.last_name,
        ambassador_code: (editForm.ambassador_code || '').trim().toUpperCase(),
        commission_rate: Number(editForm.commission_rate),
        customer_discount: Number(editForm.customer_discount),
        ambassador_active: editForm.ambassador_active,
      });
      toast({ title: 'Ambassador updated' });
      await openDetail(selected);
      load();
    } catch (err) {
      toast({ title: 'Update failed', description: String(err.response?.data?.detail || err.message), variant: 'destructive' });
    } finally {
      setSavingEdit(false);
    }
  };

  const handlePayout = async () => {
    if (!selected) return;
    const amt = Number(payoutForm.amount);
    if (!amt || amt <= 0) {
      toast({ title: 'Enter an amount > 0', variant: 'destructive' });
      return;
    }
    setSavingPayout(true);
    try {
      await Ambassadors.adminCreatePayout(selected.user.id, { amount: amt, note: payoutForm.note });
      setPayoutForm({ amount: '', note: '' });
      toast({ title: 'Payout recorded', description: `£${amt.toFixed(2)}` });
      await openDetail(selected);
      load();
    } catch (err) {
      toast({ title: 'Payout failed', description: String(err.response?.data?.detail || err.message), variant: 'destructive' });
    } finally {
      setSavingPayout(false);
    }
  };

  const handleDeletePayout = async (payoutId) => {
    if (!selected) return;
    if (!window.confirm('Delete this payout record?')) return;
    try {
      await Ambassadors.adminDeletePayout(selected.user.id, payoutId);
      await openDetail(selected);
      load();
    } catch (err) {
      toast({ title: 'Delete failed', description: String(err.response?.data?.detail || err.message), variant: 'destructive' });
    }
  };

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-black uppercase mb-6">Ambassadors</h1>

      {/* Create form */}
      <div className="bg-white border rounded-lg p-6 mb-8">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600 mb-4">Add a new ambassador</h2>
        <p className="text-xs text-slate-500 mb-4">Creates the account + promo code together. Share the login details with them so they can access their portal at <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">/ambassador</code>.</p>
        <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-6">
          <div className="md:col-span-3">
            <Label>Email</Label>
            <Input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="mt-1" placeholder="jane@example.com" data-testid="amb-email-input" />
          </div>
          <div className="md:col-span-3">
            <Label>Temporary password</Label>
            <Input required type="text" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="mt-1 font-mono" placeholder="min 8 chars" data-testid="amb-password-input" />
          </div>
          <div className="md:col-span-2">
            <Label>First name</Label>
            <Input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} className="mt-1" />
          </div>
          <div className="md:col-span-2">
            <Label>Last name</Label>
            <Input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} className="mt-1" />
          </div>
          <div className="md:col-span-2">
            <Label>Ambassador / Promo code</Label>
            <Input required value={form.ambassador_code} onChange={e => setForm(f => ({ ...f, ambassador_code: e.target.value.toUpperCase() }))} className="mt-1 font-mono" placeholder="e.g. JANE10" data-testid="amb-code-input" />
          </div>
          <div className="md:col-span-3">
            <Label>Customer discount (%)</Label>
            <Input type="number" min="0" max="100" step="1" value={form.customer_discount} onChange={e => setForm(f => ({ ...f, customer_discount: e.target.value }))} className="mt-1" />
            <p className="text-[11px] text-slate-500 mt-1">% off the customer gets when using the code.</p>
          </div>
          <div className="md:col-span-3">
            <Label>Ambassador commission (%)</Label>
            <Input type="number" min="0" max="100" step="0.1" value={form.commission_rate} onChange={e => setForm(f => ({ ...f, commission_rate: e.target.value }))} className="mt-1" />
            <p className="text-[11px] text-slate-500 mt-1">% of net sales the ambassador earns.</p>
          </div>
          <div className="md:col-span-6">
            <Button
              type="submit"
              disabled={creating}
              className="bg-emerald-500 hover:bg-emerald-600 text-white h-11 gap-2"
              data-testid="create-ambassador-btn"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create ambassador
            </Button>
          </div>
        </form>
      </div>

      {/* List */}
      {loading ? (
        <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>
      ) : (
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-slate-50 text-slate-600 uppercase text-xs">
              <tr>
                <th className="p-3 text-left">Ambassador</th>
                <th className="p-3 text-left">Code</th>
                <th className="p-3 text-left">Orders</th>
                <th className="p-3 text-right">Net Sales</th>
                <th className="p-3 text-right">Commission</th>
                <th className="p-3 text-right">Pending</th>
                <th className="p-3 text-center">Active</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {list.map(a => (
                <tr key={a.user.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => openDetail(a)} data-testid={`ambassador-row-${a.user.ambassador_code}`}>
                  <td className="p-3">
                    <p className="font-semibold">{a.user.first_name} {a.user.last_name}</p>
                    <p className="text-xs text-slate-500">{a.user.email}</p>
                  </td>
                  <td className="p-3 font-mono font-bold text-emerald-700">{a.user.ambassador_code}</td>
                  <td className="p-3">{a.earnings.orders_count}</td>
                  <td className="p-3 text-right">£{a.earnings.net_sales.toFixed(2)}</td>
                  <td className="p-3 text-right font-semibold">£{a.earnings.commission_earned.toFixed(2)}</td>
                  <td className="p-3 text-right font-semibold text-amber-700">£{a.earnings.pending_payout.toFixed(2)}</td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-1 rounded text-xs font-semibold uppercase ${a.user.ambassador_active === false ? 'bg-slate-200 text-slate-600' : 'bg-emerald-100 text-emerald-800'}`}>
                      {a.user.ambassador_active === false ? 'Disabled' : 'Active'}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex gap-1 justify-end" onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" onClick={() => openDetail(a)} className="h-8 w-8" title="View & manage" data-testid={`view-ambassador-${a.user.ambassador_code}`}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleRemove(a)} className="text-red-600 hover:bg-red-50 h-8 w-8" title="Remove">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center text-slate-500">No ambassadors yet. Add one above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={closeDetail}>
          <div
            className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={e => e.stopPropagation()}
            data-testid="ambassador-detail-modal"
          >
            <div className="sticky top-0 bg-white border-b p-5 flex items-center justify-between z-10">
              <div>
                <h2 className="text-xl font-black uppercase">{selected.user.first_name} {selected.user.last_name}</h2>
                <p className="text-xs text-slate-500 font-mono">{selected.user.ambassador_code} · {selected.user.email}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={closeDetail}><X className="h-5 w-5" /></Button>
            </div>

            <div className="p-6 space-y-6">
              {!detail ? (
                <div className="grid place-items-center py-10"><Loader2 className="h-6 w-6 animate-spin text-emerald-500" /></div>
              ) : (
                <>
                  {/* Earnings */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Orders</p>
                      <p className="text-xl font-black">{detail.earnings.orders_count}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Net Sales</p>
                      <p className="text-xl font-black">£{detail.earnings.net_sales.toFixed(2)}</p>
                    </div>
                    <div className="bg-emerald-50 rounded-lg p-3">
                      <p className="text-[10px] uppercase tracking-widest text-emerald-700 font-bold mb-1">Commission</p>
                      <p className="text-xl font-black text-emerald-800">£{detail.earnings.commission_earned.toFixed(2)}</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-3">
                      <p className="text-[10px] uppercase tracking-widest text-amber-700 font-bold mb-1">Pending</p>
                      <p className="text-xl font-black text-amber-800">£{detail.earnings.pending_payout.toFixed(2)}</p>
                    </div>
                  </div>

                  {/* Edit fields */}
                  <div>
                    <h3 className="text-xs uppercase tracking-widest text-slate-600 font-bold mb-3">Settings</h3>
                    <div className="grid md:grid-cols-2 gap-3">
                      <div>
                        <Label>First name</Label>
                        <Input value={editForm?.first_name || ''} onChange={e => setEditForm(f => ({ ...f, first_name: e.target.value }))} className="mt-1" />
                      </div>
                      <div>
                        <Label>Last name</Label>
                        <Input value={editForm?.last_name || ''} onChange={e => setEditForm(f => ({ ...f, last_name: e.target.value }))} className="mt-1" />
                      </div>
                      <div>
                        <Label>Ambassador code</Label>
                        <Input value={editForm?.ambassador_code || ''} onChange={e => setEditForm(f => ({ ...f, ambassador_code: e.target.value.toUpperCase() }))} className="mt-1 font-mono" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Discount %</Label>
                          <Input type="number" min="0" max="100" value={editForm?.customer_discount || 0} onChange={e => setEditForm(f => ({ ...f, customer_discount: e.target.value }))} className="mt-1" />
                        </div>
                        <div>
                          <Label>Commission %</Label>
                          <Input type="number" min="0" max="100" step="0.1" value={editForm?.commission_rate || 0} onChange={e => setEditForm(f => ({ ...f, commission_rate: e.target.value }))} className="mt-1" />
                        </div>
                      </div>
                      <div className="md:col-span-2 flex items-center gap-2 pt-2">
                        <Switch checked={editForm?.ambassador_active !== false} onCheckedChange={v => setEditForm(f => ({ ...f, ambassador_active: v }))} id="amb-active" />
                        <Label htmlFor="amb-active">Ambassador active (disable to pause commission + login)</Label>
                      </div>
                    </div>
                    <Button onClick={handleSaveEdit} disabled={savingEdit} className="mt-4 bg-sky-500 hover:bg-sky-600 text-white gap-2">
                      {savingEdit && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
                    </Button>
                  </div>

                  {/* Record payout */}
                  <div className="border-t pt-6">
                    <h3 className="text-xs uppercase tracking-widest text-slate-600 font-bold mb-3">Record a payout</h3>
                    <div className="grid md:grid-cols-3 gap-3">
                      <div>
                        <Label>Amount (£)</Label>
                        <Input type="number" min="0" step="0.01" value={payoutForm.amount} onChange={e => setPayoutForm(f => ({ ...f, amount: e.target.value }))} className="mt-1" placeholder={detail.earnings.pending_payout.toFixed(2)} />
                      </div>
                      <div className="md:col-span-2">
                        <Label>Note (optional)</Label>
                        <Input value={payoutForm.note} onChange={e => setPayoutForm(f => ({ ...f, note: e.target.value }))} className="mt-1" placeholder="e.g. Bank transfer March 2026" />
                      </div>
                    </div>
                    <Button onClick={handlePayout} disabled={savingPayout} className="mt-3 bg-emerald-500 hover:bg-emerald-600 text-white gap-2" data-testid="record-payout-btn">
                      {savingPayout ? <Loader2 className="h-4 w-4 animate-spin" /> : <PoundSterling className="h-4 w-4" />} Record payout
                    </Button>
                  </div>

                  {/* Payout history */}
                  <div className="border-t pt-6">
                    <h3 className="text-xs uppercase tracking-widest text-slate-600 font-bold mb-3">Payout history</h3>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-xs text-slate-600 uppercase">
                          <tr>
                            <th className="p-2 text-left">Date</th>
                            <th className="p-2 text-left">Note</th>
                            <th className="p-2 text-right">Amount</th>
                            <th className="p-2"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {(detail.payouts || []).map(p => (
                            <tr key={p.id}>
                              <td className="p-2 text-xs">{new Date(p.created_at).toLocaleDateString('en-GB')}</td>
                              <td className="p-2 text-xs text-slate-600">{p.note || '—'}</td>
                              <td className="p-2 text-right font-semibold">£{Number(p.amount).toFixed(2)}</td>
                              <td className="p-2 text-right">
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:bg-red-50" onClick={() => handleDeletePayout(p.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                          {(detail.payouts || []).length === 0 && (
                            <tr><td colSpan={4} className="p-4 text-center text-slate-500 text-sm">No payouts recorded yet.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAmbassadors;
