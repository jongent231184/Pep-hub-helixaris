import React, { useCallback, useEffect, useState } from 'react';
import { Coaches } from '../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { useToast } from '../../hooks/use-toast';
import { PhotosPanel, CertificateList } from './PhotosAndCertificates';
import { Award, Loader2, Quote } from 'lucide-react';

const OPTS = [
  ['include_identity', 'Client name, plan tier & dates'],
  ['anonymise', 'First name only (anonymised for sharing)'],
  ['include_photos', 'Before / after photos (pick up to 3 below)'],
  ['include_summary', "Journey summary (your written paragraph)"],
  ['include_coach_note', "Coach's closing note"],
  ['send_email', 'Email the certificate PDF to the client now (with your note)'],
];
const STATS = [['weeks', 'Weeks completed'], ['weight', 'Weight start → finish'], ['checkins', 'Check-ins submitted'], ['doses', 'Dose adherence %']];

const CertificatePanel = ({ clientId }) => {
  const { toast } = useToast();
  const [form, setForm] = useState({ headline: 'Certificate of Completion', include_identity: true, anonymise: false, include_results: true, stats: ['weeks', 'weight', 'checkins', 'doses'], include_photos: false, include_review: true, feedback_id: null, include_summary: false, summary_text: '', include_coach_note: true, send_email: true, review_text: '', coach_note: '', skip_feedback_check: false });
  const [photoIds, setPhotoIds] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const fetchCerts = useCallback(() => Coaches.coachCertificates(clientId), [clientId, refresh]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setPhotoIds([]);
    Coaches.coachClientFeedback(clientId).then(d => setQuotes(d.items.filter(f => f.allow_certificate && f.testimonial))).catch(() => setQuotes([]));
  }, [clientId]);
  const toggleStat = (k) => setForm(f => ({ ...f, stats: f.stats.includes(k) ? f.stats.filter(s => s !== k) : [...f.stats, k] }));

  const issue = async () => {
    setBusy(true);
    try {
      const c = await Coaches.issueCertificate(clientId, { ...form, include_results: form.stats.length > 0, photo_ids: photoIds.slice(0, 3) });
      toast({ title: 'Certificate generated', description: c.emailed_at ? 'Emailed to the client with the PDF attached. Also on their portal dashboard.' : c.email_error ? `Saved to portal, but email failed: ${c.email_error}` : 'The client can now open it from their portal dashboard.' });
      setRefresh(r => r + 1);
      const url = await Coaches.certificateBlob(c.id); window.open(url, '_blank');
    } catch (e) { toast({ title: 'Could not generate', description: String(e.response?.data?.detail || e.message), variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="bg-white border rounded-xl p-6 space-y-5" data-testid="certificate-panel">
      <div>
        <h2 className="text-lg font-black flex items-center gap-2"><Award className="h-5 w-5 text-amber-600" /> Completion certificate & review</h2>
        <p className="text-xs text-slate-500 mt-1">Generate a shareable PDF when a plan finishes. Pick which journey numbers, your summary and whose quote appears — the client can download it from their dashboard and share it in the group.</p>
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-600 mb-2">Progress photos (client's private uploads)</p>
        <PhotosPanel readOnly fetchPhotos={() => Coaches.coachPhotos(clientId)} selectable={form.include_photos} selected={photoIds} onToggle={(id) => setPhotoIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id].slice(-3))} />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Input value={form.headline} onChange={e => setForm(f => ({ ...f, headline: e.target.value }))} placeholder="Headline" data-testid="cert-headline" />
          {OPTS.map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-sm text-slate-800"><input type="checkbox" checked={!!form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.checked }))} data-testid={`cert-opt-${k}`} /> {label}</label>
          ))}
          <div className="border rounded-lg p-3 mt-2" data-testid="cert-stats-box">
            <p className="text-xs font-bold text-slate-600 mb-1.5">Journey numbers to show</p>
            <div className="grid grid-cols-2 gap-1.5">
              {STATS.map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 text-xs text-slate-800"><input type="checkbox" checked={form.stats.includes(k)} onChange={() => toggleStat(k)} data-testid={`cert-stat-${k}`} /> {label}</label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600 pt-1"><input type="checkbox" checked={form.skip_feedback_check} onChange={e => setForm(f => ({ ...f, skip_feedback_check: e.target.checked }))} data-testid="cert-opt-skip-feedback" /> Issue even if my end-of-plan feedback request is unanswered</label>
        </div>
        <div className="space-y-2">
          <div className="border rounded-lg p-3 space-y-2" data-testid="cert-quote-box">
            <label className="flex items-center gap-2 text-sm text-slate-800"><input type="checkbox" checked={form.include_review} onChange={e => setForm(f => ({ ...f, include_review: e.target.checked }))} data-testid="cert-opt-include_review" /> Quote on the certificate</label>
            {form.include_review && (
              <>
                <select value={form.feedback_id || ''} onChange={e => setForm(f => ({ ...f, feedback_id: e.target.value || null }))} className="w-full border rounded-lg px-3 py-2 text-sm bg-white" data-testid="cert-quote-source">
                  <option value="">I'll write the quote on their behalf</option>
                  {quotes.map(q => <option key={q.id} value={q.id}>Client's own words · {new Date(q.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {q.rating_overall}★</option>)}
                </select>
                {form.feedback_id
                  ? <p className="text-sm italic text-slate-700 bg-[#fdf8ea] border border-[#f3dc9a] rounded-lg p-3 flex gap-2" data-testid="cert-quote-preview"><Quote className="h-4 w-4 text-[#c8a24a] shrink-0" /> {quotes.find(q => q.id === form.feedback_id)?.testimonial}</p>
                  : <Textarea rows={3} value={form.review_text} onChange={e => setForm(f => ({ ...f, review_text: e.target.value }))} placeholder="Review quote — e.g. “Dropped 6kg in 12 weeks and finally sleeping properly. James kept me on track every single week.”" data-testid="cert-review" />}
                {quotes.length === 0 && <p className="text-[11px] text-slate-500">No client quotes approved for the certificate yet — ask for end-of-plan feedback above.</p>}
              </>
            )}
          </div>
          <Textarea rows={3} value={form.summary_text} onChange={e => setForm(f => ({ ...f, summary_text: e.target.value }))} placeholder="Journey summary — e.g. “Started on a 12-week recomposition block focused on sleep and consistency; built up to three sessions a week and never missed a check-in.”" disabled={!form.include_summary} data-testid="cert-summary" />
          <Textarea rows={2} value={form.coach_note} onChange={e => setForm(f => ({ ...f, coach_note: e.target.value }))} placeholder="Your closing note to the client" disabled={!form.include_coach_note} data-testid="cert-coach-note" />
          <Button onClick={issue} disabled={busy} className="w-full bg-amber-500 hover:bg-amber-600 text-[#0b1528] font-bold gap-2" data-testid="cert-generate-btn">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />} Generate certificate PDF</Button>
        </div>
      </div>
      <CertificateList fetchCerts={fetchCerts} onDelete={(id) => Coaches.deleteCertificate(id)} onShare={(id, shared) => Coaches.coachShareCertificate(id, shared)} />
    </div>
  );
};

export default CertificatePanel;
