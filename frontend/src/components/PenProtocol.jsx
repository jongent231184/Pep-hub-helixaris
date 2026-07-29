import React, { useMemo, useState } from 'react';
import { Input } from './ui/input';
import { CircleDot, AlertTriangle, CheckCircle2, CalendarClock } from 'lucide-react';

// -----------------------------------------------------------------------------
// Compound library — per-compound pen specs, dosing units, and frequency.
//   unit:       'mg' | 'mcg'  — display unit used across the compound's UI
//   frequency:  'week' | 'day' — how the dose is typically administered
//   pens:       array of pen strengths with click resolution (mg per click)
//   referenceDoses: shown in the reference table (in the compound's unit)
// Internally all click math is done in mg.
// -----------------------------------------------------------------------------
const COMPOUNDS = {
  reta: {
    key: 'reta',
    label: 'Reta / Tirz',
    subtitle: 'Retatrutide / Tirzepatide',
    unit: 'mg',
    frequency: 'week',
    pens: [
      { mg: 10, mgPerClick: 0.1, clicksPerMg: 10 },
      { mg: 20, mgPerClick: 0.1, clicksPerMg: 10 },
      { mg: 30, mgPerClick: 0.1, clicksPerMg: 10 },
      { mg: 40, mgPerClick: 0.2, clicksPerMg: 5 },
      { mg: 50, mgPerClick: 0.2, clicksPerMg: 5 },
      { mg: 60, mgPerClick: 0.2, clicksPerMg: 5 },
    ],
    referenceDoses: [0.25, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5],
    defaultPenIndex: 3,
    placeholderDose: '0.5',
    placeholderPeriodDose: '2.5',
  },
  ghkcu: {
    key: 'ghkcu',
    label: 'GHK-Cu',
    subtitle: '100 mg pen · 3 ml',
    unit: 'mg',
    frequency: 'day',
    pens: [
      { mg: 100, mgPerClick: 1 / 3, clicksPerMg: 3 },
    ],
    referenceDoses: [0.5, 1, 1.5, 2, 2.5, 3, 4, 5],
    defaultPenIndex: 0,
    placeholderDose: '2',
    placeholderPeriodDose: '2',
  },
  mt2: {
    key: 'mt2',
    label: 'MT-2',
    subtitle: 'Melanotan II · 10 mg pen · 2 ml',
    unit: 'mcg',
    frequency: 'day',
    pens: [
      // 10 mg = 10 000 mcg over 200 clicks → 50 mcg per click, 20 clicks per mg
      { mg: 10, mgPerClick: 0.05, clicksPerMg: 20 },
    ],
    referenceDoses: [100, 250, 500, 750, 1000], // in mcg
    defaultPenIndex: 0,
    placeholderDose: '500',
    placeholderPeriodDose: '500',
  },
};

const COMPOUND_ORDER = ['reta', 'ghkcu', 'mt2'];

// Convert user-facing dose value → mg (internal unit for click math)
const toMg = (val, unit) => (unit === 'mcg' ? val / 1000 : val);
// Convert mg → user-facing display value in the compound's unit
const fromMg = (val, unit) => (unit === 'mcg' ? val * 1000 : val);
const formatDose = (val, unit) => {
  if (unit === 'mcg') return `${Math.round(val)} mcg`;
  // Trim trailing zeros for mg
  const s = Number.isInteger(val) ? String(val) : Number(val.toFixed(3)).toString();
  return `${s} mg`;
};

const PenProtocol = () => {
  const [compoundKey, setCompoundKey] = useState('reta');
  const compound = COMPOUNDS[compoundKey];

  const [penIndex, setPenIndex] = useState(compound.defaultPenIndex);
  const [customDose, setCustomDose] = useState('');
  const [periodDose, setPeriodDose] = useState(''); // dose per week OR per day depending on compound

  // When compound switches, reset pen selection & clear inputs so numbers
  // aren't mis-attributed to the new compound.
  const switchCompound = (key) => {
    if (key === compoundKey) return;
    setCompoundKey(key);
    setPenIndex(COMPOUNDS[key].defaultPenIndex);
    setCustomDose('');
    setPeriodDose('');
  };

  const pen = compound.pens[penIndex] || compound.pens[0];
  const totalClicks = pen.mg * pen.clicksPerMg;
  const unit = compound.unit;
  const frequency = compound.frequency; // 'week' | 'day'
  const frequencyPlural = frequency === 'week' ? 'weeks' : 'days';
  const daysPerPeriod = frequency === 'week' ? 7 : 1;

  const clicksForCustom = useMemo(() => {
    const raw = Number(customDose);
    if (!raw || raw <= 0) return null;
    const doseMg = toMg(raw, unit);
    const clicks = doseMg / pen.mgPerClick;
    return {
      clicks,
      exceedsCapacity: clicks > totalClicks,
      whole: Number.isInteger(clicks),
    };
  }, [customDose, pen, totalClicks, unit]);

  const duration = useMemo(() => {
    const raw = Number(periodDose);
    if (!raw || raw <= 0) return null;
    const doseMg = toMg(raw, unit);
    const periods = pen.mg / doseMg;
    const wholePeriods = Math.floor(periods);
    const remainderDays = Math.round((periods - wholePeriods) * daysPerPeriod);
    const totalDays = Math.round(periods * daysPerPeriod);
    const runOut = new Date();
    runOut.setDate(runOut.getDate() + totalDays);
    return {
      periods,
      wholePeriods,
      remainderDays,
      exceedsPen: doseMg > pen.mg,
      runOutDate: runOut.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    };
  }, [periodDose, pen, unit, daysPerPeriod]);

  return (
    <div className="space-y-6">
      {/* Compound sub-tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-1" data-testid="compound-tabs">
        {COMPOUND_ORDER.map((k) => {
          const c = COMPOUNDS[k];
          const active = compoundKey === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => switchCompound(k)}
              data-testid={`compound-tab-${k}`}
              className={`px-4 py-2.5 text-xs md:text-sm font-black uppercase tracking-widest rounded-t-md transition-colors border-b-2 -mb-[2px] ${
                active
                  ? 'text-sky-600 border-sky-500 bg-sky-50/70'
                  : 'text-slate-500 border-transparent hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Compound context strip */}
      <div className="text-xs text-slate-500 -mt-2">
        <span className="font-semibold text-slate-700">{compound.label}</span>
        {compound.subtitle && <span> · {compound.subtitle}</span>}
        <span> · doses in <strong className="uppercase">{unit}</strong> · {frequency === 'day' ? 'daily' : 'weekly'} protocol</span>
      </div>

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
            <div className={`grid gap-2 ${compound.pens.length > 2 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {compound.pens.map((p, i) => (
                <button
                  key={p.mg}
                  type="button"
                  onClick={() => setPenIndex(i)}
                  className={`px-3 py-3 rounded-lg text-sm font-bold uppercase tracking-wider border transition-colors ${
                    penIndex === i
                      ? 'bg-sky-500 text-white border-sky-500'
                      : 'bg-white text-slate-700 border-slate-300 hover:border-sky-400'
                  }`}
                  data-testid={`pen-${p.mg}mg`}
                >
                  {p.mg} mg
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-3 leading-relaxed">
              <strong>{pen.mg} mg pen</strong> — {pen.clicksPerMg} clicks per mg ({(pen.mgPerClick).toFixed(pen.mgPerClick < 0.1 ? 2 : 2)} mg per click).
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
                  {compound.referenceDoses.map((displayVal) => {
                    const doseMg = toMg(displayVal, unit);
                    const clicks = doseMg / pen.mgPerClick;
                    const exceeds = clicks > totalClicks;
                    return (
                      <tr key={displayVal} className={exceeds ? 'text-amber-700 bg-amber-50/50' : ''}>
                        <td className="py-2.5 px-2 font-semibold">{formatDose(displayVal, unit)}</td>
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

        {/* Right: custom dose + duration cards */}
        <aside className="lg:sticky lg:top-24 self-start space-y-4">
          <div className="bg-slate-900 rounded-xl p-6 text-white shadow-xl" data-testid="pen-protocol-result">
            <p className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold mb-3">Custom dose</p>
            <label className="text-xs text-slate-400 uppercase tracking-wider block mb-1.5">Target dose ({unit})</label>
            <Input
              type="number"
              step={unit === 'mcg' ? '1' : '0.1'}
              min="0"
              value={customDose}
              onChange={(e) => setCustomDose(e.target.value)}
              placeholder={`e.g. ${compound.placeholderDose}`}
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

          {/* Pen duration estimator */}
          <div className="bg-white border border-slate-200 rounded-xl p-6" data-testid="pen-duration-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 shrink-0 rounded-lg bg-emerald-100 text-emerald-700 grid place-items-center">
                <CalendarClock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-emerald-700 font-bold">How long will this pen last?</p>
                <p className="text-xs text-slate-500">Enter your {frequency === 'day' ? 'daily' : 'weekly'} dose to estimate supply.</p>
              </div>
            </div>
            <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">{frequency === 'week' ? 'Weekly' : 'Daily'} dose ({unit})</label>
            <Input
              type="number"
              step={unit === 'mcg' ? '1' : '0.1'}
              min="0"
              value={periodDose}
              onChange={(e) => setPeriodDose(e.target.value)}
              placeholder={`e.g. ${compound.placeholderPeriodDose}`}
              className="h-11 mb-4"
              data-testid="pen-weekly-dose-input"
            />

            {duration ? (
              duration.exceedsPen ? (
                <div className="flex items-start gap-2 border border-amber-300 bg-amber-50 rounded-lg p-3 text-xs text-amber-900">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    Your {frequency === 'day' ? 'daily' : 'weekly'} dose (<strong>{formatDose(Number(periodDose), unit)}</strong>) is greater than the entire {pen.mg} mg pen. You&apos;ll need multiple pens per {frequency}.
                  </span>
                </div>
              ) : (
                <>
                  <p className="text-sm text-slate-600 mb-1">
                    A {pen.mg} mg pen at <strong>{formatDose(Number(periodDose), unit)}/{frequency}</strong> lasts:
                  </p>
                  <div className="text-4xl font-black tracking-tight text-slate-900" data-testid="pen-duration-result">
                    {duration.wholePeriods}
                    <span className="text-2xl text-slate-500 font-bold ml-1.5">{duration.wholePeriods === 1 ? frequency : frequencyPlural}</span>
                    {duration.remainderDays > 0 && frequency === 'week' && (
                      <>
                        <span className="text-2xl text-slate-400 font-bold ml-2">·</span>
                        <span className="text-2xl text-slate-500 font-bold ml-2">{duration.remainderDays} days</span>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    Estimated run-out date: <strong className="text-slate-700">{duration.runOutDate}</strong>
                  </p>
                </>
              )
            ) : (
              <p className="text-sm text-slate-500">
                Enter your {frequency === 'day' ? 'daily' : 'weekly'} dose to see how many {frequencyPlural} this pen will last.
              </p>
            )}
          </div>

          <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 text-xs text-amber-900 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-amber-700" />
            <p><strong>For research use only.</strong> Always verify your pen&apos;s click-to-mg ratio against the manufacturer&apos;s insert.</p>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default PenProtocol;
