import React, { useState } from 'react';
import Layout from '../components/Layout';
import Breadcrumbs from '../components/Breadcrumbs';
import { Coaching } from '../lib/api';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { useToast } from '../hooks/use-toast';
import { Users, Scale, ClipboardList, Calculator, BookOpen, ShieldAlert, Loader2, CheckCircle2, Sparkles } from 'lucide-react';

const AREAS = [
  { value: 'weightloss', label: 'Weight loss', icon: Scale, blurb: 'Peptide-supported weight loss approach and lifestyle guidance.' },
  { value: 'peptide_info', label: 'Peptide Information', icon: BookOpen, blurb: 'Learn what each peptide is, how it works and when to use it.' },
  { value: 'dosage_guide', label: 'Dosage Guide', icon: Calculator, blurb: 'Reference dosing for the compound you are researching.' },
  { value: 'how_to_guide', label: 'How-to Guide', icon: ClipboardList, blurb: 'Vials, pens, reconstitution — practical walkthroughs.' },
];

const Coaching_ = () => {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    area: '',
    message: '',
    waiver_accepted: false,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.first_name || !form.email || !form.area || !form.waiver_accepted) {
      toast({ title: 'Please fill in the required fields', description: 'Name, email, area and waiver are all required.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      await Coaching.submit(form);
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      toast({ title: 'Could not submit request', description: String(err.response?.data?.detail || err.message), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-10">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Coaching' }]} />

        {/* Hero */}
        <section className="mt-6 mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-[11px] uppercase tracking-widest text-emerald-800 font-bold mb-4">
            <Sparkles className="h-3.5 w-3.5" /> Peer education · Non-clinical
          </div>
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight text-slate-900 max-w-3xl">
            1-to-1 Coaching with <span className="text-sky-600">James</span>
          </h1>
          <p className="text-slate-600 mt-4 text-base leading-relaxed max-w-2xl">
            Get a personal plan built by an experienced peptide user. James will walk you through
            your protocol, answer your questions, and check in on your progress — all remote, all on your schedule.
          </p>
          <p className="text-xs text-slate-500 mt-3 max-w-2xl">
            <strong className="text-slate-700">Please note:</strong> Coaching is peer-to-peer education based on personal experience, not medical advice, diagnosis or treatment. James is not a doctor or clinician.
          </p>
        </section>

        {submitted ? (
          <section className="max-w-2xl bg-white border-2 border-emerald-200 rounded-xl p-8 md:p-10" data-testid="coaching-success">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-full bg-emerald-100 grid place-items-center shrink-0">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-2xl font-black uppercase text-slate-900">Request received</h2>
                <p className="text-slate-600 mt-3">
                  Thanks, <strong>{form.first_name}</strong>. James has been notified and will reply to <strong>{form.email}</strong> within 48 hours. If you don&apos;t see anything, please check your spam folder.
                </p>
                <p className="text-xs text-slate-500 mt-6">Reference sent — no need to resubmit.</p>
                <Button
                  onClick={() => { setSubmitted(false); setForm({ first_name: '', last_name: '', email: '', phone: '', area: '', message: '', waiver_accepted: false }); }}
                  variant="outline"
                  className="mt-6"
                >
                  Submit another request
                </Button>
              </div>
            </div>
          </section>
        ) : (
          <div className="grid lg:grid-cols-[1fr_1.1fr] gap-8 lg:gap-12">
            {/* Left column — areas of coaching */}
            <div className="space-y-4">
              <h2 className="text-xs uppercase tracking-widest text-slate-500 font-bold">What we can cover</h2>
              {AREAS.map(a => (
                <div key={a.value} className="bg-white border border-slate-200 rounded-lg p-5 flex items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-sky-50 text-sky-600 grid place-items-center shrink-0">
                    <a.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-black uppercase text-sm">{a.label}</p>
                    <p className="text-sm text-slate-600 mt-1">{a.blurb}</p>
                  </div>
                </div>
              ))}
              <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 flex gap-2 text-xs text-amber-900">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <p><strong>Coaching is educational, not medical.</strong> Nothing James shares constitutes medical advice or a prescription. Always consult a qualified healthcare professional before starting anything new.</p>
              </div>
            </div>

            {/* Right column — form */}
            <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-6 md:p-8 h-fit" data-testid="coaching-form">
              <div className="flex items-center gap-2 mb-6">
                <Users className="h-5 w-5 text-sky-600" />
                <h2 className="text-lg font-black uppercase">Request coaching</h2>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>First name *</Label>
                  <Input required value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} className="mt-1" data-testid="coaching-first-name" />
                </div>
                <div>
                  <Label>Last name</Label>
                  <Input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label>Email *</Label>
                  <Input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="mt-1" data-testid="coaching-email" />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="mt-1" placeholder="Optional" />
                </div>
              </div>

              <div className="mt-4">
                <Label>Area of coaching *</Label>
                <Select value={form.area} onValueChange={v => setForm(f => ({ ...f, area: v }))}>
                  <SelectTrigger className="mt-1" data-testid="coaching-area-select"><SelectValue placeholder="Choose an area…" /></SelectTrigger>
                  <SelectContent>
                    {AREAS.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="mt-4">
                <Label>Anything specific you&apos;d like James to know? (optional)</Label>
                <Textarea rows={4} value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder="e.g. current compound, goals, timescales…" className="mt-1" />
              </div>

              <div className="mt-6 border-l-4 border-amber-400 bg-amber-50 rounded p-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    checked={form.waiver_accepted}
                    onCheckedChange={v => setForm(f => ({ ...f, waiver_accepted: !!v }))}
                    className="mt-0.5"
                    data-testid="coaching-waiver"
                  />
                  <span className="text-xs text-slate-800 leading-relaxed">
                    I understand that GHP-Health coaching is <strong>peer-to-peer education based on personal experience</strong>. It is <strong>not medical advice</strong>, diagnosis, or treatment. James is <strong>not a licensed healthcare professional</strong>. I agree to consult a qualified doctor before starting any new protocol and I take full responsibility for my own decisions.
                  </span>
                </label>
              </div>

              <Button
                type="submit"
                disabled={submitting || !form.waiver_accepted}
                className="mt-6 w-full h-12 bg-sky-500 hover:bg-sky-600 text-white font-bold uppercase tracking-wider"
                data-testid="coaching-submit-btn"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit request'}
              </Button>

              <p className="text-[11px] text-slate-500 mt-3 text-center">
                We&apos;ll email James at <span className="font-mono">ghp-coaching@outlook.com</span> — you&apos;ll receive a reply within 48 hours.
              </p>
            </form>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Coaching_;
