import React, { useCallback, useEffect, useState } from 'react';
import { Coaches } from '../../lib/api';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { useToast } from '../../hooks/use-toast';
import { FeedbackCard } from './FeedbackCard';
import { MessageSquareHeart, Loader2, Send, Undo2, Clock } from 'lucide-react';

const FeedbackPanel = ({ clientId, onChange }) => {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => Coaches.coachClientFeedback(clientId).then(d => { setData(d); onChange?.(d); }).catch(() => setData({ items: [] })), [clientId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const request = async () => {
    setBusy(true);
    try { await Coaches.requestFeedback(clientId, note); toast({ title: 'Feedback requested', description: 'The client has been emailed and will see the prompt in their portal.' }); setNote(''); load(); }
    catch (e) { toast({ title: 'Could not send request', description: String(e.response?.data?.detail || e.message), variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  const withdraw = async () => {
    setBusy(true);
    try { await Coaches.withdrawFeedbackRequest(clientId); toast({ title: 'Request withdrawn' }); load(); }
    finally { setBusy(false); }
  };

  return (
    <div className="bg-white border rounded-xl p-6 space-y-4" data-testid="feedback-panel">
      <div>
        <h2 className="text-lg font-black flex items-center gap-2"><MessageSquareHeart className="h-5 w-5 text-[#c8a24a]" /> Client feedback</h2>
        <p className="text-xs text-slate-500 mt-1">Clients can leave feedback any time from their portal. At the end of a plan, send a formal request — the certificate waits until they've answered.</p>
      </div>
      {!data ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : (
        <>
          {data.pending_request ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start justify-between gap-3 flex-wrap" data-testid="feedback-pending">
              <div className="text-sm text-amber-900"><p className="font-bold inline-flex items-center gap-1.5"><Clock className="h-4 w-4" /> End-of-plan feedback requested {new Date(data.feedback_requested_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} — awaiting the client</p>{data.feedback_request_note && <p className="text-xs mt-1 italic">“{data.feedback_request_note}”</p>}</div>
              <Button variant="outline" size="sm" onClick={withdraw} disabled={busy} className="gap-1" data-testid="feedback-withdraw-btn"><Undo2 className="h-3.5 w-3.5" /> Withdraw</Button>
            </div>
          ) : (
            <div className="rounded-xl border p-4 space-y-2" data-testid="feedback-request-box">
              <p className="text-sm font-semibold text-slate-800">Request end-of-plan feedback</p>
              <Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Optional note to the client, e.g. “Brilliant 12 weeks — two minutes of honest feedback and I'll send your certificate over.”" data-testid="feedback-request-note" />
              <Button onClick={request} disabled={busy} className="bg-[#0b1528] hover:bg-slate-800 text-white gap-2" data-testid="feedback-request-btn">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send request</Button>
            </div>
          )}
          {data.items.length === 0 ? <p className="text-sm text-slate-500">No feedback from this client yet.</p> : (
            <div className="space-y-3">{data.items.map(f => <FeedbackCard key={f.id} f={f} />)}</div>
          )}
        </>
      )}
    </div>
  );
};

export default FeedbackPanel;
