import React, { useEffect, useMemo, useState } from 'react';
import { Coaches } from '../lib/api';
import { toast } from 'sonner';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Loader2, TrendingDown, Trash2, Target, Scale } from 'lucide-react';

const KG_TO_LB = 2.2046226218;
const kgToLb = (kg) => Math.round(kg * KG_TO_LB * 10) / 10;
const lbToKg = (lb) => Math.round((lb / KG_TO_LB) * 10) / 10;
const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * WeighInPanel — customer's weight tracker on My Coaching.
 * Props:
 *   readOnly (bool) — coach view = true; hides the form and target editor.
 *   coachFetch (fn) — for coach view, replaces Coaches.myWeighIns() with a per-client fetch.
 */
const WeighInPanel = ({ readOnly = false, coachFetch = null }) => {
  const [unit, setUnit] = useState(() => localStorage.getItem('ghp_weight_unit') || 'kg');
  const [entries, setEntries] = useState([]);
  const [targetKg, setTargetKg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [dateInput, setDateInput] = useState(todayISO());
  const [targetInput, setTargetInput] = useState('');
  const [savingTarget, setSavingTarget] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = coachFetch ? await coachFetch() : await Coaches.myWeighIns();
      setEntries(data.entries || []);
      setTargetKg(data.target_weight_kg ?? null);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [coachFetch]);

  useEffect(() => { localStorage.setItem('ghp_weight_unit', unit); }, [unit]);

  const displayVal = (kg) => unit === 'kg' ? +kg.toFixed(1) : kgToLb(kg);
  const displayLabel = unit === 'kg' ? 'kg' : 'lb';

  const submit = async (e) => {
    e?.preventDefault();
    const raw = parseFloat(weightInput);
    if (!raw || raw <= 0) return toast('Enter a valid weight');
    if (raw > 500 || (unit === 'lb' && raw > 1100)) return toast('That looks too high — check the value');
    const kg = unit === 'kg' ? raw : lbToKg(raw);
    setSaving(true);
    try {
      await Coaches.addMyWeighIn(dateInput, kg);
      setWeightInput('');
      toast(`Weigh-in saved · ${displayVal(kg)} ${displayLabel}`);
      load();
    } catch (err) {
      toast('Could not save', { description: String(err?.response?.data?.detail || err.message) });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this weigh-in?')) return;
    await Coaches.deleteMyWeighIn(id);
    load();
  };

  const saveTarget = async () => {
    const raw = parseFloat(targetInput);
    if (!raw || raw <= 0) return toast('Enter a valid target');
    const kg = unit === 'kg' ? raw : lbToKg(raw);
    setSavingTarget(true);
    try {
      await Coaches.setMyTarget(kg);
      setTargetInput('');
      toast(`Target set · ${displayVal(kg)} ${displayLabel}`);
      load();
    } finally {
      setSavingTarget(false);
    }
  };

  const clearTarget = async () => {
    await Coaches.setMyTarget(null);
    load();
  };

  const chartData = useMemo(() => entries.map(e => ({
    date: e.date,
    label: new Date(e.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    weight: displayVal(e.weight_kg),
  })), [entries, unit]);

  const first = entries[0];
  const latest = entries[entries.length - 1];
  const change = first && latest && first !== latest ? (latest.weight_kg - first.weight_kg) : 0;

  return (
    <div className="bg-white border rounded-xl p-5" data-testid="weigh-in-panel">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <h4 className="text-xs uppercase tracking-widest text-slate-500 font-bold flex items-center gap-2">
          <Scale className="h-3.5 w-3.5" /> Weigh-in tracker
        </h4>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 p-0.5" data-testid="unit-toggle">
          {['kg', 'lb'].map(u => (
            <button
              key={u}
              onClick={() => setUnit(u)}
              className={`text-[11px] font-bold px-2.5 py-1 rounded uppercase tracking-widest ${unit === u ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'}`}
              data-testid={`unit-${u}`}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      {/* Summary tiles */}
      {latest && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Latest</p>
            <p className="text-lg font-bold text-slate-900">{displayVal(latest.weight_kg)} <span className="text-xs font-normal text-slate-500">{displayLabel}</span></p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Change</p>
            <p className={`text-lg font-bold flex items-center gap-1 ${change < 0 ? 'text-emerald-600' : change > 0 ? 'text-amber-600' : 'text-slate-500'}`}>
              {change < 0 && <TrendingDown className="h-4 w-4" />}
              <span>{change > 0 ? '+' : change < 0 ? '−' : ''}{displayVal(Math.abs(change))}</span>
              <span className="text-xs font-normal text-slate-500">{displayLabel}</span>
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Target</p>
            <p className="text-lg font-bold text-sky-600">
              {targetKg ? <>{displayVal(targetKg)} <span className="text-xs font-normal text-slate-500">{displayLabel}</span></> : <span className="text-sm text-slate-400 italic font-normal">not set</span>}
            </p>
          </div>
        </div>
      )}

      {/* Chart */}
      {chartData.length > 0 ? (
        <div className="h-56 w-full" data-testid="weight-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis
                domain={[
                  (min) => {
                    const t = targetKg ? displayVal(targetKg) : null;
                    return Math.floor(Math.min(min, t ?? min) - 1);
                  },
                  (max) => {
                    const t = targetKg ? displayVal(targetKg) : null;
                    return Math.ceil(Math.max(max, t ?? max) + 1);
                  },
                ]}
                tick={{ fontSize: 11 }}
                stroke="#94a3b8"
                unit={` ${displayLabel}`}
                width={70}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                formatter={(v) => [`${v} ${displayLabel}`, 'Weight']}
              />
              {targetKg && (
                <ReferenceLine
                  y={displayVal(targetKg)}
                  stroke="#0ea5e9"
                  strokeDasharray="4 4"
                  label={{ value: `Target ${displayVal(targetKg)} ${displayLabel}`, fill: '#0ea5e9', fontSize: 10, position: 'insideTopRight' }}
                />
              )}
              <Line type="monotone" dataKey="weight" stroke="#0f172a" strokeWidth={2} dot={{ r: 3, fill: '#0f172a' }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : loading ? (
        <div className="h-40 flex items-center justify-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <p className="text-sm text-slate-500 italic py-6 text-center">
          {readOnly ? 'No weigh-ins logged yet.' : 'Log your first weigh-in below to start tracking.'}
        </p>
      )}

      {/* Add entry form (customer only) */}
      {!readOnly && (
        <form onSubmit={submit} className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2">Log a weigh-in</p>
          <div className="grid grid-cols-[130px,1fr,90px] gap-2 items-center">
            <input
              type="date"
              value={dateInput}
              onChange={e => setDateInput(e.target.value)}
              max={todayISO()}
              className="border rounded px-2 py-2 text-sm bg-white"
              data-testid="weigh-date"
            />
            <div className="flex">
              <input
                type="number"
                step="0.1"
                min="0"
                value={weightInput}
                onChange={e => setWeightInput(e.target.value)}
                placeholder={`Weight in ${displayLabel}`}
                className="border rounded-l px-3 py-2 text-sm bg-white flex-1 border-r-0"
                data-testid="weigh-weight"
              />
              <span className="border rounded-r px-3 py-2 text-sm font-bold bg-slate-100 text-slate-600">{displayLabel}</span>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold px-3 py-2 rounded flex items-center justify-center gap-1"
              data-testid="weigh-submit"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </button>
          </div>

          {/* Target editor */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <Target className="h-4 w-4 text-sky-500" />
            <span className="text-xs text-slate-600 font-semibold">Goal:</span>
            <input
              type="number"
              step="0.1"
              min="0"
              value={targetInput}
              onChange={e => setTargetInput(e.target.value)}
              placeholder={targetKg ? `${displayVal(targetKg)} ${displayLabel}` : `Set target (${displayLabel})`}
              className="border rounded px-2 py-1 text-sm bg-white w-32"
              data-testid="target-input"
            />
            <button
              type="button"
              onClick={saveTarget}
              disabled={savingTarget || !targetInput}
              className="text-xs font-bold bg-sky-500 hover:bg-sky-600 text-white px-2 py-1 rounded disabled:opacity-50"
              data-testid="target-save"
            >
              {savingTarget ? '…' : 'Set'}
            </button>
            {targetKg && (
              <button
                type="button"
                onClick={clearTarget}
                className="text-xs text-slate-400 hover:text-red-600 underline"
                data-testid="target-clear"
              >
                Clear
              </button>
            )}
          </div>
        </form>
      )}

      {/* History table */}
      {entries.length > 0 && (
        <details className="mt-4 border-t border-slate-100 pt-3">
          <summary className="text-[10px] uppercase tracking-widest font-bold text-slate-500 cursor-pointer">History ({entries.length})</summary>
          <div className="mt-2 max-h-48 overflow-y-auto divide-y">
            {[...entries].reverse().map(e => (
              <div key={e.id} className="flex items-center justify-between py-1.5 text-sm">
                <span className="font-mono text-xs text-slate-500">{e.date}</span>
                <span className="font-bold">{displayVal(e.weight_kg)} {displayLabel}</span>
                {!readOnly && (
                  <button
                    onClick={() => remove(e.id)}
                    aria-label={`Delete weigh-in for ${e.date}`}
                    className="text-red-500 hover:bg-red-50 p-1 rounded"
                    data-testid={`weigh-del-${e.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};

export default WeighInPanel;
