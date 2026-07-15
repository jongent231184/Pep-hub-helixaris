import React, { useEffect, useRef, useState } from 'react';
import { X, ExternalLink, Loader2 } from 'lucide-react';
import { Wallid } from '../lib/api';

/**
 * Wallid Pay-by-Bank iframe modal.
 * - Renders pay.wallid.co inside a full-screen modal so the customer never
 *   leaves the GHP-Health-branded shell.
 * - Polls /api/wallid/verify-status every 3s while open. On SUCCESS the modal
 *   closes and the parent onPaid() callback fires (usually navigate to
 *   /order-confirmation/{order_number}).
 * - "Open in new tab" fallback link for customers whose bank auth breaks the
 *   iframe (some banks refuse to render inside a frame).
 */
const WallidPaymentModal = ({ orderId, orderNumber, paymentLink, onClose, onPaid, onFailed }) => {
  const iframeRef = useRef(null);
  const [polling, setPolling] = useState(true);
  const [status, setStatus] = useState('PENDING');

  // Lock background scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Poll status every 3s until final
  useEffect(() => {
    if (!polling) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await Wallid.verifyStatus(orderId);
        if (cancelled) return;
        setStatus(res.wallid_status || 'PENDING');
        if (res.payment_status === 'paid') {
          setPolling(false);
          onPaid?.(res);
          return;
        }
        if (['FAILED', 'EXPIRED'].includes((res.wallid_status || '').toUpperCase())) {
          setPolling(false);
          onFailed?.(res);
        }
      } catch (_) {
        // silent — network blips shouldn't kill the modal
      }
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, [orderId, polling, onPaid, onFailed]);

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4"
      data-testid="wallid-modal-overlay"
    >
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-5 py-3 border-b bg-slate-50">
          <div>
            <p className="font-bold uppercase text-sm tracking-wider">Complete your payment</p>
            <p className="text-xs text-slate-500">
              Order <span className="font-mono">{orderNumber}</span> · Pay by Bank
              {status && status !== 'PENDING' && (
                <> · <span className="uppercase font-semibold">{status}</span></>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-200 transition-colors"
            aria-label="Close payment modal"
            data-testid="wallid-modal-close"
          >
            <X className="h-5 w-5 text-slate-700" />
          </button>
        </header>

        {/* iframe */}
        <div className="flex-1 relative bg-slate-100">
          <iframe
            ref={iframeRef}
            src={paymentLink}
            title="Wallid Pay by Bank"
            className="absolute inset-0 w-full h-full border-0"
            allow="payment *; clipboard-write"
            data-testid="wallid-payment-iframe"
          />
        </div>

        {/* Footer */}
        <footer className="px-5 py-3 border-t bg-slate-50 flex items-center justify-between text-xs text-slate-600 gap-3">
          <span className="flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin text-emerald-600" />
            Waiting for payment confirmation…
          </span>
          <a
            href={paymentLink}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-sky-600 hover:text-sky-700 font-medium"
            data-testid="wallid-open-new-tab"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open in new tab
          </a>
        </footer>
      </div>
    </div>
  );
};

export default WallidPaymentModal;
