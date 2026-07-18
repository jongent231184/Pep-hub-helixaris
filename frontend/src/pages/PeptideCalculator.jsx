import React, { useMemo, useState } from 'react';
import Layout from '../components/Layout';
import Breadcrumbs from '../components/Breadcrumbs';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { Beaker, Syringe, Droplet, Target, AlertTriangle, CheckCircle2 } from 'lucide-react';

const SYRINGES = [
  { ml: 0.3, units: 30, label: '0.3 ml · 30 units' },
  { ml: 0.5, units: 50, label: '0.5 ml · 50 units' },
  { ml: 1.0, units: 100, label: '1.0 ml · 100 units' },
];
const VIAL_MG = [1, 2, 5, 10, 15];
const BAC_ML = [1, 2, 3, 5];
const DOSE_MCG = [50, 100, 250, 500, 1000];

const ChipRow = ({ options, value, onChange, suffix, allowOther = true, otherValue, onOtherChange }) => (
  <div className="flex flex-wrap gap-2 mt-2">
    {options.map((v) => (
      <button
        type="button"
        key={v}
        onClick={() => onChange(v)}
        className={`px-4 py-2 rounded-full text-sm font-bold uppercase tracking-wider border transition-colors ${value === v && !otherValue
          ? 'bg-sky-500 text-white border-sky-500'
          : 'bg-white text-slate-700 border-slate-300 hover:border-sky-400'}`}
        data-testid={`chip-${v}`}
      >
        {v}{suffix}
      </button>
    ))}
    {allowOther && (
      <div className="flex items-center gap-2">
        <Input
          type="number"
          step="any"
          min="0"
          value={otherValue}
          onChange={(e) => onOtherChange(e.target.value)}
          placeholder="Other"
          className={`w-28 h-10 ${otherValue ? 'border-sky-500 ring-1 ring-sky-500' : ''}`}
        />
        <span className="text-sm text-slate-500">{suffix}</span>
      </div>
    )}
  </div>
);

const StepCard = ({ icon: Icon, label, children }) => (
  <div className="bg-white border border-slate-200 rounded-lg p-6">
    <div className="flex items-start gap-3 mb-1">
      <div className="h-9 w-9 shrink-0 rounded-lg bg-sky-100 text-sky-700 grid place-items-center">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="font-bold uppercase text-sm tracking-wider text-slate-900">{label}</div>
      </div>
    </div>
    {children}
  </div>
);

const PeptideCalculator = () => {
  const [syringe, setSyringe] = useState(SYRINGES[1]);
  const [vial, setVial] = useState(5);
  const [vialOther, setVialOther] = useState('');
  const [bac, setBac] = useState(2);
  const [bacOther, setBacOther] = useState('');
  const [dose, setDose] = useState(250);
  const [doseOther, setDoseOther] = useState('');

  const vialMg = Number(vialOther) > 0 ? Number(vialOther) : vial;
  const bacMl = Number(bacOther) > 0 ? Number(bacOther) : bac;
  const doseMcg = Number(doseOther) > 0 ? Number(doseOther) : dose;

  const result = useMemo(() => {
    if (!vialMg || !bacMl || !doseMcg) return null;
    const concentrationMcgPerMl = (vialMg * 1000) / bacMl;
    const volumeMlPerDose = doseMcg / concentrationMcgPerMl;
    const units = volumeMlPerDose * 100;
    const dosesPerVial = (vialMg * 1000) / doseMcg;
    return {
      concentrationMcgPerMl,
      volumeMlPerDose,
      units,
      dosesPerVial,
      overflow: units > syringe.units,
    };
  }, [vialMg, bacMl, doseMcg, syringe.units]);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-10">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Peptide Calculator' }]} />
        <div className="mt-4 mb-8">
          <h1 className="text-4xl sm:text-5xl font-black uppercase tracking-tight text-slate-900">Peptide Calculator</h1>
          <p className="mt-3 text-slate-600 text-base max-w-2xl">
            Work out exactly how many insulin-syringe units to draw for a specific research dose. Set your syringe size, vial strength, bacteriostatic water volume, and target dose — the result updates instantly.
          </p>
        </div>

        <div className="grid lg:grid-cols-[1.35fr_1fr] gap-6 lg:gap-8">
          {/* Inputs */}
          <div className="space-y-4">
            <StepCard icon={Syringe} label="1 · Insulin syringe size">
              <div className="grid grid-cols-3 gap-2 mt-3">
                {SYRINGES.map((s) => (
                  <button
                    key={s.units}
                    type="button"
                    onClick={() => setSyringe(s)}
                    className={`px-3 py-3 rounded-lg text-xs font-bold uppercase tracking-wider border transition-colors ${syringe.units === s.units
                      ? 'bg-sky-500 text-white border-sky-500'
                      : 'bg-white text-slate-700 border-slate-300 hover:border-sky-400'}`}
                    data-testid={`syringe-${s.units}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </StepCard>

            <StepCard icon={Beaker} label="2 · Peptide vial strength">
              <ChipRow
                options={VIAL_MG}
                value={vial}
                onChange={(v) => { setVial(v); setVialOther(''); }}
                suffix=" mg"
                otherValue={vialOther}
                onOtherChange={setVialOther}
              />
            </StepCard>

            <StepCard icon={Droplet} label="3 · Bacteriostatic water added">
              <ChipRow
                options={BAC_ML}
                value={bac}
                onChange={(v) => { setBac(v); setBacOther(''); }}
                suffix=" ml"
                otherValue={bacOther}
                onOtherChange={setBacOther}
              />
            </StepCard>

            <StepCard icon={Target} label="4 · Desired dose per injection">
              <ChipRow
                options={DOSE_MCG}
                value={dose}
                onChange={(v) => { setDose(v); setDoseOther(''); }}
                suffix=" mcg"
                otherValue={doseOther}
                onOtherChange={setDoseOther}
              />
            </StepCard>
          </div>

          {/* Result */}
          <aside className="lg:sticky lg:top-24 self-start bg-slate-900 rounded-xl p-6 text-white shadow-xl" data-testid="calculator-result">
            <p className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold mb-2">Result</p>
            {result ? (
              <>
                <p className="text-sm text-slate-300 mb-3 leading-relaxed">
                  For a <span className="font-bold text-white">{doseMcg} mcg</span> dose, draw the syringe to:
                </p>
                <div className={`text-5xl font-black tracking-tight ${result.overflow ? 'text-amber-300' : 'text-emerald-400'}`}>
                  {result.units.toFixed(result.units < 10 ? 1 : 0)}
                  <span className="text-2xl text-slate-400 font-bold ml-2">units</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  = {result.volumeMlPerDose.toFixed(3)} ml
                </p>

                {result.overflow && (
                  <div className="mt-4 flex items-start gap-2 border border-amber-400/50 bg-amber-400/10 rounded-lg p-3 text-xs text-amber-200">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      This dose requires <strong>{result.units.toFixed(1)} units</strong>, which exceeds your <strong>{syringe.units}-unit</strong> syringe.
                      Use a larger syringe, split the dose, or add less BAC water.
                    </span>
                  </div>
                )}

                <div className="mt-5 pt-5 border-t border-slate-700 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Concentration</span>
                    <span className="font-mono font-semibold">{result.concentrationMcgPerMl.toFixed(0)} mcg/ml</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Doses per vial</span>
                    <span className="font-mono font-semibold">{result.dosesPerVial.toFixed(1)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Syringe capacity</span>
                    <span className="font-mono font-semibold">{syringe.units} units · {syringe.ml} ml</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-300">Enter values on the left to see the exact draw.</p>
            )}
          </aside>
        </div>

        {/* Educational content */}
        <div className="mt-14 border-t border-slate-200 pt-10 space-y-8 text-slate-700 max-w-3xl">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900 mb-3">How to reconstitute a peptide</h2>
            <ol className="space-y-3 list-decimal list-inside text-sm leading-relaxed">
              <li><strong>Sterilise your workspace.</strong> Wash hands, wear gloves, and swab both the peptide and BAC water vial tops with alcohol.</li>
              <li><strong>Bring vials to room temperature.</strong> Using cold vials disrupts full dissolution.</li>
              <li><strong>Draw the calculated volume of BAC water</strong> into a sterile syringe.</li>
              <li><strong>Slowly inject the water down the side of the peptide vial</strong> at a 45° angle — direct contact with the powder can foam or damage the peptide.</li>
              <li><strong>Swirl gently until fully dissolved</strong> — do not shake.</li>
              <li><strong>Store reconstituted peptide at +4°C</strong> and use within 3-4 weeks, or freeze aliquots at -20°C for longer storage.</li>
            </ol>
          </div>

          <div className="border border-amber-200 bg-amber-50 rounded-lg p-5 text-sm text-amber-900 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5 text-amber-700" />
            <p>
              <strong>For research use only.</strong> All peptides sold by GHP-Health are supplied strictly for laboratory research purposes.
              Not for human or animal consumption. Handle in accordance with your local regulations and safety guidelines.
            </p>
          </div>

          <div className="text-center pt-4">
            <Button asChild className="bg-sky-500 hover:bg-sky-600 text-white uppercase tracking-wider font-bold text-sm px-8 h-11">
              <a href="/vials">Browse research peptides →</a>
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default PeptideCalculator;
