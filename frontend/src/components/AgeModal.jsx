import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { useToast } from '../hooks/use-toast';
import BRAND from '../config/brand';

const AgeModal = () => {
  const [open, setOpen] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [researchConfirmed, setResearchConfirmed] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const verified = sessionStorage.getItem('ghp_age_verified');
    if (!verified) setOpen(true);
  }, []);

  const canSubmit = ageConfirmed && researchConfirmed;

  const submit = () => {
    if (!canSubmit) {
      toast({
        title: 'Please confirm both statements to continue',
        variant: 'destructive',
      });
      return;
    }
    sessionStorage.setItem('ghp_age_verified', 'true');
    setOpen(false);
  };

  const decline = () => {
    window.location.href = 'https://www.google.com';
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-md [&>button]:hidden p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="text-center text-base md:text-lg font-bold tracking-wide leading-snug">
            {BRAND.name.toUpperCase()} &ndash; RESEARCH PEPTIDE<br />TERMS &amp; CONDITIONS DISCLAIMER
          </DialogTitle>
        </DialogHeader>

        <div className="px-6">
          <div className="border border-slate-200 rounded-md p-4">
            <h4 className="font-bold text-center mb-2 text-sm tracking-wide">TERMS OF USE</h4>
            <p className="text-sm text-slate-700 leading-relaxed">
              By accessing the {BRAND.fullName} website or purchasing any research materials, you confirm that you are 18 years of age or older, legally permitted to purchase laboratory-grade research products in your region, and that all products will be used for research and educational purposes only. Any form of ingestion, injection, inhalation, or topical use is prohibited.
            </p>
          </div>
        </div>

        {/* Compliance tickboxes — BOTH required to enable Submit */}
        <div className="px-6 py-4 space-y-3">
          <label
            className="flex items-start gap-3 cursor-pointer select-none"
            data-testid="age-gate-age-label"
          >
            <input
              type="checkbox"
              checked={ageConfirmed}
              onChange={(e) => setAgeConfirmed(e.target.checked)}
              className="h-4 w-4 mt-0.5 accent-sky-500 cursor-pointer shrink-0"
              data-testid="age-gate-age-checkbox"
            />
            <span className="text-sm text-slate-800 leading-snug">
              I confirm I am <strong>18 years of age or older</strong> and legally permitted to purchase laboratory research products in my region.
            </span>
          </label>

          <label
            className="flex items-start gap-3 cursor-pointer select-none"
            data-testid="age-gate-research-label"
          >
            <input
              type="checkbox"
              checked={researchConfirmed}
              onChange={(e) => setResearchConfirmed(e.target.checked)}
              className="h-4 w-4 mt-0.5 accent-sky-500 cursor-pointer shrink-0"
              data-testid="age-gate-research-checkbox"
            />
            <span className="text-sm text-slate-800 leading-snug">
              I confirm these products are <strong>for research use only</strong> — not for human or animal consumption, ingestion, injection, inhalation, or topical use.
            </span>
          </label>
        </div>

        {/* Enter / decline actions */}
        <div className="px-6 pb-6 space-y-2">
          <Button
            onClick={submit}
            disabled={!canSubmit}
            className="w-full h-12 bg-sky-500 hover:bg-sky-600 active:bg-sky-700 text-white font-bold uppercase tracking-widest text-sm rounded-md shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="age-gate-submit-btn"
          >
            Enter site
          </Button>
          <button
            type="button"
            onClick={decline}
            className="w-full text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2"
            data-testid="age-gate-decline-btn"
          >
            I do not agree — take me elsewhere
          </button>
          <p className="text-[11px] text-slate-500 text-center pt-1">
            Both boxes must be ticked to enter. By entering you accept our <a href="/terms" className="underline hover:text-sky-600">Terms &amp; Conditions</a>.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AgeModal;
