import React, { useCallback, useEffect, useState } from 'react';
import { Coaches } from '../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { useToast } from '../../hooks/use-toast';
import { PhotosPanel, CertificateList } from './PhotosAndCertificates';
import { Award, Loader2 } from 'lucide-react';

const OPTS = [
  ['include_identity', 'Client name, plan tier & dates'],
  ['anonymise', 'First name only (anonymised for sharing)'],
  ['include_results', 'Results: weight change, check-ins, doses completed'],
  ['include_photos', 'Before / after photos (pick up to 3 below)'],
  ['include_review', 'Review quote (written by you on their behalf)'],
  ['include_coach_note', "Coach's closing note"],
  ['send_email', 'Email the certificate PDF to the client now (with your note)'],
];

const CertificatePanel = ({ clientId }) => {
  const { toast } = useToast();
  const [form, setForm] = useState({ headline: 'Certificate of Completion', include_identity: true, anonymise: false, include_results: true, include_photos: false, include_review: true, include_coach_note: true, send_email: true, review_text: '', coach_note: '' });
  const [photoIds, setPhotoIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const fetchCerts = useCallback(() => Coaches.coachCertificates(clientId), [clientId, refresh]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPhotoIds([]); }, [clientId]);

  const issue = async () => {
    setBusy(true);
    try {
      const c = await Coaches.issueCertificate(clientId, { ...form, photo_ids: photoIds.slice(0, 3) });
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
        <p className="text-xs text-slate-500 mt-1">Generate a shareable PDF when a plan finishes. Tick what to include — the client can download it from their dashboard and share it in the group.</p>
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
        </div>
        <div className="space-y-2">
          <Textarea rows={4} value={form.review_text} onChange={e => setForm(f => ({ ...f, review_text: e.target.value }))} placeholder="Review quote — e.g. “Dropped 6kg in 12 weeks and finally sleeping properly. James kept me on track every single week.”" disabled={!form.include_review} data-testid="cert-review" />
          <Textarea rows={3} value={form.coach_note} onChange={e => setForm(f => ({ ...f, coach_note: e.target.value }))} placeholder="Your closing note to the client" disabled={!form.include_coach_note} data-testid="cert-coach-note" />
          <Button onClick={issue} disabled={busy} className="w-full bg-amber-500 hover:bg-amber-600 text-[#0b1528] font-bold gap-2" data-testid="cert-generate-btn">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />} Generate certificate PDF</Button>
        </div>
      </div>
      <CertificateList fetchCerts={fetchCerts} onDelete={(id) => Coaches.deleteCertificate(id)} />
    </div>
  );
};

export default CertificatePanel;
