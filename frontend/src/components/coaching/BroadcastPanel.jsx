import React, { useEffect, useState } from 'react';
import { Coaches } from '../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { useToast } from '../../hooks/use-toast';
import { Megaphone, Trash2, Pin, Loader2 } from 'lucide-react';

const BroadcastPanel = () => {
  const { toast } = useToast();
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ title: '', body: '', pinned: false });
  const [busy, setBusy] = useState(false);
  const load = () => Coaches.coachBroadcasts().then(setList).catch(() => {});
  useEffect(() => { load(); }, []);

  const post = async () => {
    if (!form.title.trim()) return;
    setBusy(true);
    try {
      await Coaches.postBroadcast(form);
      setForm({ title: '', body: '', pinned: false });
      toast({ title: 'Announcement posted', description: 'It now shows on every active client dashboard.' });
      load();
    } catch (e) { toast({ title: 'Could not post', description: String(e.response?.data?.detail || e.message), variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  const del = async (id) => { await Coaches.deleteBroadcast(id); setList(l => l.filter(b => b.id !== id)); };

  return (
    <section className="bg-white border rounded-xl p-6" data-testid="broadcast-panel">
      <h2 className="text-xs uppercase tracking-widest text-slate-500 font-bold mb-1 flex items-center gap-2"><Megaphone className="h-4 w-4" /> Announcement to all clients</h2>
      <p className="text-xs text-slate-500 mb-4">Appears at the top of every active member's portal dashboard. Pin one to keep it above newer posts.</p>
      <div className="grid gap-2">
        <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Title — e.g. Away 20–24 Nov, replies may be slower" data-testid="broadcast-title" />
        <Textarea rows={3} value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} placeholder="Details (optional)" data-testid="broadcast-body" />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.pinned} onChange={e => setForm(f => ({ ...f, pinned: e.target.checked }))} data-testid="broadcast-pinned" /> Pin to top</label>
          <Button onClick={post} disabled={busy || !form.title.trim()} className="bg-sky-500 hover:bg-sky-600 text-white gap-2" data-testid="broadcast-post-btn">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />} Post to all clients</Button>
        </div>
      </div>
      {list.length > 0 && (
        <ul className="mt-5 divide-y">
          {list.map(b => (
            <li key={b.id} className="py-3 flex items-start justify-between gap-3" data-testid={`coach-broadcast-${b.id}`}>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 flex items-center gap-1.5">{b.pinned && <Pin className="h-3.5 w-3.5 text-amber-600" />}{b.title}</p>
                {b.body && <p className="text-xs text-slate-600 mt-0.5 whitespace-pre-wrap">{b.body}</p>}
                <p className="text-[10px] text-slate-400 mt-1">{new Date(b.created_at).toLocaleString('en-GB')}</p>
              </div>
              <button onClick={() => del(b.id)} className="text-red-600 shrink-0" title="Remove" data-testid={`broadcast-delete-${b.id}`}><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default BroadcastPanel;
