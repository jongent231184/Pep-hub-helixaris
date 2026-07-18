import React, { useMemo, useState } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { CircleDot, AlertTriangle, CheckCircle2 } from 'lucide-react';

// Pens grouped by click-to-mg ratio.
// Group A (10/20/30 mg pens): 10 clicks = 1 mg  →  0.1 mg per click
// Group B (40/50/60 mg pens):  5 clicks = 1 mg  →  0.2 mg per click
const PEN_SIZES = [
  { mg: 10, mgPerClick: 0.1, clicksPerMg: 10 },
  { mg: 20, mgPerClick: 0.1, clicksPerMg: 10 },
  { mg: 30, mgPerClick: 0.1, clicksPerMg: 10 },
  { mg: 40, mgPerClick: 0.2, clicksPerMg: 5 },
  { mg: 50, mgPerClick: 0.2, clicksPerMg: 5 },
  { mg: 60, mgPerClick: 0.2, clicksPerMg: 5 },
];

const REFERENCE_DOSES_MG = [0.25, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5];

const PenProtocol = () => {
  const [pen, setPen] = useState(PEN_SIZES[3]); // default 40 mg
  const [customDose, setCustomDose] = useState('');

  const totalClicks = pen.mg * pen.clicksPerMg;
  const clicksForCustom = useMemo(() => {
    const d = Number(customDose);
    if (!d || d <= 0) return null;
    const clicks = d / pen.mgPerClick;
    return {
      clicks,
      exceedsCapacity: clicks > totalClicks,
      whole: Number.isInteger(clicks),
    };
  }, [customDose, pen, totalClicks]);

  return (
    <div className="grid lg:grid-cols-[1.35fr_1fr] gap-6 lg:gap-8">
      {/* Left: selectors + table */}
      <div className="space-y-4">
        <div className="bg-white border border-slate-200 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-9 w-9 shrink-0 rounded-lg bg-sky-100 text-sky-700 grid place-items-center">
              <CircleDot className="h-5 w-5" />
            </div>
            <div className="font-bold uppercase text-sm tracking-wider text-slate-900">1 · Choose your pen strength</div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {PEN_SIZES.map((p) => (
              <button
                key={p.mg}
                type="button"
                onClick={() => setPen(p)}
                className={`px-3 py-3 rounded-lg text-sm font-bold uppercase tracking-wider border transition-colors ${pen.mg === p.mg
                  ? 'bg-sky-500 text-white border-sky-500'
                  : 'bg-white text-slate-700 border-slate-300 hover:border-sky-400'}`}
                data-testid={`pen-${p.mg}mg`}
              >
                {p.mg} mg
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-3 leading-relaxed">
            <strong>{pen.mg} mg pen</strong> — {pen.clicksPerMg} clicks per mg ({pen.mgPerClick} mg per click).
            Total capacity: <strong>{totalClicks} clicks</strong>.
          </p>
        </div>

        {/* Dose reference table */}
        <div className="bg-white border border-slate-200 rounded-lg p-6">
          <div className="font-bold uppercase text-sm tracking-wider text-slate-900 mb-4">Dose reference table</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-widest text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="text-left font-semibold py-2 px-2">Dose</th>
                  <th className="text-right font-semibold py-2 px-2">Clicks</th>
                  <th className="text-right font-semibold py-2 px-2">% of pen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {REFERENCE_DOSES_MG.map((mg) => {
                  const clicks = mg / pen.mgPerClick;
                  const exceeds = clicks > totalClicks;
                  return (
                    <tr key={mg} className={exceeds ? 'text-amber-700 bg-amber-50/50' : ''}>
                      <td className="py-2.5 px-2 font-semibold">{mg} mg</td>
                      <td className="py-2.5 px-2 text-right font-mono font-bold">
                        {Number.isInteger(clicks) ? clicks : clicks.toFixed(1)} clicks
                      </td>
                      <td className="py-2.5 px-2 text-right text-slate-500">
                        {exceeds ? '— over —' : `${Math.round((clicks / totalClicks) * 100)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Right: custom dose card */}
      <aside className="lg:sticky lg:top-24 self-start space-y-4">
        <div className="bg-slate-900 rounded-xl p-6 text-white shadow-xl" data-testid="pen-protocol-result">
          <p className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold mb-3">Custom dose</p>
          <label className="text-xs text-slate-400 uppercase tracking-wider block mb-1.5">Target dose (mg)</label>
          <Input
            type="number"
            step="0.1"
            min="0"
            value={customDose}
            onChange={(e) => setCustomDose(e.target.value)}
            placeholder="e.g. 0.5"
            className="bg-slate-800 border-slate-700 text-white h-11 mb-4 placeholder:text-slate-500"
            data-testid="pen-custom-dose-input"
          />

          {clicksForCustom ? (
            <>
              <p className="text-sm text-slate-300 mb-2">Turn the dial to:</p>
              <div className={`text-5xl font-black tracking-tight ${clicksForCustom.exceedsCapacity ? 'text-amber-300' : 'text-emerald-400'}`}>
                {clicksForCustom.whole ? clicksForCustom.clicks : clicksForCustom.clicks.toFixed(1)}
                <span className="text-2xl text-slate-400 font-bold ml-2">clicks</span>
              </div>
              {!clicksForCustom.whole && (
                <p className="text-xs text-slate-400 mt-1">Round to the nearest click for injection.</p>
              )}

              {clicksForCustom.exceedsCapacity && (
                <div className="mt-4 flex items-start gap-2 border border-amber-400/50 bg-amber-400/10 rounded-lg p-3 text-xs text-amber-200">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    This dose needs <strong>{clicksForCustom.clicks.toFixed(1)} clicks</strong>, but a {pen.mg} mg pen only holds <strong>{totalClicks} clicks</strong>. Use a larger pen or split into two injections.
                  </span>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-300">Enter a dose to see the exact click count.</p>
          )}
        </div>

        <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 text-xs text-amber-900 flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-amber-700" />
          <p><strong>For research use only.</strong> Always verify your pen&apos;s click-to-mg ratio against the manufacturer&apos;s insert.</p>
        </div>
      </aside>
    </div>
  );
};

export default PenProtocol;
