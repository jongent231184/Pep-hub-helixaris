import React, { useContext, useEffect, useState } from 'react';
import { PortalContext } from './PortalLayout';
import { PortalHeader, Card } from './PortalDashboard';
import { Stars, FeedbackCard } from '../../components/coaching/FeedbackCard';
import { Coaches } from '../../lib/api';
import { toast } from 'sonner';
import { Loader2, Send, Award, MessageSquareHeart } from 'lucide-react';

const GOLD = 'linear-gradient(180deg, #f3dc9a 0%, #c8a24a 100%)';
const RATINGS = [['rating_overall', 'Overall experience'], ['rating_communication', 'Coach communication'], ['rating_clarity', 'Plan clarity'], ['rating_value', 'Value for money']];
const EMPTY = { rating_overall: 0, rating_communication: 0, rating_clarity: 0, rating_value: 0, nps: null, went_well: '', improve: '', goal_achieved: '', testimonial: '', allow_certificate: false, allow_public: false };

const PortalFeedback = () => {
  const { src, membership } = useContext(PortalContext);
  const [data, setData] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const load = () => (src.coachView ? src.feedback() : Coaches.myFeedback()).then(setData).catch(() => setData({ items: [] }));
  useEffect(() => { load(); }, [src]); // eslint-disable-line react-hooks/exhaustive-deps
  const pending = data?.pending_request;

  const submit = async (e) => {
    e.preventDefault();
    if (!form.rating_overall) { toast.error('Please give an overall star rating'); return; }
    setBusy(true);
    try {
      await Coaches.submitFeedback({ ...form, kind: pending ? 'end_of_plan' : 'general', nps: form.nps == null ? null : Number(form.nps), goal_achieved: form.goal_achieved || null,
        rating_communication: form.rating_communication || null, rating_clarity: form.rating_clarity || null, rating_value: form.rating_value || null });
      toast.success(pending ? 'Thank you — your coach can now issue your certificate' : 'Thanks, your feedback has been sent');
      setForm(EMPTY);
      load();
    } catch (err) { toast.error(err.response?.data?.detail || 'Could not send feedback'); }
    finally { setBusy(false); }
  };

  if (!data) return <div className="py-10 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  return (
    <div data-testid="portal-feedback">
      <PortalHeader title="Feedback" sub={`Tell ${membership.coach_name || 'your coach'} and the team how it's going — honest words help us improve.`} />
      {pending && (
        <div className="mb-4 rounded-2xl border border-[#f3dc9a] bg-[#fdf8ea] p-5 flex items-start gap-3" data-testid="feedback-request-banner">
          <div className="h-10 w-10 rounded-full grid place-items-center text-[#0b1528] shrink-0" style={{ background: GOLD }}><Award className="h-5 w-5" /></div>
          <div>
            <p className="font-black text-slate-900">Your coach has asked for end-of-plan feedback</p>
            <p className="text-sm text-slate-700 mt-0.5">Fill in the form below and your completion certificate can be issued. {data.feedback_request_note && <span className="block mt-1 italic">“{data.feedback_request_note}”</span>}</p>
          </div>
        </div>
      )}
      <div className="grid lg:grid-cols-[1.1fr_1fr] gap-4">
        <Card title={pending ? 'End-of-plan feedback' : 'Leave feedback'} testId="feedback-form-card">
          {src.readOnly && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 mb-3">Coach view — only the client can submit feedback.</p>}
          <form onSubmit={submit} className={`space-y-5 ${src.readOnly ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="space-y-3">
              {RATINGS.map(([k, label]) => (
                <div key={k} className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-700">{label}{k === 'rating_overall' && <span className="text-rose-500"> *</span>}</span>
                  <Stars value={form[k]} onChange={v => setForm(f => ({ ...f, [k]: v }))} size="h-5 w-5" testId={`fb-${k}`} />
                </div>
              ))}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">How likely are you to recommend us to a friend? <span className="text-slate-400 font-normal">(0–10)</span></p>
              <div className="grid grid-cols-11 gap-1">
                {Array.from({ length: 11 }, (_, i) => i).map(n => (
                  <button key={n} type="button" onClick={() => setForm(f => ({ ...f, nps: n }))} className={`h-9 rounded-lg text-sm font-bold border transition ${form.nps === n ? 'text-[#0b1528] border-[#c8a24a]' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400'}`} style={form.nps === n ? { background: GOLD } : undefined} data-testid={`fb-nps-${n}`}>{n}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">Did you achieve what you set out to?</p>
              <div className="grid grid-cols-3 gap-2">
                {[['yes', 'Yes'], ['partly', 'Partly'], ['no', 'Not yet']].map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setForm(f => ({ ...f, goal_achieved: f.goal_achieved === v ? '' : v }))} className={`py-2 rounded-lg text-sm font-bold border transition ${form.goal_achieved === v ? 'text-[#0b1528] border-[#c8a24a]' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400'}`} style={form.goal_achieved === v ? { background: GOLD } : undefined} data-testid={`fb-goal-${v}`}>{l}</button>
                ))}
              </div>
            </div>
            <label className="block text-sm"><span className="font-semibold text-slate-700">What went well?</span>
              <textarea rows={3} value={form.went_well} onChange={e => setForm(f => ({ ...f, went_well: e.target.value }))} className="mt-1 w-full border rounded-lg px-3 py-2" placeholder="The parts of the plan, support or portal that worked for you…" data-testid="fb-went-well" /></label>
            <label className="block text-sm"><span className="font-semibold text-slate-700">What could be better?</span>
              <textarea rows={3} value={form.improve} onChange={e => setForm(f => ({ ...f, improve: e.target.value }))} className="mt-1 w-full border rounded-lg px-3 py-2" placeholder="Be honest — this goes straight to the owner and your coach." data-testid="fb-improve" /></label>
            <div className="rounded-xl border border-[#f3dc9a] bg-[#fdf8ea] p-4 space-y-2">
              <label className="block text-sm"><span className="font-semibold text-slate-800 inline-flex items-center gap-1.5"><MessageSquareHeart className="h-4 w-4 text-[#c8a24a]" /> A short quote about your journey <span className="text-slate-500 font-normal">(optional)</span></span>
                <textarea rows={2} value={form.testimonial} onChange={e => setForm(f => ({ ...f, testimonial: e.target.value }))} className="mt-1 w-full border rounded-lg px-3 py-2 bg-white" placeholder="e.g. “Twelve weeks in and I finally feel in control — the weekly check-ins kept me honest.”" data-testid="fb-testimonial" /></label>
              <label className="flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" checked={form.allow_certificate} onChange={e => setForm(f => ({ ...f, allow_certificate: e.target.checked }))} className="mt-0.5" data-testid="fb-allow-certificate" /> My coach may print this quote on my completion certificate and share image</label>
              <label className="flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" checked={form.allow_public} onChange={e => setForm(f => ({ ...f, allow_public: e.target.checked }))} className="mt-0.5" data-testid="fb-allow-public" /> It may also appear (first name only) on the public coaching page</label>
            </div>
            <button type="submit" disabled={busy} className="w-full inline-flex items-center justify-center gap-2 font-bold text-sm py-3 rounded-lg text-[#0b1528] shadow-sm hover:brightness-105 disabled:opacity-60" style={{ background: GOLD }} data-testid="fb-submit">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send feedback
            </button>
          </form>
        </Card>
        <Card title="Your previous feedback" testId="feedback-history">
          {data.items.length === 0 ? <p className="text-sm text-slate-500">Nothing sent yet. You can leave feedback at any point in your plan, not just at the end.</p> : (
            <div className="space-y-3">{data.items.map(f => <FeedbackCard key={f.id} f={f} />)}</div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default PortalFeedback;
