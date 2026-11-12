import React, { useState } from 'react';
import { MessageCircle, Phone, Pencil, Check, X } from 'lucide-react';
import { BRAND } from '../../config/brand';
import { Coaches } from '../../lib/api';
import { useToast } from '../../hooks/use-toast';

export const waDigits = (phone) => (phone || '').replace(/[^\d]/g, '');
export const ukPhone = (raw) => { const d = waDigits(raw); return d.startsWith('0') && d.length === 11 ? `+44${d.slice(1)}` : `+${d}`; };

export const nudgeText = ({ firstName, coachName, kind = 'message' }) => {
  const site = window.location.origin;
  const who = `${coachName || 'your coach'} from ${BRAND.name} coaching`;
  if (kind === 'enquiry') return `Hi ${firstName || 'there'}, it's ${who}. Thanks for your enquiry — I've replied by email, and you can see it (plus pick a plan) at ${site}/coaching. No need to reply here.`;
  if (kind === 'checkin') return `Hi ${firstName || 'there'}, it's ${who}. Quick nudge — this week's check-in is still open in your portal: ${site}/portal/check-in. Two minutes and you're done.`;
  return `Hi ${firstName || 'there'}, it's ${who}. You've got an unread message waiting in your coaching portal — have a look when you get a minute: ${site}/portal/messages. No need to reply here.`;
};

export const WhatsAppButton = ({ phone, firstName, coachName, kind, label = 'WhatsApp nudge', className = '', size = 'sm', testId = 'whatsapp-nudge-btn' }) => {
  const digits = waDigits(phone);
  if (!digits) return null;
  const href = `https://wa.me/${digits}?text=${encodeURIComponent(nudgeText({ firstName, coachName, kind }))}`;
  const pad = size === 'xs' ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs';
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1.5 rounded-lg font-bold text-white bg-[#25D366] hover:bg-[#1ebe5b] transition ${pad} ${className}`} data-testid={testId} title="Opens WhatsApp with a pre-written nudge">
      <MessageCircle className="h-3.5 w-3.5" /> {label}
    </a>
  );
};

export const ClientPhone = ({ clientId, phone, firstName, coachName, onChange }) => {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(phone || '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { const r = await Coaches.coachSetClientPhone(clientId, val); onChange?.(r.customer_phone); setEditing(false); toast({ title: 'Number saved' }); }
    catch (e) { toast({ title: 'Not saved', description: String(e.response?.data?.detail || e.message), variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  return (
    <div className="flex items-center gap-2 flex-wrap" data-testid="client-phone">
      {editing ? (
        <>
          <input type="tel" value={val} onChange={e => setVal(e.target.value)} placeholder="07700 900123" className="border rounded-lg px-2.5 py-1.5 text-sm w-44" data-testid="client-phone-input" />
          <button onClick={save} disabled={busy} className="inline-flex items-center gap-1 text-xs font-bold text-white bg-[#0b1528] rounded-lg px-2.5 py-1.5" data-testid="client-phone-save"><Check className="h-3.5 w-3.5" /> Save</button>
          <button onClick={() => { setEditing(false); setVal(phone || ''); }} className="text-slate-500 hover:text-slate-800" data-testid="client-phone-cancel"><X className="h-4 w-4" /></button>
        </>
      ) : (
        <>
          {phone ? <a href={`tel:${phone}`} className="inline-flex items-center gap-1 text-sm text-slate-700 hover:underline" data-testid="client-phone-value"><Phone className="h-3.5 w-3.5" /> {phone}</a> : <span className="text-sm text-slate-400" data-testid="client-phone-empty">No mobile number yet</span>}
          <button onClick={() => setEditing(true)} className="text-slate-400 hover:text-slate-800" title="Edit number" data-testid="client-phone-edit"><Pencil className="h-3.5 w-3.5" /></button>
          <WhatsAppButton phone={phone} firstName={firstName} coachName={coachName} />
          <WhatsAppButton phone={phone} firstName={firstName} coachName={coachName} kind="checkin" label="Check-in nudge" className="!bg-emerald-700 hover:!bg-emerald-800" testId="whatsapp-checkin-btn" />
        </>
      )}
    </div>
  );
};

export default WhatsAppButton;
