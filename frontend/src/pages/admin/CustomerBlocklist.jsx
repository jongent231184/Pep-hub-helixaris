import React, { useEffect, useState } from 'react';
import { Blocklist } from '../../lib/api';
import { Loader2, Trash2, ShieldBan, Plus } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { useToast } from '../../hooks/use-toast';

const EMPTY = { first_name: '', last_name: '', email: '', address1: '', postcode: '', reason: '' };

const CustomerBlocklist = ({ onChange }) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const { toast } = useToast();

  const load = () => Blocklist.list().then(setEntries).catch(() => setEntries([])).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const entry = await Blocklist.create(form);
      setEntries(prev => [entry, ...prev]);
      setForm(EMPTY);
      toast({ title: 'Customer blocked', description: 'Future orders matching these details will be refused at checkout.' });
      onChange?.();
    } catch (err) {
      toast({ title: 'Could not add', description: String(err.response?.data?.detail || err.message), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const remove = async (entry) => {
    if (!window.confirm('Remove this block? The customer will be able to order again.')) return;
    setDeletingId(entry.id);
    try {
      await Blocklist.remove(entry.id);
      setEntries(prev => prev.filter(x => x.id !== entry.id));
      toast({ title: 'Block removed' });
      onChange?.();
    } catch (err) {
      toast({ title: 'Remove failed', description: String(err.response?.data?.detail || err.message), variant: 'destructive' });
    } finally { setDeletingId(null); }
  };

  return (
    <div className="space-y-6" data-testid="blocklist-panel">
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-900">
        <p className="font-bold flex items-center gap-2"><ShieldBan className="h-4 w-4" /> How blocking works</p>
        <ul className="list-disc ml-5 mt-2 space-y-1 text-red-800">
          <li>An order is refused at checkout (and on pay links) when the shipping <em>or</em> billing details match a block.</li>
          <li>Matches: the <strong>email</strong>; or the <strong>postcode + address line 1</strong> (blocks the house, whatever name they use); or the <strong>postcode + full name</strong>.</li>
          <li>A <strong>name on its own</strong> blocks that exact name anywhere — use with care for common names.</li>
          <li>Matching ignores case, spaces and punctuation, so "sw1a 1aa" and "SW1A1AA" are the same.</li>
        </ul>
      </div>

      <form onSubmit={submit} className="bg-white border rounded-lg p-5 space-y-3" data-testid="blocklist-form">
        <h2 className="font-bold uppercase text-sm tracking-wide">Add a block</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Input value={form.first_name} onChange={set('first_name')} placeholder="First name" data-testid="block-first-name" />
          <Input value={form.last_name} onChange={set('last_name')} placeholder="Last name" data-testid="block-last-name" />
          <Input value={form.email} onChange={set('email')} placeholder="Email" type="email" data-testid="block-email" />
          <Input value={form.address1} onChange={set('address1')} placeholder="Address line 1 (e.g. 12 High Street)" data-testid="block-address1" />
          <Input value={form.postcode} onChange={set('postcode')} placeholder="Postcode" data-testid="block-postcode" />
          <Input value={form.reason} onChange={set('reason')} placeholder="Reason (internal, e.g. false non-delivery claim)" data-testid="block-reason" />
        </div>
        <Button type="submit" disabled={saving} className="bg-red-600 hover:bg-red-700 text-white gap-2" data-testid="block-submit-btn">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Block customer
        </Button>
      </form>

      {loading ? (
        <div className="grid place-items-center py-10"><Loader2 className="h-6 w-6 animate-spin text-sky-500" /></div>
      ) : (
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]" data-testid="blocklist-table">
            <thead className="bg-slate-50 text-slate-600 uppercase text-xs">
              <tr>
                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-left">Email</th>
                <th className="p-3 text-left">Address</th>
                <th className="p-3 text-left">Reason</th>
                <th className="p-3 text-left">Blocked attempts</th>
                <th className="p-3 text-left">Added</th>
                <th className="p-3 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {entries.map(e => (
                <tr key={e.id} className="hover:bg-slate-50" data-testid={`blocklist-row-${e.id}`}>
                  <td className="p-3 font-semibold">{`${e.first_name || ''} ${e.last_name || ''}`.trim() || <span className="text-slate-400">—</span>}</td>
                  <td className="p-3 text-xs">{e.email || <span className="text-slate-400">—</span>}</td>
                  <td className="p-3 text-xs">
                    {e.address1 && <p>{e.address1}</p>}
                    {e.postcode && <p className="font-mono">{e.postcode}</p>}
                    {!e.address1 && !e.postcode && <span className="text-slate-400">—</span>}
                  </td>
                  <td className="p-3 text-xs text-slate-600">
                    {e.reason || <span className="text-slate-400">—</span>}
                    {e.source_order_number && <p className="font-mono text-[10px] text-slate-400 mt-1">from {e.source_order_number}</p>}
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${e.hits ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-600'}`} data-testid={`block-hits-${e.id}`}>{e.hits || 0}</span>
                    {e.last_hit_at && <p className="text-[10px] text-slate-400 mt-1">last {new Date(e.last_hit_at).toLocaleString()}</p>}
                  </td>
                  <td className="p-3 text-xs">{new Date(e.created_at).toLocaleDateString()}</td>
                  <td className="p-3 text-right">
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(e)} disabled={deletingId === e.id}
                      title="Remove block" data-testid={`unblock-${e.id}`} className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 w-8">
                      {deletingId === e.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </td>
                </tr>
              ))}
              {entries.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-slate-500">No blocked customers.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default CustomerBlocklist;
