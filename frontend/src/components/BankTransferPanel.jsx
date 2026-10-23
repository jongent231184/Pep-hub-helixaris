import React, { useState } from 'react';
import { Landmark, Copy, Check, Download, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Orders } from '../lib/api';
import { useCart } from '../context/CartContext';
import { useToast } from '../hooks/use-toast';

const CopyRow = ({ label, value, testId }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(String(value)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-b-0 border-slate-200">
      <span className="text-xs uppercase tracking-wider text-slate-500">{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-mono font-bold text-slate-900" data-testid={testId}>{value}</span>
        <button type="button" onClick={copy} className="text-slate-400 hover:text-sky-600" aria-label={`Copy ${label}`} data-testid={`${testId}-copy`}>
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        </button>
      </span>
    </div>
  );
};

export const BankTransferDetails = ({ order, settings }) => {
  const [downloading, setDownloading] = useState(false);
  const download = async () => {
    setDownloading(true);
    try {
      const blob = await Orders.downloadMyInvoicePdf(order.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${order.order_number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };
  return (
    <div className="border-2 border-sky-500 rounded-lg p-5 bg-sky-50" data-testid="bank-transfer-details">
      <p className="font-bold uppercase text-sm tracking-wider text-sky-900 mb-1">Pay by bank transfer</p>
      <p className="text-sm text-slate-700 mb-4">
        Your order <span className="font-mono font-bold">{order.order_number}</span> is saved. Send the payment below from your banking app. We dispatch as soon as it arrives.
      </p>
      <div className="bg-white rounded-md border px-4">
        <CopyRow label="Account name" value={settings.bank_account_name} testId="bank-account-name" />
        <CopyRow label="Sort code" value={settings.bank_sort_code} testId="bank-sort-code" />
        <CopyRow label="Account number" value={settings.bank_account_number} testId="bank-account-number" />
        <CopyRow label="Reference" value={order.order_number} testId="bank-reference" />
        <CopyRow label="Amount" value={`£${Number(order.total || 0).toFixed(2)}`} testId="bank-amount" />
      </div>
      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 mt-3">
        Please use <strong>{order.order_number}</strong> as the payment reference so we can match your payment.
      </p>
      <Button onClick={download} disabled={downloading} variant="outline" className="w-full mt-4 gap-2" data-testid="bank-transfer-invoice-btn">
        {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Download invoice (PDF)
      </Button>
    </div>
  );
};

const BankTransferPanel = ({ order, settings, disabled, onChosen }) => {
  const { clearCart } = useCart();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  if (!settings?.bank_account_number || !order) return null;

  const choose = async () => {
    setLoading(true);
    try {
      const fresh = await Orders.chooseBankTransfer(order.id);
      clearCart();
      try { localStorage.removeItem('ghp_pending_wallid_order'); } catch (_) { /* ignore */ }
      onChosen(fresh);
    } catch (err) {
      toast({ title: 'Could not select bank transfer', description: err.response?.data?.detail || err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
        <div className="relative flex justify-center">
          <span className="bg-white px-3 text-[11px] uppercase tracking-widest text-slate-500 font-bold">or</span>
        </div>
      </div>
      <Button
        onClick={choose}
        disabled={disabled || loading}
        variant="outline"
        className="w-full h-14 border-2 border-slate-900 font-bold uppercase tracking-wider text-base disabled:opacity-50"
        data-testid="bank-transfer-btn"
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Landmark className="h-4 w-4 mr-2" />Pay by bank transfer</>}
      </Button>
      <p className="text-xs text-slate-500 mt-2 text-center">Manual transfer using your order number as the reference</p>
    </>
  );
};

export default BankTransferPanel;
