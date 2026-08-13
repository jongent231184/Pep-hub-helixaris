import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Coaches } from '../lib/api';
import { HeartPulse, Package, ShoppingBag, Loader2, Info, CheckCircle2, Circle } from 'lucide-react';

const AREA_LABEL = { weightloss: 'Weight loss', peptide_info: 'Peptide Information', dosage_guide: 'Dosage Guide', how_to_guide: 'How-to Guide' };

const MyCoaching = () => {
  const [proto, setProto] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);

  const load = () => {
    setLoading(true);
    Coaches.myProtocol()
      .then(setProto)
      .catch(() => setProto(null))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const toggle = async (entry, done) => {
    setSaving(entry.id);
    try {
      await Coaches.toggleEntry(entry.id, done);
      setProto(p => p ? { ...p, calendar: p.calendar.map(e => e.id === entry.id ? { ...e, done } : e) } : p);
    } catch (_) { /* silent */ } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return <div className="py-8 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-sky-500" /></div>;
  }

  if (!proto) {
    return (
      <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center">
        <HeartPulse className="h-8 w-8 mx-auto text-slate-300 mb-3" />
        <p className="text-slate-600 font-semibold">No active coaching protocol.</p>
        <p className="text-sm text-slate-500 mt-1">
          Interested? <Link to="/coaching" className="text-sky-600 hover:underline font-semibold">Request coaching</Link>
        </p>
      </div>
    );
  }

  // Group calendar entries by date
  const grouped = (proto.calendar || []).reduce((acc, e) => {
    (acc[e.date] = acc[e.date] || []).push(e);
    return acc;
  }, {});
  const sortedDates = Object.keys(grouped).sort();

  return (
    <div className="space-y-6" data-testid="my-coaching-section">
      {/* Protocol header */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
        <p className="text-[10px] uppercase tracking-widest text-emerald-700 font-bold">Your active protocol</p>
        <h3 className="text-xl font-black text-slate-900 mt-1">{proto.title}</h3>
        <p className="text-sm text-slate-600 mt-1">
          {proto.duration_weeks} weeks
          {proto.area && ` · ${AREA_LABEL[proto.area] || proto.area}`}
        </p>
        {proto.notes && (
          <div className="mt-3 p-3 bg-white border border-emerald-200 rounded text-xs text-slate-700 whitespace-pre-wrap">
            {proto.notes}
          </div>
        )}
      </div>

      {/* Items */}
      {proto.items?.length > 0 && (
        <div className="bg-white border rounded-xl p-5">
          <h4 className="text-xs uppercase tracking-widest text-slate-500 font-bold mb-3 flex items-center gap-2"><Package className="h-3.5 w-3.5" /> Your items</h4>
          <div className="grid md:grid-cols-2 gap-3">
            {proto.items.map(it => (
              <div key={it.id} className="border rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-slate-900">{it.name}</p>
                  {it.product_id && (
                    <Link to={`/product/${it.product_id}`} className="text-[10px] uppercase tracking-wider bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded inline-flex items-center gap-1 hover:bg-sky-200">
                      <ShoppingBag className="h-3 w-3" /> Buy
                    </Link>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {it.dose && <span><strong>{it.dose}</strong></span>}
                  {it.dose && it.frequency && ' · '}
                  {it.frequency && <span>{it.frequency}</span>}
                </p>
                {it.notes && <p className="text-xs text-slate-600 mt-1">{it.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calendar */}
      {sortedDates.length > 0 && (
        <div className="bg-white border rounded-xl p-5">
          <h4 className="text-xs uppercase tracking-widest text-slate-500 font-bold mb-3">Your dose calendar</h4>
          <div className="space-y-3">
            {sortedDates.map(date => (
              <div key={date} className="border rounded-lg p-3">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-600 mb-2">
                  {new Date(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
                <div className="divide-y">
                  {grouped[date].map(e => (
                    <div key={e.id} className={`flex items-center gap-3 py-2 ${e.done ? 'text-slate-400 line-through' : ''}`} data-testid={`cal-entry-${e.id}`}>
                      <button
                        onClick={() => toggle(e, !e.done)}
                        disabled={saving === e.id}
                        className="shrink-0"
                        title={e.done ? 'Mark not done' : 'Mark done'}
                      >
                        {saving === e.id
                          ? <Loader2 className="h-5 w-5 animate-spin text-sky-500" />
                          : e.done
                            ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                            : <Circle className="h-5 w-5 text-slate-300" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">
                          <strong className="text-slate-900">{e.item_name}</strong>
                          {e.dose && <span> · {e.dose}</span>}
                          {e.time_of_day && <span className="text-slate-500"> · {e.time_of_day}</span>}
                        </p>
                        {e.notes && <p className="text-xs text-slate-500">{e.notes}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-xs text-slate-500 flex items-start gap-2 p-3 border border-amber-200 bg-amber-50 rounded">
        <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-700" />
        <span>Your coaching protocol is for <strong>peer education only</strong>. Nothing here constitutes medical advice. Always consult a qualified healthcare professional before making changes.</span>
      </div>
    </div>
  );
};

export default MyCoaching;
