import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CheckCircle2, Loader2 } from 'lucide-react';

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const monday = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const fmt = (d, o) => d.toLocaleDateString('en-GB', o);

export const WeekCalendar = ({ calendar = [], saving, onToggle, readOnly = false }) => {
  const today = iso(new Date());
  const dates = useMemo(() => calendar.map(e => e.date).sort(), [calendar]);
  const first = dates[0] ? monday(new Date(dates[0])) : monday(new Date());
  const last = dates.length ? monday(new Date(dates[dates.length - 1])) : first;
  const initial = () => { const t = monday(new Date()); return t < first ? first : t > last ? last : t; };
  const [weekStart, setWeekStart] = useState(initial);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const byDate = useMemo(() => calendar.reduce((a, e) => ((a[e.date] = a[e.date] || []).push(e), a), {}), [calendar]);
  const weekEntries = days.flatMap(d => byDate[iso(d)] || []);
  const doneCount = weekEntries.filter(e => e.done).length;
  const weekNo = Math.round((weekStart - first) / (7 * 86400000)) + 1;

  return (
    <div data-testid="week-calendar">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <button type="button" onClick={() => setWeekStart(addDays(weekStart, -7))} disabled={weekStart <= first} className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 border rounded-lg px-2.5 py-1.5 bg-white hover:border-slate-400 disabled:opacity-40" data-testid="week-prev"><ChevronLeft className="h-4 w-4" /> Prev</button>
        <div className="text-center">
          <p className="text-sm font-black text-slate-900" data-testid="week-label">Week {weekNo} · {fmt(days[0], { day: 'numeric', month: 'short' })} – {fmt(days[6], { day: 'numeric', month: 'short' })}</p>
          <p className="text-[11px] text-slate-500">{doneCount}/{weekEntries.length} ticked off this week</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setWeekStart(initial())} className="text-xs font-bold text-slate-600 border rounded-lg px-2.5 py-1.5 bg-white hover:border-slate-400" data-testid="week-today">Today</button>
          <button type="button" onClick={() => setWeekStart(addDays(weekStart, 7))} disabled={weekStart >= last} className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 border rounded-lg px-2.5 py-1.5 bg-white hover:border-slate-400 disabled:opacity-40" data-testid="week-next">Next <ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {days.map(d => {
          const key = iso(d);
          const entries = byDate[key] || [];
          const isToday = key === today;
          const allDone = entries.length > 0 && entries.every(e => e.done);
          return (
            <div key={key} className={`rounded-xl border p-2 min-h-[120px] flex flex-col ${isToday ? 'border-[#c8a24a] bg-[#fdf8ea]' : allDone ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'}`} data-testid={`day-${key}`}>
              <div className="flex items-baseline justify-between mb-2 px-0.5">
                <span className={`text-[10px] uppercase tracking-widest font-bold ${isToday ? 'text-[#8a6a1a]' : 'text-slate-500'}`}>{fmt(d, { weekday: 'short' })}</span>
                <span className={`text-sm font-black ${isToday ? 'text-[#0b1528]' : 'text-slate-700'}`}>{d.getDate()}</span>
              </div>
              <div className="space-y-1.5 flex-1">
                {entries.length === 0 && <p className="text-[11px] text-slate-400 px-0.5">—</p>}
                {entries.map(e => (
                  <button key={e.id} type="button" onClick={() => onToggle(e, !e.done)} disabled={readOnly || saving === e.id}
                    title={readOnly ? '' : e.done ? 'Mark as not done' : 'Mark as done'}
                    className={`w-full text-left rounded-lg border px-2 py-1.5 text-xs transition flex items-start gap-1.5 disabled:cursor-default ${e.done ? 'bg-emerald-500 border-emerald-500 text-white hover:bg-emerald-600' : 'bg-white border-slate-200 text-slate-800 hover:border-emerald-400 hover:bg-emerald-50'}`}
                    data-testid={`cal-entry-${e.id}`}>
                    <span className={`mt-0.5 shrink-0 h-3.5 w-3.5 rounded-sm border grid place-items-center ${e.done ? 'bg-white border-white' : 'border-slate-300 bg-white'}`}>
                      {saving === e.id ? <Loader2 className="h-3 w-3 animate-spin text-slate-400" /> : e.done ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="font-bold leading-tight block truncate">{e.item_name}</span>
                      <span className={`block leading-tight ${e.done ? 'text-emerald-50' : 'text-slate-500'}`}>{[e.dose, e.time_of_day].filter(Boolean).join(' · ')}{e.kind === 'supplement' ? ' · supp' : ''}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WeekCalendar;
