import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { useToast } from '../hooks/use-toast';

const AgeModal = () => {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    const verified = sessionStorage.getItem('ghp_age_verified');
    if (!verified) setOpen(true);
  }, []);

  const submit = () => {
    if (!choice) {
      toast({ title: 'Please select Yes or No to continue', variant: 'destructive' });
      return;
    }
    if (choice === 'yes') {
      sessionStorage.setItem('ghp_age_verified', 'true');
      setOpen(false);
    } else {
      window.location.href = 'https://www.google.com';
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-md [&>button]:hidden p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="text-center text-base md:text-lg font-bold tracking-wide leading-snug">
            GHP-HEALTH &ndash; RESEARCH PEPTIDE<br />TERMS &amp; CONDITIONS DISCLAIMER
          </DialogTitle>
        </DialogHeader>

        <div className="px-6">
          <div className="border border-slate-200 rounded-md p-4">
            <h4 className="font-bold text-center mb-2 text-sm tracking-wide">AGE REQUIREMENT</h4>
            <p className="text-sm text-slate-700 leading-relaxed">
              By accessing the GHP-Health website or purchasing any research materials, you confirm that you are 18 years of age or older and legally permitted to purchase laboratory-grade research products in your region. Any form of ingestion, injection, or topical use is prohibited.
            </p>
          </div>
        </div>

        {/* Radio choices */}
        <div className="px-6 flex justify-center gap-10 py-2">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="radio"
              name="age-choice"
              value="yes"
              checked={choice === 'yes'}
              onChange={() => setChoice('yes')}
              className="h-4 w-4 accent-sky-500 cursor-pointer"
            />
            <span className="text-sm font-medium">Yes</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="radio"
              name="age-choice"
              value="no"
              checked={choice === 'no'}
              onChange={() => setChoice('no')}
              className="h-4 w-4 accent-sky-500 cursor-pointer"
            />
            <span className="text-sm font-medium">No</span>
          </label>
        </div>

        {/* Always-visible Submit button */}
        <div className="px-6 pb-6">
          <Button
            onClick={submit}
            className="w-full h-12 bg-sky-500 hover:bg-sky-600 active:bg-sky-700 text-white font-bold uppercase tracking-widest text-sm rounded-md shadow-md transition-colors"
          >
            Submit
          </Button>
          <p className="text-[11px] text-slate-500 text-center mt-3">
            By clicking Submit you confirm you have read and agree to the disclaimer.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AgeModal;
