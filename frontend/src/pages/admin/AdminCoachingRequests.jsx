import React, { useEffect, useMemo, useState } from 'react';
import { Coaching } from '../../lib/api';
import { Loader2, Trash2, Mail, Phone, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import { useToast } from '../../hooks/use-toast';

const AREA_LABEL = {
  weightloss: 'Weight loss',
  peptide_info: 'Peptide Information',
  dosage_guide: 'Dosage Guide',
  how_to_guide: 'How-to Guide',
};

const STATUS_META = {
  new: { label: 'New', class: 'bg-sky-100 text-sky-800', icon: Clock },
  accepted: { label: 'Accepted', class: 'bg-emerald-100 text-emerald-800', icon: CheckCircle2 },
  declined: { label: 'Declined', class: 'bg-slate-200 text-slate-700', icon: XCircle },
  completed: { label: 'Completed', class: 'bg-indigo-100 text-indigo-800', icon: CheckCircle2 },
};

const AdminCoachingRequests = () => {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  const load = () => {
    setLoading(true);
    Coaching.adminList().then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (selected) setNotesDraft(selected.admin_notes || '');
  }, [selected]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return items;
    return items.filter(i => i.status === statusFilter);
  }, [items, statusFilter]);

  const counts = useMemo(() => {
    const c = { all: items.length, new: 0, accepted: 0, declined: 0, completed: 0 };
    items.forEach(i => { c[i.status] = (c[i.status] || 0) + 1; });
    return c;
  }, [items]);

  const updateStatus = async (req, status) => {
    try {
      const updated = await Coaching.adminUpdate(req.id, { status });
      setItems(prev => prev.map(x => x.id === req.id ? updated : x));
      if (selected?.id === req.id) setSelected(updated);
      toast({ title: `Marked ${STATUS_META[status].label.toLowerCase()}` });
    } catch (err) {
      toast({ title: 'Update failed', description: String(err.response?.data?.detail || err.message), variant: 'destructive' });
    }
  };

  const saveNotes = async () => {
    if (!selected) return;
    setSavingNotes(true);
    try {
      const updated = await Coaching.adminUpdate(selected.id, { admin_notes: notesDraft });
      setItems(prev => prev.map(x => x.id === selected.id ? updated : x));
      setSelected(updated);
      toast({ title: 'Notes saved' });
    } catch (err) {
      toast({ title: 'Save failed', description: String(err.response?.data?.detail || err.message), variant: 'destructive' });
    } finally {
      setSavingNotes(false);
    }
  };

  const remove = async (req) => {
    if (!window.confirm(`Delete request from ${req.first_name} ${req.last_name}? This cannot be undone.`)) return;
    try {
      await Coaching.adminRemove(req.id);
      setItems(prev => prev.filter(x => x.id !== req.id));
      if (selected?.id === req.id) setSelected(null);
      toast({ title: 'Request deleted' });
    } catch (err) {
      toast({ title: 'Delete failed', description: String(err.response?.data?.detail || err.message), variant: 'destructive' });
    }
  };

  const filters = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'new', label: 'New', count: counts.new || 0 },
    { key: 'accepted', label: 'Accepted', count: counts.accepted || 0 },
    { key: 'declined', label: 'Declined', count: counts.declined || 0 },
    { key: 'completed', label: 'Completed', count: counts.completed || 0 },
  ];

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-black uppercase mb-6">Coaching Requests</h1>

      {/* Filters */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 mb-4 w-fit flex-wrap">
        {filters.map(f => (
          <button
            key={f.key}
            type="button"
            onClick={() => setStatusFilter(f.key)}
            className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest transition-colors ${
              statusFilter === f.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
            }`}
            data-testid={`coaching-filter-${f.key}`}
          >
            {f.label} <span className="text-slate-400 font-normal ml-1">{f.count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 rounded-lg p-12 text-center">
          <p className="text-slate-600 font-semibold">No {statusFilter !== 'all' ? statusFilter : ''} requests yet.</p>
          <p className="text-sm text-slate-500 mt-1">Requests submitted at /coaching will appear here.</p>
        </div>
      ) : (
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-slate-50 text-slate-600 uppercase text-xs">
              <tr>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Received</th>
                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-left">Contact</th>
                <th className="p-3 text-left">Area</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(r => {
                const meta = STATUS_META[r.status] || STATUS_META.new;
                return (
                  <tr key={r.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setSelected(r)} data-testid={`coaching-row-${r.id}`}>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold text-[10px] uppercase tracking-wider ${meta.class}`}>
                        <meta.icon className="h-3 w-3" /> {meta.label}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-slate-600">{new Date(r.created_at).toLocaleDateString('en-GB')}</td>
                    <td className="p-3">
                      <p className="font-semibold text-slate-900">{r.first_name} {r.last_name}</p>
                    </td>
                    <td className="p-3 text-xs">
                      <p><Mail className="h-3 w-3 inline mr-1 text-slate-400" />{r.email}</p>
                      {r.phone && <p><Phone className="h-3 w-3 inline mr-1 text-slate-400" />{r.phone}</p>}
                    </td>
                    <td className="p-3 text-xs font-semibold">{AREA_LABEL[r.area] || r.area}</td>
                    <td className="p-3 text-right">
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); remove(r); }} className="h-8 w-8 text-red-600 hover:bg-red-50">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-end" onClick={() => setSelected(null)}>
          <aside
            onClick={e => e.stopPropagation()}
            className="w-full max-w-lg bg-white h-full overflow-y-auto shadow-2xl"
            data-testid="coaching-detail"
          >
            <div className="sticky top-0 bg-white border-b p-5 flex items-start justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-sky-600 font-bold">Coaching request</p>
                <h2 className="text-2xl font-black">{selected.first_name} {selected.last_name}</h2>
                <p className="text-xs text-slate-500 mt-1">{new Date(selected.created_at).toLocaleString('en-GB')}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelected(null)}>✕</Button>
            </div>

            <div className="p-5 space-y-6">
              {/* Status changer */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Status</p>
                <Select value={selected.status} onValueChange={(v) => updateStatus(selected, v)}>
                  <SelectTrigger data-testid="coaching-status-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['new', 'accepted', 'declined', 'completed'].map(s => (
                      <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Contact block */}
              <div className="border rounded-lg p-4 space-y-2 text-sm">
                <p><span className="text-slate-500 mr-2">Email:</span><a href={`mailto:${selected.email}`} className="text-sky-600 font-semibold hover:underline">{selected.email}</a></p>
                {selected.phone && <p><span className="text-slate-500 mr-2">Phone:</span><a href={`tel:${selected.phone}`} className="font-semibold hover:underline">{selected.phone}</a></p>}
                <p><span className="text-slate-500 mr-2">Area:</span><strong>{AREA_LABEL[selected.area] || selected.area}</strong></p>
              </div>

              {/* Their message */}
              {selected.message && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Their message</p>
                  <div className="bg-slate-50 border rounded-lg p-3 text-sm whitespace-pre-wrap">{selected.message}</div>
                </div>
              )}

              {/* Waiver */}
              <div className="border border-emerald-200 bg-emerald-50 rounded-lg p-3 text-xs text-emerald-900 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Waiver accepted at submission — peer education only, not medical advice.</span>
              </div>

              {/* Admin notes */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Internal notes</p>
                <Textarea
                  rows={5}
                  value={notesDraft}
                  onChange={e => setNotesDraft(e.target.value)}
                  placeholder="Notes for the coach or admin — not visible to the client."
                  data-testid="coaching-notes"
                />
                <Button onClick={saveNotes} disabled={savingNotes} className="mt-2 bg-sky-500 hover:bg-sky-600 text-white gap-2" size="sm">
                  {savingNotes && <Loader2 className="h-3 w-3 animate-spin" />}Save notes
                </Button>
              </div>

              <div className="border-t pt-4 flex justify-between">
                <a href={`mailto:${selected.email}?subject=Your%20GHP-Health%20coaching%20request`} className="inline-flex items-center gap-2 text-sm text-sky-600 hover:underline">
                  <Mail className="h-4 w-4" /> Reply by email
                </a>
                <Button variant="outline" onClick={() => remove(selected)} className="text-red-600 gap-2 border-red-200 hover:bg-red-50">
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};

export default AdminCoachingRequests;
