import React, { useEffect, useMemo, useState } from 'react';
import { Coaches } from '../../lib/api';
import { Loader2, Mail, Phone, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { useToast } from '../../hooks/use-toast';

const AREA_LABEL = { weightloss: 'Weight loss', peptide_info: 'Peptide Information', dosage_guide: 'Dosage Guide', how_to_guide: 'How-to Guide' };
const STATUS_META = {
  new: { label: 'New', class: 'bg-sky-100 text-sky-800', icon: Clock },
  accepted: { label: 'Accepted', class: 'bg-emerald-100 text-emerald-800', icon: CheckCircle2 },
  declined: { label: 'Declined', class: 'bg-slate-200 text-slate-700', icon: XCircle },
  completed: { label: 'Completed', class: 'bg-indigo-100 text-indigo-800', icon: CheckCircle2 },
};

const CoachRequests = () => {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('new');
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    setLoading(true);
    Coaches.requests().then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(
    () => (statusFilter === 'all' ? items : items.filter(i => i.status === statusFilter)),
    [items, statusFilter]
  );
  const counts = useMemo(() => {
    const c = { all: items.length, new: 0, accepted: 0, declined: 0, completed: 0 };
    items.forEach(i => { c[i.status] = (c[i.status] || 0) + 1; });
    return c;
  }, [items]);

  const changeStatus = async (id, status) => {
    setBusyId(id);
    try {
      const updated = await Coaches.updateRequest(id, { status });
      setItems(prev => prev.map(x => x.id === id ? updated : x));
      toast({ title: `Marked ${STATUS_META[status].label.toLowerCase()}` });
    } catch (err) {
      toast({ title: 'Update failed', description: String(err.response?.data?.detail || err.message), variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const filters = [
    { key: 'new', label: 'New', count: counts.new },
    { key: 'accepted', label: 'Accepted', count: counts.accepted },
    { key: 'declined', label: 'Declined', count: counts.declined },
    { key: 'completed', label: 'Completed', count: counts.completed },
    { key: 'all', label: 'All', count: counts.all },
  ];

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-black uppercase mb-4">Requests</h1>
      <p className="text-sm text-slate-600 mb-6">People asking for coaching. Accepting a request adds them as a client.</p>

      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 mb-6 w-fit flex-wrap">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest transition-colors ${
              statusFilter === f.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
            }`}
            data-testid={`coach-filter-${f.key}`}
          >
            {f.label} <span className="text-slate-400 font-normal ml-1">{f.count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 rounded-lg p-12 text-center text-slate-500">
          No {statusFilter !== 'all' ? statusFilter : ''} requests.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => {
            const meta = STATUS_META[r.status] || STATUS_META.new;
            const busy = busyId === r.id;
            return (
              <article key={r.id} className="bg-white border border-slate-200 rounded-xl p-5" data-testid={`coach-req-${r.id}`}>
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold text-[10px] uppercase tracking-wider ${meta.class}`}>
                        <meta.icon className="h-3 w-3" /> {meta.label}
                      </span>
                      <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                        {new Date(r.created_at).toLocaleDateString('en-GB')}
                      </span>
                    </div>
                    <h3 className="text-lg font-black">{r.first_name} {r.last_name}</h3>
                    <p className="text-xs text-slate-600 mt-1"><strong>Area:</strong> {AREA_LABEL[r.area] || r.area}</p>
                    <div className="flex flex-wrap gap-4 mt-2 text-xs">
                      <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1 text-sky-600 hover:underline"><Mail className="h-3 w-3" />{r.email}</a>
                      {r.phone && <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 text-slate-700 hover:underline"><Phone className="h-3 w-3" />{r.phone}</a>}
                    </div>
                    {r.message && (
                      <div className="mt-3 p-3 bg-slate-50 rounded text-sm text-slate-700 whitespace-pre-wrap">{r.message}</div>
                    )}
                  </div>
                  <div className="flex md:flex-col gap-2 md:min-w-[160px]">
                    {r.status === 'new' && (
                      <>
                        <Button onClick={() => changeStatus(r.id, 'accepted')} disabled={busy}
                          className="bg-emerald-500 hover:bg-emerald-600 text-white gap-1 flex-1" data-testid={`accept-${r.id}`}>
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Accept
                        </Button>
                        <Button onClick={() => changeStatus(r.id, 'declined')} disabled={busy} variant="outline" className="flex-1 gap-1">
                          <XCircle className="h-4 w-4" /> Decline
                        </Button>
                      </>
                    )}
                    {r.status === 'accepted' && (
                      <Button onClick={() => changeStatus(r.id, 'completed')} disabled={busy} className="bg-indigo-500 hover:bg-indigo-600 text-white gap-1">
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Mark completed
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CoachRequests;
