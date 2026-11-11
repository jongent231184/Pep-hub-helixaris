import React, { useEffect, useState } from 'react';
import { Coaches } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { useToast } from '../../hooks/use-toast';
import TierCards from '../../components/coaching/TierCards';
import ResourcesManager from '../../components/coaching/ResourcesManager';
import { Loader2 } from 'lucide-react';

const MODULES = [
  ['plan', 'Protocol & calendar'], ['messages', 'Messaging'], ['checkin', 'Weekly check-in'],
  ['progress', 'Progress charts'], ['supplements', 'Supplement plan'], ['resources', 'Resources library'], ['video_call', 'Monthly video call'],
];

const AdminCoachingPlans = () => {
  const { toast } = useToast();
  const [plans, setPlans] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Coaches.plans().then(setPlans).catch(() => setPlans([]));
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

      <ResourcesManager />
    </div>
  );
};

export default AdminCoachingPlans;
