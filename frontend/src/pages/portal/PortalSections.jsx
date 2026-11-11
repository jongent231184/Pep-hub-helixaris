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
import { Loader2, Send, CheckCircle2, Clock, FileText, PlayCircle, HelpCircle, ExternalLink, LayoutGrid, Layers, FlaskConical, ClipboardCheck, Eye, MessageSquare, CalendarDays, ChevronRight } from 'lucide-react';

const PLAN_TABS = [['overview', 'Overview', LayoutGrid], ['supplements', 'Supplements', Layers], ['peptides', 'Peptide plan', FlaskConical], ['checkin', 'Check-in', ClipboardCheck]];
const KIND_ICON = { guide: FileText, video: PlayCircle, faq: HelpCircle };
const GOLD = 'linear-gradient(180deg, #f3dc9a 0%, #c8a24a 100%)';
const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

const Progress = ({ pct }) => (
  <div className="h-2 rounded-full bg-slate-200 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: BRAND.accent }} /></div>
);

const GoldButton = ({ children, className = '', ...rest }) => (
  <button type="button" className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg text-[#0b1528] shadow-sm hover:brightness-105 transition ${className}`} style={{ background: GOLD }} {...rest}>{children}</button>
);

const PlanTabs = ({ tab, setTab }) => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6" role="tablist" data-testid="plan-tabs">
    {PLAN_TABS.map(([k, label, Icon]) => {
      const active = tab === k;
      return (
        <button key={k} role="tab" aria-selected={active} onClick={() => setTab(k)}
          className={`inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold border transition-all ${active ? 'border-[#c8a24a] text-[#0b1528] shadow-md' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'}`}
          style={active ? { background: GOLD } : undefined} data-testid={`plan-tab-${k}`}>
          <Icon className="h-4 w-4" /> {label}
        </button>
      );
    })}
  </div>
);

const SuppTable = ({ supps, todays, onOpen }) => (
  <div data-testid="overview-supplement-table">
    <div className="flex items-center justify-between mb-2"><h3 className="font-black text-slate-900">Supplement plan</h3><button onClick={onOpen} className="text-xs font-bold text-slate-600 hover:underline">See all →</button></div>
    {supps.length === 0 ? <p className="text-sm text-slate-500 border rounded-xl p-4">Your coach hasn't added supplements yet.</p> : (
      <div className="border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="text-left font-bold px-3 py-2">Item</th><th className="text-left font-bold px-3 py-2">Timing</th><th className="text-left font-bold px-3 py-2">Status</th></tr></thead>
          <tbody>
            {supps.map(s => {
              const t = todays.find(e => e.item_id === s.id);
              return (
                <tr key={s.id} className="border-t" data-testid={`supp-row-${s.id}`}>
                  <td className="px-3 py-2 font-semibold text-slate-800">{s.product_name || s.name}</td>
                  <td className="px-3 py-2 text-slate-600">{s.time_of_day || s.frequency || '—'}</td>
                  <td className="px-3 py-2">{t ? (t.done ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle2 className="h-3 w-3" /> Done today</span> : <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full"><Clock className="h-3 w-3" /> Due today</span>) : <span className="text-[11px] text-slate-400">Not today</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

const InfoRow = ({ icon: Icon, label, children }) => (
  <div className="grid sm:grid-cols-[150px_1fr] gap-1 sm:gap-3 py-2.5 border-t first:border-t-0 text-sm">
    <span className="inline-flex items-center gap-2 text-slate-600 font-semibold"><Icon className="h-3.5 w-3.5 text-slate-400" /> {label}</span>
    <span className="text-slate-800">{children}</span>
  </div>
);

const ResourceStrip = ({ src, base, has }) => {
  const [list, setList] = useState([]);
  useEffect(() => { if (has('resources')) src.resources().then(l => setList(l.slice(0, 3))).catch(() => {}); }, [has, src]);
  if (!has('resources') || list.length === 0) return null;
  return (
    <div data-testid="overview-resources">
      <h3 className="font-black text-slate-900 mb-2">Resources</h3>
      <div className="grid sm:grid-cols-3 gap-2">
        {list.map(r => { const Icon = KIND_ICON[r.kind] || FileText; return (
          <Link key={r.id} to={`${base}/resources`} className="flex items-center gap-2 border rounded-xl px-3 py-3 text-sm hover:border-slate-400 transition"><Icon className="h-4 w-4 text-slate-500 shrink-0" /><span className="flex-1 font-semibold text-slate-800 leading-tight line-clamp-2">{r.title}</span><ChevronRight className="h-4 w-4 text-slate-400" /></Link>
        ); })}
      </div>
    </div>
  );
};

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
  const coachName = membership.coach_name || 'Your coach';

  return (
    <div data-testid="portal-plan">
      <PortalHeader title="My plan & weekly check-in" sub="Everything you need between coaching reviews." />
      <PlanTabs tab={tab} setTab={setTab} />

      {tab === 'overview' && (
        <div data-testid="plan-overview">
          {loaded && !proto ? <MyCoaching {...protoProps} sections={{ header: true }} /> : proto && (
            <div className="grid lg:grid-cols-[1.15fr_1fr] gap-4">
              <Card testId="plan-overview-header" className="space-y-6">
                <div className="flex flex-col-reverse sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-black text-slate-900">Your personalised plan</h2>
                    <p className="text-sm text-slate-600 mt-0.5">Week {weeksIn} of {proto.duration_weeks} · {proto.title} · by {coachName}</p>
                  </div>
                  <span className="self-start inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full whitespace-nowrap"><CheckCircle2 className="h-3 w-3" /> Coach reviewed</span>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div><div className="flex justify-between text-xs text-slate-600 mb-1"><span>Programme progress</span><span>{Math.round(100 * weeksIn / (proto.duration_weeks || 1))}%</span></div><Progress pct={100 * weeksIn / (proto.duration_weeks || 1)} /></div>
                  <div><div className="flex justify-between text-xs text-slate-600 mb-1"><span>Doses ticked off</span><span>{adherence == null ? '—' : `${adherence}%`}</span></div><Progress pct={adherence || 0} /></div>
                </div>
                <SuppTable supps={supps} todays={todays} onOpen={() => setTab('supplements')} />
                <div data-testid="overview-peptide-plan">
                  <div className="flex items-center justify-between mb-2"><h3 className="font-black text-slate-900">Peptide plan</h3><GoldButton onClick={() => setTab('peptides')} data-testid="overview-view-plan-btn"><Eye className="h-3.5 w-3.5" /> View plan</GoldButton></div>
                  <div className="border rounded-xl px-4 py-1">
                    <InfoRow icon={FlaskConical} label="Peptides">{peptides.length ? peptides.map(p => p.product_name || p.name).join(', ') : '—'}</InfoRow>
                    <InfoRow icon={MessageSquare} label="Coach notes">{proto.notes ? <span className="whitespace-pre-wrap">{proto.notes}</span> : <span className="text-slate-400">Your current focus and key points for the next few weeks.</span>}</InfoRow>
                    <InfoRow icon={CalendarDays} label="Review date">{proto.next_review_date ? fmtDate(proto.next_review_date) : <span className="text-slate-400">To be set by your coach</span>}</InfoRow>
                    <InfoRow icon={HelpCircle} label="Today">{todays.length === 0 ? <span className="text-slate-400">Nothing scheduled today.</span> : todays.map(e => <span key={e.id} className={`inline-flex items-center gap-1 mr-3 ${e.done ? 'line-through text-slate-400' : ''}`}><CheckCircle2 className={`h-3.5 w-3.5 ${e.done ? 'text-emerald-500' : 'text-slate-300'}`} />{e.item_name}{e.time_of_day && ` · ${e.time_of_day}`}</span>)}</InfoRow>
                  </div>
                </div>
                <ResourceStrip src={src} base={base} has={has} />
              </Card>
              <div>
                {has('checkin') ? <PortalCheckin embedded formOnly onDone={() => setTab('checkin')} /> : <LockedModule name="checkin" plans={plans} tier={membership.tier} />}
              </div>
            </div>
          )}
          {proto && (
            <Card className="mt-4 !py-4" testId="overview-coach-bar">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex items-center gap-3 sm:pr-5 sm:border-r">
                  <div className="h-11 w-11 rounded-full grid place-items-center text-[#0b1528] font-black text-lg" style={{ background: GOLD }}>{coachName.charAt(0).toUpperCase()}</div>
                  <div><p className="text-[11px] text-slate-500">Your coach</p><p className="font-black text-slate-900 leading-tight">{coachName}</p></div>
                </div>
                <Link to={`${base}/messages`} className="inline-flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-lg text-[#0b1528] shadow-sm hover:brightness-105" style={{ background: GOLD }} data-testid="overview-message-coach-btn"><MessageSquare className="h-4 w-4" /> Send a message</Link>
              </div>
            </Card>
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

export const PortalCheckin = ({ embedded = false, formOnly = false, onDone }) => {
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
      onDone?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not submit check-in');
    } finally { setBusy(false); }
  };

  return (
    <div data-testid="portal-checkin">
      {!embedded && <PortalHeader title="Weekly check-in" sub="Takes two minutes. Your coach reviews it and replies in the portal." />}
      <div className={formOnly ? '' : 'grid lg:grid-cols-[1fr_1fr] gap-4'}>
        <Card title={formOnly ? 'Weekly check-in' : 'This week'} action={formOnly && <span className="inline-flex items-center gap-1 text-xs text-slate-500"><CalendarDays className="h-3.5 w-3.5" /> Week ending {new Date(form.week_ending).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</span>} testId="checkin-form-card">
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
            <button type="submit" disabled={busy} className="w-full inline-flex items-center justify-center gap-2 font-bold text-sm py-3 rounded-lg text-[#0b1528] shadow-sm hover:brightness-105 disabled:opacity-60" style={{ background: GOLD }} data-testid="checkin-submit">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit check-in
            </button>
          </form>
        </Card>
        {!formOnly && <Card title="Previous check-ins" testId="checkin-history">
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
        </Card>}
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
