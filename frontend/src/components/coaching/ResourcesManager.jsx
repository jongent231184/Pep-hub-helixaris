import React, { useEffect, useState } from 'react';
import { Coaches } from '../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { useToast } from '../../hooks/use-toast';
import { Trash2, Plus } from 'lucide-react';

const ResourcesManager = () => {
  const { toast } = useToast();
  const [resources, setResources] = useState([]);
  const [res, setRes] = useState({ title: '', kind: 'guide', url: '', body: '' });
  useEffect(() => { Coaches.adminResources().then(setResources).catch(() => {}); }, []);

  const add = async () => {
    if (!res.title.trim()) return;
    try { await Coaches.adminAddResource(res); setRes({ title: '', kind: 'guide', url: '', body: '' }); setResources(await Coaches.adminResources()); toast({ title: 'Resource added' }); }
    catch (_) { toast({ title: 'Failed', variant: 'destructive' }); }
  };
  const del = async (id) => { await Coaches.adminDeleteResource(id); setResources(r => r.filter(x => x.id !== id)); };

  return (
    <div className="bg-white border rounded-xl p-5" data-testid="resources-admin">
      <h2 className="text-lg font-black">Resources library <span className="text-sm font-semibold text-slate-500">(shown to Gold members)</span></h2>
      <div className="grid md:grid-cols-[1fr_120px_1fr_auto] gap-2 mt-3">
        <Input value={res.title} onChange={e => setRes(r => ({ ...r, title: e.target.value }))} placeholder="Title" data-testid="resource-title" />
        <select value={res.kind} onChange={e => setRes(r => ({ ...r, kind: e.target.value }))} className="border rounded-md px-2 text-sm bg-white" data-testid="resource-kind"><option value="guide">Guide</option><option value="video">Video</option><option value="faq">FAQ</option></select>
        <Input value={res.url} onChange={e => setRes(r => ({ ...r, url: e.target.value }))} placeholder="Link (optional)" data-testid="resource-url" />
        <Button onClick={add} className="bg-slate-900 text-white gap-1" data-testid="resource-add-btn"><Plus className="h-4 w-4" /> Add</Button>
      </div>
      <Textarea rows={2} value={res.body} onChange={e => setRes(r => ({ ...r, body: e.target.value }))} placeholder="Short description or the FAQ answer" className="mt-2" data-testid="resource-body" />
      <ul className="mt-4 divide-y">
        {resources.map(r => (
          <li key={r.id} className="py-2 flex items-center justify-between gap-3 text-sm">
            <span><span className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mr-2">{r.kind}</span><strong>{r.title}</strong>{r.url && <span className="text-slate-500"> · {r.url}</span>}</span>
            <button onClick={() => del(r.id)} className="text-red-600" data-testid={`resource-delete-${r.id}`}><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
        {resources.length === 0 && <li className="py-2 text-sm text-slate-500">No resources yet.</li>}
      </ul>
    </div>
  );
};

export default ResourcesManager;
