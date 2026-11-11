import React, { useEffect, useState } from 'react';
import { Coaches } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { useToast } from '../../hooks/use-toast';
import TierCards from '../../components/coaching/TierCards';
import { Loader2, Trash2, Plus } from 'lucide-react';

const MODULES = [
  ['plan', 'Protocol & calendar'], ['messages', 'Messaging'], ['checkin', 'Weekly check-in'],
  ['progress', 'Progress charts'], ['supplements', 'Supplement plan'], ['resources', 'Resources library'], ['video_call', 'Monthly video call'],
];

const AdminCoachingPlans = () => {
  const { toast } = useToast();
  const [plans, setPlans] = useState(null);
  const [saving, setSaving] = useState(false);
  const [resources, setResources] = useState([]);
  const [res, setRes] = useState({ title: '', kind: 'guide', url: '', body: '' });

  useEffect(() => {
    Coaches.plans().then(setPlans).catch(() => setPlans([]));
    Coaches.adminResources().then(setResources).catch(() => {});
  }, []);

  const upd = (i, patch) => setPlans(ps => ps.map((p, j) => j === i ? { ...p, ...patch } : p));
  const save = async () => {
    setSaving(true);
    try {
      const payload = plans.map(p => ({ tier: p.tier, name: p.name, price_monthly: Number(p.price_monthly), tagline: p.tagline || '', features: (p.features || []).filter(Boolean), modules: p.modules || [] }));
      setPlans(await Coaches.adminSavePlans(payload));
      toast({ title: 'Plans saved' });
    } catch (e) {
      toast({ title: 'Save failed', description: String(e.response?.data?.detail || e.message), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const addRes = async () => {
    if (!res.title.trim()) return;
    try { await Coaches.adminAddResource(res); setRes({ title: '', kind: 'guide', url: '', body: '' }); setResources(await Coaches.adminResources()); toast({ title: 'Resource added' }); }
    catch (_) { toast({ title: 'Failed', variant: 'destructive' }); }
  };
  const delRes = async (id) => { await Coaches.adminDeleteResource(id); setResources(r => r.filter(x => x.id !== id)); };

  if (!plans) return <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>;

  return (
    <div className="space-y-8" data-testid="admin-coaching-plans">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black">Coaching plans</h1>
          <p className="text-sm text-slate-600">Monthly tiers shown on the Coaching page. Each tier includes everything from the one below it — list only what's new.</p>
        </div>
        <Button onClick={save} disabled={saving} className="bg-sky-500 hover:bg-sky-600 text-white" data-testid="save-plans-btn">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save plans'}</Button>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {plans.map((p, i) => (
          <div key={p.tier} className="bg-white border rounded-xl p-5 space-y-3" data-testid={`plan-editor-${p.tier}`}>
            <p className="text-xs uppercase tracking-widest font-bold text-slate-500">{p.tier}</p>
            <Input value={p.name} onChange={e => upd(i, { name: e.target.value })} placeholder="Display name" data-testid={`plan-name-${p.tier}`} />
            <div className="flex items-center gap-2"><span className="text-sm font-bold">£</span><Input type="number" step="1" min="1" value={p.price_monthly} onChange={e => upd(i, { price_monthly: e.target.value })} data-testid={`plan-price-${p.tier}`} /><span className="text-xs text-slate-500">/ month</span></div>
            <Input value={p.tagline || ''} onChange={e => upd(i, { tagline: e.target.value })} placeholder="One-line tagline" />
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-1">What's new at this tier (one per line)</p>
              <Textarea rows={5} value={(p.features || []).join('\n')} onChange={e => upd(i, { features: e.target.value.split('\n') })} data-testid={`plan-features-${p.tier}`} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-1">Portal modules unlocked</p>
              <div className="grid grid-cols-1 gap-1">
                {MODULES.map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={(p.modules || []).includes(k)} onChange={e => upd(i, { modules: e.target.checked ? [...(p.modules || []), k] : (p.modules || []).filter(x => x !== k) })} data-testid={`plan-module-${p.tier}-${k}`} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-lg font-black mb-3">Preview (as customers see it)</h2>
        <TierCards plans={plans.map(p => ({ ...p, features: (p.features || []).filter(Boolean) }))} />
      </div>

      <div className="bg-white border rounded-xl p-5" data-testid="resources-admin">
        <h2 className="text-lg font-black">Resources library <span className="text-sm font-semibold text-slate-500">(Gold portal)</span></h2>
        <div className="grid md:grid-cols-[1fr_120px_1fr_auto] gap-2 mt-3">
          <Input value={res.title} onChange={e => setRes(r => ({ ...r, title: e.target.value }))} placeholder="Title" data-testid="resource-title" />
          <select value={res.kind} onChange={e => setRes(r => ({ ...r, kind: e.target.value }))} className="border rounded-md px-2 text-sm bg-white"><option value="guide">Guide</option><option value="video">Video</option><option value="faq">FAQ</option></select>
          <Input value={res.url} onChange={e => setRes(r => ({ ...r, url: e.target.value }))} placeholder="Link (optional)" />
          <Button onClick={addRes} className="bg-slate-900 text-white gap-1" data-testid="resource-add-btn"><Plus className="h-4 w-4" /> Add</Button>
        </div>
        <Textarea rows={2} value={res.body} onChange={e => setRes(r => ({ ...r, body: e.target.value }))} placeholder="Short description or the FAQ answer" className="mt-2" />
        <ul className="mt-4 divide-y">
          {resources.map(r => (
            <li key={r.id} className="py-2 flex items-center justify-between gap-3 text-sm">
              <span><span className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mr-2">{r.kind}</span><strong>{r.title}</strong>{r.url && <span className="text-slate-500"> · {r.url}</span>}</span>
              <button onClick={() => delRes(r.id)} className="text-red-600" data-testid={`resource-delete-${r.id}`}><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
          {resources.length === 0 && <li className="py-2 text-sm text-slate-500">No resources yet.</li>}
        </ul>
      </div>
    </div>
  );
};

export default AdminCoachingPlans;
