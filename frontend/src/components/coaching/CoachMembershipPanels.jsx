import React, { useEffect, useState } from 'react';
import { Coaches } from '../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { useToast } from '../../hooks/use-toast';
import { TierBadge } from './TierCards';
import { Loader2, Copy, Mail, CheckCircle2, Clock } from 'lucide-react';

export const MembershipPanel = ({ clientId }) => {
  const { toast } = useToast();
  const [m, setM] = useState(null);
  const [plans, setPlans] = useState([]);
  const [tier, setTier] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => Coaches.coachMembership(clientId).then(setM).catch(() => {});
  useEffect(() => { load(); Coaches.plans().then(setPlans).catch(() => {}); }, [clientId]);
  useEffect(() => {
    if (m && !tier) {
      const t = m.tier || 'bronze';
      setTier(t);
      const p = plans.find(x => x.tier === t);
      if (p) setPrice(String(Number(p.price_monthly).toFixed(2)));
    }
  }, [m, plans, tier]);

  const pickTier = (t) => {
    setTier(t);
    const p = plans.find(x => x.tier === t);
    if (p) setPrice(String(Number(p.price_monthly).toFixed(2)));
  };

  const send = async (email) => {
    setBusy(true);
    try {
      const res = await Coaches.coachMembershipPaylink(clientId, { tier, price: parseFloat(price), send_email: email });
      try { await navigator.clipboard.writeText(`${window.location.origin}${res.payment_link}`); } catch (_) { /* clipboard optional */ }
      toast({ title: email ? 'Pay link emailed to client · copied' : 'Pay link copied', description: `${res.order_number} · £${Number(res.amount).toFixed(2)} · ${tier}` });
      load();
    } catch (e) {
      toast({ title: 'Could not create pay link', description: String(e.response?.data?.detail || e.message), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const addDays = async (n) => {
    try { setM(await Coaches.coachAdjustMembership(clientId, { add_days: n })); toast({ title: `Added ${n} days` }); } catch (_) { toast({ title: 'Failed', variant: 'destructive' }); }
  };

  if (!m) return <div className="bg-white border rounded-xl p-6"><Loader2 className="h-5 w-5 animate-spin text-sky-500" /></div>;
  return (
    <div className="bg-white border rounded-xl p-6" data-testid="membership-panel">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-black flex items-center gap-2">Membership {m.tier && <TierBadge tier={m.tier} />}</h2>
        {m.active
          ? <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full"><CheckCircle2 className="h-3.5 w-3.5" /> Active · {m.days_left} days left</span>
          : <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-full"><Clock className="h-3.5 w-3.5" /> {m.paid_until ? 'Lapsed' : 'Not started'}</span>}
      </div>
      <p className="text-xs text-slate-500 mt-1">Paid until {m.paid_until ? new Date(m.paid_until).toLocaleDateString('en-GB') : '—'} · Renewal links are emailed automatically 3 days before expiry.</p>

      {m.pending_order && (
        <div className="mt-3 text-xs bg-amber-50 border border-amber-200 rounded p-3 flex items-center justify-between gap-2 flex-wrap" data-testid="pending-membership-order">
          <span>Unpaid link: <strong>{m.pending_order.order_number}</strong> · £{m.pending_order.amount.toFixed(2)} · {m.pending_order.tier}</span>
          <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}${m.pending_order.payment_link}`).then(() => toast({ title: 'Link copied' }))} className="inline-flex items-center gap-1 font-bold text-slate-800"><Copy className="h-3.5 w-3.5" /> Copy</button>
        </div>
      )}

      <div className="mt-4 grid sm:grid-cols-[1fr_120px] gap-3 items-end">
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-1">Tier</p>
          <div className="flex gap-2 flex-wrap">
            {plans.map(p => (
              <button key={p.tier} type="button" onClick={() => pickTier(p.tier)} className={`px-3 py-1.5 rounded-lg border text-sm font-bold capitalize ${tier === p.tier ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-300 hover:border-slate-500'}`} data-testid={`membership-tier-${p.tier}`}>{p.name} · £{Number(p.price_monthly).toFixed(0)}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-1">Price (£/month)</p>
          <Input type="number" step="0.01" min="0.01" value={price} onChange={e => setPrice(e.target.value)} data-testid="membership-price" />
        </div>
      </div>
      <div className="mt-3 flex gap-2 flex-wrap">
        <Button onClick={() => send(true)} disabled={busy || !tier} className="bg-sky-500 hover:bg-sky-600 text-white gap-2" data-testid="send-membership-link-btn">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Email {m.paid_until ? 'renewal' : 'first month'} pay link</Button>
        <Button onClick={() => send(false)} disabled={busy || !tier} variant="outline" className="gap-2" data-testid="copy-membership-link-btn"><Copy className="h-4 w-4" /> Create & copy only</Button>
        <Button onClick={() => addDays(7)} variant="ghost" className="text-xs" data-testid="comp-7-days">+7 days free</Button>
      </div>
      <p className="text-[11px] text-slate-500 mt-2">Creating a new link replaces any unpaid one. Paid months extend access by 30 days from the later of payment date or current expiry.</p>
    </div>
  );
};

export const CheckinsPanel = ({ clientId }) => {
  const { toast } = useToast();
  const [list, setList] = useState([]);
  const [reply, setReply] = useState({});
  const load = () => Coaches.coachCheckins(clientId).then(setList).catch(() => {});
  useEffect(() => { load(); }, [clientId]);
  const save = async (id) => {
    try {
      await Coaches.reviewCheckin(id, { coach_reply: reply[id] || '', reviewed: true });
      toast({ title: 'Reply saved · marked reviewed' });
      setReply(r => ({ ...r, [id]: '' }));
      load();
    } catch (_) { toast({ title: 'Failed', variant: 'destructive' }); }
  };
  return (
    <div className="bg-white border rounded-xl p-6" data-testid="checkins-panel">
      <h2 className="text-lg font-black">Weekly check-ins <span className="text-sm font-semibold text-slate-500">({list.filter(c => !c.reviewed).length} awaiting review)</span></h2>
      {list.length === 0 ? <p className="text-sm text-slate-500 mt-2">No check-ins submitted yet.</p> : (
        <ul className="mt-3 space-y-3">
          {list.map(c => (
            <li key={c.id} className={`border rounded-lg p-4 ${c.reviewed ? '' : 'border-amber-300 bg-amber-50/40'}`} data-testid={`coach-checkin-${c.id}`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="font-bold text-sm">Week ending {new Date(c.week_ending).toLocaleDateString('en-GB')}</p>
                <p className="text-xs text-slate-600">{c.weight_kg ? `${c.weight_kg} kg · ` : ''}Energy {c.energy ?? '–'} · Sleep {c.sleep ?? '–'} · Training {c.training ?? '–'}</p>
              </div>
              {c.notes && <p className="text-sm text-slate-800 mt-2 whitespace-pre-wrap">{c.notes}</p>}
              {c.questions && <p className="text-sm text-slate-700 mt-2"><strong>Questions:</strong> {c.questions}</p>}
              {c.coach_reply && <div className="mt-2 text-sm bg-white border rounded p-2"><strong className="text-xs uppercase tracking-wider text-slate-500">Your reply</strong><p className="mt-1 whitespace-pre-wrap">{c.coach_reply}</p></div>}
              <div className="mt-3 flex gap-2">
                <Textarea rows={2} value={reply[c.id] ?? ''} onChange={e => setReply(r => ({ ...r, [c.id]: e.target.value }))} placeholder={c.reviewed ? 'Update reply…' : 'Reply and mark reviewed…'} data-testid={`checkin-reply-${c.id}`} />
                <Button onClick={() => save(c.id)} className="bg-sky-500 hover:bg-sky-600 text-white self-end" data-testid={`checkin-reply-save-${c.id}`}>Save</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
