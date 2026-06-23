import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Label } from './ui/label';

const AgeModal = () => {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState('');

  useEffect(() => {
    const verified = sessionStorage.getItem('ghp_age_verified');
    if (!verified) setOpen(true);
  }, []);

  const submit = () => {
    if (choice === 'yes') {
      sessionStorage.setItem('ghp_age_verified', 'true');
      setOpen(false);
    } else if (choice === 'no') {
      window.location.href = 'https://www.google.com';
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-md [&>button]:hidden">
        <DialogHeader>
          <DialogTitle className="text-center text-lg font-bold tracking-wide">
            GH PEPTIDES – RESEARCH PEPTIDE<br />TERMS &amp; CONDITIONS DISCLAIMER
          </DialogTitle>
        </DialogHeader>
        <div className="border rounded-md p-4 mt-2">
          <h4 className="font-bold text-center mb-2">AGE REQUIREMENT</h4>
          <p className="text-sm text-slate-700 leading-relaxed">
            By accessing the GH Peptides website or purchasing any research materials, you confirm that you are 18 years of age or older and legally permitted to purchase laboratory-grade research products in your region. Any form of ingestion, injection, or topical use is prohibited.
          </p>
        </div>
        <RadioGroup value={choice} onValueChange={setChoice} className="flex justify-center gap-8 mt-3">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="yes" id="age-yes" />
            <Label htmlFor="age-yes">Yes</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="no" id="age-no" />
            <Label htmlFor="age-no">No</Label>
          </div>
        </RadioGroup>
        <Button onClick={submit} disabled={!choice} className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold uppercase tracking-wide">
          Submit
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default AgeModal;
