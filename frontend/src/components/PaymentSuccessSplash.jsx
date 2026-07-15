import React, { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

/**
 * Brief branded splash that flashes on the order-confirmation page after a
 * successful payment redirect. Auto-dismisses after ~2.5s. Only shows the
 * first time the customer lands on the confirmation page for a given order
 * (tracked in sessionStorage) so refreshes don't repeat the animation.
 */
const PaymentSuccessSplash = ({ orderNumber, onDismiss }) => {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), 2000);
    const doneTimer = setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, 2600);
    return () => { clearTimeout(fadeTimer); clearTimeout(doneTimer); };
  }, [onDismiss]);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] bg-slate-900/95 backdrop-blur-sm flex flex-col items-center justify-center gap-6 px-6 text-center transition-opacity duration-500 ${fading ? 'opacity-0' : 'opacity-100'}`}
      data-testid="payment-success-splash"
    >
      <div className="relative">
        <img
          src="https://customer-assets.emergentagent.com/job_ghp-ecommerce-pay/artifacts/0f0tlig3_ghp%20logo.jpg"
          alt="GHP Health"
          className="h-24 w-24 rounded-lg shadow-2xl ring-1 ring-white/10"
        />
        <span className="absolute -bottom-2 -right-2 bg-emerald-500 rounded-full p-1.5 shadow-lg ring-2 ring-slate-900 animate-in zoom-in-50 duration-500">
          <CheckCircle2 className="h-5 w-5 text-white" strokeWidth={2.5} />
        </span>
      </div>

      <div className="text-white space-y-2">
        <p className="text-2xl md:text-3xl font-black uppercase tracking-wider">Payment received</p>
        <p className="text-emerald-400 font-semibold uppercase text-sm tracking-widest">
          Thank you for your order
        </p>
      </div>

      {orderNumber && (
        <p className="text-xs text-slate-400 font-mono tracking-widest uppercase">
          {orderNumber}
        </p>
      )}
    </div>
  );
};

export default PaymentSuccessSplash;
