import React, { useEffect, useState } from 'react';
import { Coaches } from '../../lib/api';
import { Send } from 'lucide-react';

const CoachMessages = ({ compact = false, src = null }) => {
  const [msgs, setMsgs] = useState([]);
  const [draft, setDraft] = useState('');
  const mine = src?.coachView ? 'coach' : 'client';
  const load = () => (src ? src.messages() : Coaches.myMessages()).then(setMsgs).catch(() => {});
  useEffect(() => { load(); }, [src]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = async () => {
    if (!draft.trim()) return;
    try {
      await (src ? src.sendMessage(draft.trim()) : Coaches.sendMyMessage(draft.trim()));
      setDraft('');
      load();
    } catch (_) { /* ignore */ }
  };
  return (
    <div data-testid="coach-messages">
      <div className={`${compact ? 'max-h-64' : 'max-h-[28rem]'} overflow-y-auto space-y-2 mb-3 border rounded-xl p-3 bg-slate-50`}>
        {msgs.length === 0 ? <p className="text-xs text-slate-500 italic">No messages yet — send one below.</p> :
          msgs.map(m => (
            <div key={m.id} className={`text-sm p-3 rounded-xl max-w-[80%] ${m.from_role === mine ? 'bg-slate-900 text-white ml-auto' : 'bg-white border'}`}>
              <p className="whitespace-pre-wrap">{m.body}</p>
              <p className={`text-[10px] mt-1 ${m.from_role === mine ? 'text-slate-300' : 'text-slate-500'}`}>{new Date(m.created_at).toLocaleString('en-GB')}</p>
            </div>
          ))}
      </div>
      <div className="flex gap-2">
        <input value={draft} onChange={e => setDraft(e.target.value)} placeholder={mine === 'coach' ? 'Reply to your client…' : 'Message your coach…'} onKeyDown={e => e.key === 'Enter' && send()} className="flex-1 border rounded-lg px-3 py-2 text-sm" data-testid="message-input" />
        <button onClick={send} disabled={!draft.trim()} className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm px-4 py-2 rounded-lg disabled:opacity-50 inline-flex items-center gap-2" data-testid="message-send-btn"><Send className="h-4 w-4" /> Send</button>
      </div>
    </div>
  );
};

export default CoachMessages;
