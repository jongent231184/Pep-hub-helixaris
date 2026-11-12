import React from 'react';
import { Star, CheckCircle2, Quote, Globe, Award } from 'lucide-react';

export const Stars = ({ value, onChange, size = 'h-6 w-6', testId }) => (
  <div className="flex items-center gap-1" data-testid={testId}>
    {[1, 2, 3, 4, 5].map(n => (
      <button key={n} type="button" disabled={!onChange} onClick={() => onChange?.(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`}
        className={`transition ${onChange ? 'hover:scale-110' : 'cursor-default'}`} data-testid={testId ? `${testId}-${n}` : undefined}>
        <Star className={`${size} ${n <= (value || 0) ? 'fill-[#c8a24a] text-[#c8a24a]' : 'text-slate-300'}`} />
      </button>
    ))}
  </div>
);

const GOAL = { yes: ['Goal achieved', 'text-emerald-700 bg-emerald-50'], partly: ['Partly achieved', 'text-amber-700 bg-amber-50'], no: ['Not yet achieved', 'text-rose-700 bg-rose-50'] };

export const FeedbackCard = ({ f, showClient = false }) => (
  <div className="border rounded-xl p-4 bg-white" data-testid={`feedback-${f.id}`}>
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        {showClient && <p className="font-black text-slate-900">{f.client_name || 'Client'}{f.coach_name ? <span className="text-xs font-normal text-slate-500"> · coach {f.coach_name}</span> : null}</p>}
        <p className="text-xs text-slate-500">{f.kind === 'end_of_plan' ? 'End-of-plan feedback' : 'Feedback'} · {new Date(f.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
      </div>
      <Stars value={f.rating_overall} size="h-4 w-4" />
    </div>
    <div className="grid sm:grid-cols-3 gap-2 mt-3 text-xs text-slate-600">
      {[['Communication', f.rating_communication], ['Plan clarity', f.rating_clarity], ['Value', f.rating_value]].map(([l, v]) => (
        <div key={l} className="flex items-center justify-between bg-slate-50 rounded-lg px-2.5 py-1.5"><span>{l}</span><strong className="text-slate-900">{v ?? '—'}/5</strong></div>
      ))}
    </div>
    <div className="flex flex-wrap gap-2 mt-3">
      {f.nps != null && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">Would recommend {f.nps}/10</span>}
      {f.goal_achieved && GOAL[f.goal_achieved] && <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${GOAL[f.goal_achieved][1]}`}><CheckCircle2 className="h-3 w-3" /> {GOAL[f.goal_achieved][0]}</span>}
      {f.allow_certificate && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 inline-flex items-center gap-1"><Award className="h-3 w-3" /> Quote OK for certificate</span>}
      {f.allow_public && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-800 inline-flex items-center gap-1"><Globe className="h-3 w-3" /> Quote OK publicly</span>}
    </div>
    {f.went_well && <div className="mt-3"><p className="text-[10px] uppercase tracking-widest font-bold text-slate-500">What went well</p><p className="text-sm text-slate-800 whitespace-pre-wrap">{f.went_well}</p></div>}
    {f.improve && <div className="mt-3"><p className="text-[10px] uppercase tracking-widest font-bold text-slate-500">What could be better</p><p className="text-sm text-slate-800 whitespace-pre-wrap">{f.improve}</p></div>}
    {f.testimonial && <div className="mt-3 p-3 rounded-lg bg-[#fdf8ea] border border-[#f3dc9a] text-sm text-slate-800 italic flex gap-2"><Quote className="h-4 w-4 text-[#c8a24a] shrink-0" /> {f.testimonial}</div>}
  </div>
);
