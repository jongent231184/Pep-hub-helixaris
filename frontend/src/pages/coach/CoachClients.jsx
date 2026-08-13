import React, { useEffect, useState } from 'react';
import { Coaches } from '../../lib/api';
import { Loader2, Mail, UserX, Users } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { useToast } from '../../hooks/use-toast';

const AREA_LABEL = { weightloss: 'Weight loss', peptide_info: 'Peptide Information', dosage_guide: 'Dosage Guide', how_to_guide: 'How-to Guide' };

const CoachClients = () => {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Coaches.clients().then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const deactivate = async (c) => {
    if (!window.confirm(`Archive ${c.customer_name} as a client? This does not delete them — you can re-accept a future request.`)) return;
    try {
      await Coaches.deactivateClient(c.id);
      setItems(prev => prev.filter(x => x.id !== c.id));
      toast({ title: 'Client archived' });
    } catch (err) {
      toast({ title: 'Archive failed', description: String(err.response?.data?.detail || err.message), variant: 'destructive' });
    }
  };

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-black uppercase mb-4">Clients</h1>
      <p className="text-sm text-slate-600 mb-6">People you&apos;ve accepted for coaching. Protocol builder + calendar coming in the next release.</p>

      {loading ? (
        <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>
      ) : items.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 rounded-lg p-12 text-center">
          <Users className="h-10 w-10 mx-auto text-slate-300 mb-3" strokeWidth={1.2} />
          <p className="text-slate-600 font-semibold">No active clients yet.</p>
          <p className="text-sm text-slate-500 mt-1">Accept a request from the Requests tab to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map(c => (
            <article key={c.id} className="bg-white border border-slate-200 rounded-xl p-5" data-testid={`client-card-${c.id}`}>
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">Client since {new Date(c.started_at).toLocaleDateString('en-GB')}</p>
              <h3 className="text-lg font-black">{c.customer_name}</h3>
              <p className="text-xs text-slate-500 mt-1"><strong>Area:</strong> {AREA_LABEL[c.area] || c.area || '—'}</p>
              <a href={`mailto:${c.customer_email}`} className="inline-flex items-center gap-1 text-sm text-sky-600 hover:underline mt-3"><Mail className="h-3.5 w-3.5" /> {c.customer_email}</a>
              <div className="mt-4 pt-4 border-t flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-widest text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded">Active</span>
                <button onClick={() => deactivate(c)} className="text-xs text-red-600 hover:underline inline-flex items-center gap-1">
                  <UserX className="h-3.5 w-3.5" /> Archive
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

export default CoachClients;
