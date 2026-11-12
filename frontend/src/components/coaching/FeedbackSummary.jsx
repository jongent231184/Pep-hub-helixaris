import React, { useEffect, useState } from 'react';
import { Coaches } from '../../lib/api';
import { FeedbackCard, Stars } from './FeedbackCard';
import { Loader2, MessageSquareHeart } from 'lucide-react';

const Tile = ({ label, value, sub, testId }) => (
  <div className="bg-white border border-slate-200 rounded-xl p-4" data-testid={testId}>
    <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{label}</p>
    <p className="text-2xl font-black text-slate-900 mt-1">{value}</p>
    {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
  </div>
);

export const FeedbackSummary = ({ fetcher, showClient = true, title = 'Client feedback' }) => {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');
  useEffect(() => { fetcher().then(setData).catch(() => setData({ summary: {}, items: [] })); }, [fetcher]);
  if (!data) return <Loader2 className="h-6 w-6 animate-spin text-slate-400" />;
  const s = data.summary || {};
  const items = data.items.filter(f => filter === 'all' || (filter === 'end' ? f.kind === 'end_of_plan' : filter === 'low' ? f.rating_overall <= 3 : f.allow_public && f.testimonial));
  return (
    <section className="space-y-4" data-testid="feedback-summary">
      <h2 className="text-lg font-black flex items-center gap-2"><MessageSquareHeart className="h-5 w-5 text-[#c8a24a]" /> {title}</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Responses" value={s.count ?? 0} sub={`${s.public_testimonials ?? 0} public testimonials`} testId="fb-kpi-count" />
        <Tile label="NPS" value={s.nps == null ? '—' : s.nps} sub={`${s.nps_responses ?? 0} answered · −100 to +100`} testId="fb-kpi-nps" />
        <div className="bg-white border border-slate-200 rounded-xl p-4" data-testid="fb-kpi-overall"><p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Avg overall</p><div className="flex items-center gap-2 mt-1"><p className="text-2xl font-black text-slate-900">{s.avg_overall ?? '—'}</p><Stars value={Math.round(s.avg_overall || 0)} size="h-4 w-4" /></div><p className="text-xs text-slate-500 mt-0.5">Comms {s.avg_communication ?? '—'} · Clarity {s.avg_clarity ?? '—'} · Value {s.avg_value ?? '—'}</p></div>
        <Tile label="Goal achieved" value={s.goals ? `${s.goals.yes}` : '—'} sub={s.goals ? `${s.goals.partly} partly · ${s.goals.no} not yet` : ''} testId="fb-kpi-goals" />
      </div>
      <div className="flex gap-2 flex-wrap">
        {[['all', 'All'], ['end', 'End of plan'], ['low', '3★ or below'], ['public', 'Public quotes']].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`text-xs font-bold px-3 py-1.5 rounded-full border ${filter === k ? 'bg-[#0b1528] text-white border-[#0b1528]' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`} data-testid={`fb-filter-${k}`}>{l}</button>
        ))}
      </div>
      {items.length === 0 ? <p className="text-sm text-slate-500 bg-white border rounded-xl p-5">No feedback yet.</p> : <div className="grid lg:grid-cols-2 gap-3">{items.map(f => <FeedbackCard key={f.id} f={f} showClient={showClient} />)}</div>}
    </section>
  );
};

export const AdminFeedbackSection = () => <FeedbackSummary fetcher={Coaches.adminFeedback} />;
export const CoachFeedbackSection = () => <FeedbackSummary fetcher={Coaches.coachAllFeedback} title="Feedback from your clients" />;
