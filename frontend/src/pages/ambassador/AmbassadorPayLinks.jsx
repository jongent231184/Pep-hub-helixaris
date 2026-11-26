import React, { useEffect, useState } from 'react';
import { Ambassadors } from '../../lib/api';
import { Loader2, Plus, Copy, Check, Link as LinkIcon, CheckCircle2, Clock } from 'lucide-react';
import { Button } from '../../components/ui/button';
import CreatePaylinkModal from '../admin/CreatePaylinkModal';
import { WhatsAppShareButton } from '../../components/WhatsAppShare';

const StatusPill = ({ status }) => (
  status === 'paid'
    ? <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5"><CheckCircle2 className="h-3 w-3" /> Paid</span>
    : status === 'failed'
      ? <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5">Failed</span>
      : <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5"><Clock className="h-3 w-3" /> Awaiting payment</span>
);

const PayLinkRow = ({ o, discountPct }) => {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/pay/${o.id}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (_) { /* ignore */ }
  };
  const customer = [o.shipping_address?.first_name, o.shipping_address?.last_name].filter(Boolean).join(' ');
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col md:flex-row md:items-center gap-3" data-testid={`amb-paylink-${o.order_number}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono font-bold text-slate-900">{o.order_number}</span>
          <StatusPill status={o.payment_status} />
          <span className="text-xs text-slate-400">{new Date(o.created_at).toLocaleDateString('en-GB')}</span>
        </div>
        <p className="text-sm text-slate-600 mt-1 truncate">
          {(o.items || []).map(it => `${it.qty}× ${it.name}${it.option ? ` (${it.option})` : ''}`).join(', ')}
        </p>
        {customer && <p className="text-xs text-slate-500 mt-0.5">{customer}</p>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right">
          <p className="font-black text-slate-900">£{Number(o.total).toFixed(2)}</p>
          {Number(o.discount) > 0 && <p className="text-[11px] text-emerald-700">−£{Number(o.discount).toFixed(2)} code applied</p>}
        </div>
        {o.payment_status !== 'paid' && (
          <>
            <Button variant="outline" size="sm" onClick={copy} className="gap-1.5" data-testid={`amb-paylink-copy-${o.order_number}`}>
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy link'}
            </Button>
            <WhatsAppShareButton order={o} url={url} discountPct={discountPct} testId={`amb-paylink-whatsapp-${o.order_number}`} />
          </>
        )}
      </div>
    </div>
  );
};

export default function AmbassadorPayLinks() {
  const [me, setMe] = useState(null);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = () => Ambassadors.paylinks().then(setLinks).catch(() => setLinks([])).finally(() => setLoading(false));
  useEffect(() => { Ambassadors.me().then(r => setMe(r.user)).catch(() => null); load(); }, []);

  const pending = links.filter(l => l.payment_status !== 'paid').length;
  const paidTotal = links.filter(l => l.payment_status === 'paid').reduce((s, l) => s + Number(l.total || 0), 0);

  return (
    <div className="p-6 lg:p-10 max-w-5xl" data-testid="ambassador-paylinks-page">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-600 font-bold">Sell directly</p>
          <h1 className="text-2xl lg:text-3xl font-black text-slate-900 mt-1">Pay links</h1>
          <p className="text-sm text-slate-600 mt-2 max-w-xl">
            Build an order, share it straight to WhatsApp (or copy the link), and the customer pays by card. Your code
            {me?.ambassador_code && <span className="font-mono font-bold text-slate-900"> {me.ambassador_code}</span>} is applied automatically so every sale counts towards your commission.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shrink-0" data-testid="amb-create-paylink-btn">
          <Plus className="h-4 w-4" /> New pay link
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-8">
        {[['Links created', links.length], ['Awaiting payment', pending], ['Paid via links', `£${paidTotal.toFixed(2)}`]].map(([l, v]) => (
          <div key={l} className="bg-white border border-slate-200 rounded-lg p-4">
            <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{l}</p>
            <p className="text-xl font-black text-slate-900 mt-1">{v}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : links.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 rounded-lg p-10 text-center text-slate-500" data-testid="amb-paylinks-empty">
          <LinkIcon className="h-8 w-8 mx-auto text-slate-300 mb-3" />
          No pay links yet — create your first one above.
        </div>
      ) : (
        <div className="space-y-3">{links.map(o => <PayLinkRow key={o.id} o={o} discountPct={me?.customer_discount} />)}</div>
      )}

      <CreatePaylinkModal open={open} onClose={() => setOpen(false)} onCreated={() => load()} ambassador={me} />
    </div>
  );
}
