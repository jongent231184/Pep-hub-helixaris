import React, { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PortalContext } from './PortalLayout';
import { PortalHeader, Card, LockedModule } from './PortalDashboard';
import MyCoaching from '../../components/MyCoaching';
import CoachMessages from '../../components/coaching/CoachMessages';
import WeighInPanel from '../../components/WeighInPanel';
import { PhotosPanel } from '../../components/coaching/PhotosAndCertificates';
import { Coaches } from '../../lib/api';
import { toast } from 'sonner';
import BRAND from '../../config/brand';
import { Loader2, Send, CheckCircle2, Clock, FileText, PlayCircle, HelpCircle, ExternalLink } from 'lucide-react';

const PLAN_TABS = [['overview', 'Overview'], ['supplements', 'Supplements'], ['peptides', 'Peptide plan'], ['checkin', 'Check-in']];

const Progress = ({ pct }) => (
  <div className="h-2 rounded-full bg-slate-200 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: BRAND.accent }} /></div>
);

export const PortalPlan = () => {
  const { has, plans, membership, src, base } = useContext(PortalContext);
  const [proto, setProto] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get('tab') || 'overview');
  useEffect(() => { src.protocol().then(setProto).catch(() => {}).finally(() => setLoaded(true)); }, [src]);
  const protoProps = { hideMessages: true, hideWeighIns: true, protoOverride: src.coachView ? (proto || { none: true }) : undefined, readOnly: src.readOnly };

  const today = new Date().toISOString().slice(0, 10);
  const cal = proto?.calendar || [];
  const past = cal.filter(e => e.date <= today);
  const adherence = past.length ? Math.round(100 * past.filter(e => e.done).length / past.length) : null;
  const start = proto?.created_at ? new Date(proto.created_at) : null;
  const weeksIn = start ? Math.min(proto.duration_weeks || 0, Math.max(0, Math.floor((Date.now() - start) / (7 * 86400000)) + 1)) : 0;
  const peptides = (proto?.items || []).filter(i => (i.kind || 'peptide') !== 'supplement');
  const supps = (proto?.items || []).filter(i => i.kind === 'supplement');
  const todays = cal.filter(e => e.date === today);

  return (
    <div data-testid="portal-plan">
      <PortalHeader title="My plan" sub="Your personalised protocol, supplements, dosing calendar and weekly check-in." />
      <div className="flex gap-1 border-b border-slate-200 mb-6 overflow-x-auto" role="tablist" data-testid="plan-tabs">
        {PLAN_TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`px-4 py-2.5 text-sm font-bold whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === k ? 'border-[#0b1528] text-[#0b1528]' : 'border-transparent text-slate-500 hover:text-slate-800'}`} data-testid={`plan-tab-${k}`}>{label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4" data-testid="plan-overview">
          {loaded && !proto ? <MyCoaching {...protoProps} sections={{ header: true }} /> : proto && (
            <>
              <Card testId="plan-overview-header">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: BRAND.accent }}>Your active protocol</p>
                    <h2 className="text-2xl font-black text-slate-900 mt-1">{proto.title}</h2>
                    <p className="text-sm text-slate-600 mt-1">{proto.duration_weeks} weeks · {peptides.length} peptide{peptides.length === 1 ? '' : 's'} · {supps.length} supplement{supps.length === 1 ? '' : 's'}</p>
                  </div>
                  {proto.next_review_date && <div className="text-sm bg-slate-50 border rounded-lg px-3 py-2"><span className="text-slate-500">Next review</span><br /><strong>{new Date(proto.next_review_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</strong></div>}
                </div>
                <div className="mt-5 grid sm:grid-cols-2 gap-4">
                  <div><div className="flex justify-between text-xs text-slate-600 mb-1"><span>Week {weeksIn} of {proto.duration_weeks}</span><span>{Math.round(100 * weeksIn / (proto.duration_weeks || 1))}%</span></div><Progress pct={100 * weeksIn / (proto.duration_weeks || 1)} /></div>
                  <div><div className="flex justify-between text-xs text-slate-600 mb-1"><span>Doses ticked off to date</span><span>{adherence == null ? '—' : `${adherence}%`}</span></div><Progress pct={adherence || 0} /></div>
                </div>
              </Card>
              <div className="grid lg:grid-cols-2 gap-4">
                <Card title="Today" action={<button onClick={() => setTab('peptides')} className="text-sm font-bold text-slate-700 hover:underline">Open calendar →</button>} testId="plan-today">
                  {todays.length === 0 ? <p className="text-sm text-slate-500">Nothing scheduled today.</p> : (
                    <ul className="space-y-2">{todays.map(e => <li key={e.id} className="flex items-center gap-2 text-sm"><CheckCircle2 className={`h-4 w-4 ${e.done ? 'text-emerald-500' : 'text-slate-300'}`} /><span className={e.done ? 'line-through text-slate-400' : ''}><strong>{e.item_name}</strong>{e.dose && ` · ${e.dose}`}{e.time_of_day && ` · ${e.time_of_day}`}</span>{e.kind === 'supplement' && <span className="text-[9px] uppercase tracking-wider bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">Supp</span>}</li>)}</ul>
                  )}
                </Card>
                <Card title="Coach notes" testId="plan-notes">
                  {proto.notes ? <p className="text-sm text-slate-800 whitespace-pre-wrap">{proto.notes}</p> : <p className="text-sm text-slate-500">No notes yet.</p>}
                  <Link to={`${base}/messages`} className="inline-block mt-3 text-sm font-bold text-slate-700 hover:underline">Message your coach →</Link>
                </Card>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'supplements' && (
        <div className="space-y-4" data-testid="plan-supplements">
          {!has('supplements') ? <LockedModule name="supplements" plans={plans} tier={membership.tier} /> : (
            <>
              {proto?.supplement_plan && <Card title="Coach's supplement guidance" testId="supplement-plan"><p className="text-sm text-slate-800 whitespace-pre-wrap">{proto.supplement_plan}</p></Card>}
              <MyCoaching {...protoProps} sections={{ items: true }} itemKind="supplement" />
            </>
          )}
        </div>
      )}

      {tab === 'peptides' && (
        <div data-testid="plan-peptides">
          <MyCoaching {...protoProps} sections={{ items: true, calendar: true }} itemKind="peptide" />
        </div>
      )}

      {tab === 'checkin' && <div data-testid="plan-checkin"><PortalCheckin embedded /></div>}
    </div>
  );
};

const RATINGS = [['energy', 'Energy'], ['sleep', 'Sleep quality'], ['training', 'Training & recovery']];

export const PortalCheckin = ({ embedded = false }) => {
  const { has, plans, membership, src } = useContext(PortalContext);
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(false);
  const sunday = (() => { const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); return d.toISOString().slice(0, 10); })();
  const [form, setForm] = useState({ week_ending: sunday, weight_kg: '', energy: '', sleep: '', training: '', notes: '', questions: '' });
  const load = () => src.checkins().then(setList).catch(() => {});
  useEffect(() => { if (has('checkin')) load(); }, [has, src]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!has('checkin')) return <><PortalHeader title="Weekly check-in" /><LockedModule name="checkin" plans={plans} tier={membership.tier} /></>;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await src.submitCheckin({
        week_ending: form.week_ending,
        weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
        energy: form.energy ? Number(form.energy) : null,
        sleep: form.sleep ? Number(form.sleep) : null,
        training: form.training ? Number(form.training) : null,
        notes: form.notes, questions: form.questions,
      });
      toast.success('Check-in sent to your coach');
      setForm(f => ({ ...f, weight_kg: '', energy: '', sleep: '', training: '', notes: '', questions: '' }));
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not submit check-in');
    } finally { setBusy(false); }
  };

  return (
    <div data-testid="portal-checkin">
      {!embedded && <PortalHeader title="Weekly check-in" sub="Takes two minutes. Your coach reviews it and replies in the portal." />}
      <div className="grid lg:grid-cols-[1fr_1fr] gap-4">
        <Card title="This week" testId="checkin-form-card">
          {src.readOnly && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 mb-3" data-testid="coach-readonly-note">Coach view — only the client can submit a check-in. Reply from their client page.</p>}
          <form onSubmit={submit} className={`space-y-4 ${src.readOnly ? 'opacity-50 pointer-events-none' : ''}`}>
            <label className="block text-sm"><span className="font-semibold text-slate-700">Week ending</span>
              <input type="date" value={form.week_ending} onChange={e => setForm(f => ({ ...f, week_ending: e.target.value }))} className="mt-1 w-full border rounded-lg px-3 py-2" data-testid="checkin-week" required /></label>
            <label className="block text-sm"><span className="font-semibold text-slate-700">Weight <span className="text-slate-400 font-normal">(optional, kg)</span></span>
              <input type="number" step="0.1" min="20" max="400" value={form.weight_kg} onChange={e => setForm(f => ({ ...f, weight_kg: e.target.value }))} placeholder="kg" className="mt-1 w-full border rounded-lg px-3 py-2" data-testid="checkin-weight" /></label>
            {RATINGS.map(([k, label]) => (
              <label key={k} className="block text-sm"><span className="font-semibold text-slate-700">{label} (1–10)</span>
                <select value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} className="mt-1 w-full border rounded-lg px-3 py-2 bg-white" data-testid={`checkin-${k}`}>
                  <option value="">Select rating…</option>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
                </select></label>
            ))}
            <label className="block text-sm"><span className="font-semibold text-slate-700">How has your week been?</span>
              <textarea rows={4} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Share a brief update on how you're feeling, your progress, and anything else you'd like your coach to know…" className="mt-1 w-full border rounded-lg px-3 py-2" data-testid="checkin-notes" /></label>
            <label className="block text-sm"><span className="font-semibold text-slate-700">Questions for your coach <span className="text-slate-400 font-normal">(optional)</span></span>
              <textarea rows={2} value={form.questions} onChange={e => setForm(f => ({ ...f, questions: e.target.value }))} className="mt-1 w-full border rounded-lg px-3 py-2" data-testid="checkin-questions" /></label>
            <button type="submit" disabled={busy} className="w-full inline-flex items-center justify-center gap-2 font-bold uppercase tracking-wider text-sm py-3 rounded-lg text-[#0b1528] disabled:opacity-60" style={{ backgroundColor: BRAND.accent }} data-testid="checkin-submit">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit check-in
            </button>
          </form>
        </Card>
        <Card title="Previous check-ins" testId="checkin-history">
          {list.length === 0 ? <p className="text-sm text-slate-500">No check-ins yet.</p> : (
            <ul className="space-y-3">
              {list.map(c => (
                <li key={c.id} className="border rounded-xl p-4" data-testid={`checkin-${c.id}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-slate-900 text-sm">Week ending {new Date(c.week_ending).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                    {c.reviewed ? <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle2 className="h-3 w-3" /> Coach reviewed</span>
                      : <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full"><Clock className="h-3 w-3" /> Awaiting review</span>}
                  </div>
                  <p className="text-xs text-slate-600 mt-2">{c.weight_kg ? `${c.weight_kg} kg · ` : ''}Energy {c.energy ?? '–'} · Sleep {c.sleep ?? '–'} · Training {c.training ?? '–'}</p>
                  {c.notes && <p className="text-sm text-slate-800 mt-2 whitespace-pre-wrap">{c.notes}</p>}
                  {c.coach_reply && <div className="mt-3 p-3 rounded-lg bg-slate-50 border text-sm text-slate-800"><p className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1">Coach reply</p>{c.coach_reply}</div>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
};

const Bars = ({ data, k, label, color }) => (
  <div>
    <p className="text-xs uppercase tracking-widest font-bold text-slate-500 mb-2">{label}</p>
    <div className="flex items-end gap-1.5 h-24">
      {data.map(c => (
        <div key={c.id} className="flex-1 h-full flex flex-col justify-end items-center gap-1" title={`${c.week_ending}: ${c[k] ?? '–'}`}>
          <div className="w-full rounded-t" style={{ height: `${((c[k] || 0) / 10) * 100}%`, backgroundColor: color, minHeight: c[k] ? 4 : 0 }} />
        </div>
      ))}
    </div>
  </div>
);

export const PortalProgress = () => {
  const { has, plans, membership, src } = useContext(PortalContext);
  const [list, setList] = useState([]);
  useEffect(() => { if (has('checkin')) src.checkins().then(l => setList([...l].reverse().slice(-12))).catch(() => {}); }, [has, src]);
  if (!has('progress')) return <><PortalHeader title="Progress" /><LockedModule name="progress" plans={plans} tier={membership.tier} /></>;
  return (
    <div data-testid="portal-progress">
      <PortalHeader title="Progress" sub="Weight trend plus how you've rated each week." />
      <div className="space-y-4">
        <WeighInPanel readOnly={src.readOnly} coachFetch={src.weighIns} />
        <Card title="Progress photos" testId="photos-card">
          <PhotosPanel readOnly={src.readOnly} showCompare fetchPhotos={src.coachView ? () => Coaches.coachPhotos(src.clientId) : undefined} />
        </Card>
        <Card title="Weekly ratings" testId="ratings-chart">
          {list.length === 0 ? <p className="text-sm text-slate-500">Submit a weekly check-in to see your ratings here.</p> : (
            <div className="grid md:grid-cols-3 gap-6">
              <Bars data={list} k="energy" label="Energy" color="#c8a24a" />
              <Bars data={list} k="sleep" label="Sleep" color="#0b1528" />
              <Bars data={list} k="training" label="Training" color="#10b981" />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export const PortalMessages = () => {
  const { membership, src } = useContext(PortalContext);
  return (
    <div data-testid="portal-messages">
      <PortalHeader title="Messages" sub={src.coachView ? `Replying as coach to ${membership.client_name}.` : `Direct line to ${membership.coach_name}.`} />
      <Card><CoachMessages src={src} /></Card>
    </div>
  );
};

const KIND_ICON = { guide: FileText, video: PlayCircle, faq: HelpCircle };

export const PortalResources = () => {
  const { has, plans, membership, src } = useContext(PortalContext);
  const [list, setList] = useState([]);
  useEffect(() => { if (has('resources')) src.resources().then(setList).catch(() => {}); }, [has, src]);
  if (!has('resources')) return <><PortalHeader title="Resources" /><LockedModule name="resources" plans={plans} tier={membership.tier} /></>;
  return (
    <div data-testid="portal-resources">
      <PortalHeader title="Resources" sub="Guides, videos and programme FAQs from your coach." />
      {list.length === 0 ? <Card><p className="text-sm text-slate-500">Nothing here yet — your coach will add resources shortly.</p></Card> : (
        <div className="grid md:grid-cols-2 gap-4">
          {list.map(r => {
            const Icon = KIND_ICON[r.kind] || FileText;
            return (
              <Card key={r.id} testId={`resource-${r.id}`}>
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg grid place-items-center text-[#0b1528] shrink-0" style={{ backgroundColor: BRAND.accent }}><Icon className="h-4 w-4" /></div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900">{r.title}</p>
                    {r.body && <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{r.body}</p>}
                    {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-bold text-slate-700 hover:underline mt-2">Open <ExternalLink className="h-3.5 w-3.5" /></a>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
