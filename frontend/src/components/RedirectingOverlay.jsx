import React from 'react';

/**
 * Full-screen branded overlay shown while we hand the customer off to the
 * bank redirect. Covers the brief 1-2s of white browser while Wallid loads.
 */
const RedirectingOverlay = ({ message = 'Redirecting to your bank securely…', subtitle = "Please don't close this window." }) => (
  <div
    className="fixed inset-0 z-[100] bg-slate-900/95 backdrop-blur-sm flex flex-col items-center justify-center gap-6 px-6 text-center"
    data-testid="redirecting-overlay"
  >
    <img
      src="https://customer-assets.emergentagent.com/job_ghp-ecommerce-pay/artifacts/0f0tlig3_ghp%20logo.jpg"
      alt="GHP Health"
      className="h-24 w-24 rounded-lg shadow-2xl ring-1 ring-white/10"
    />
    <div className="flex items-center gap-3 text-white">
      <span className="relative flex h-3 w-3">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
      </span>
      <p className="text-lg font-bold uppercase tracking-wider">{message}</p>
    </div>
    <p className="text-sm text-slate-300 max-w-sm">{subtitle}</p>
    <div className="flex gap-1.5 mt-2">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" style={{animationDelay: '0ms'}}></span>
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" style={{animationDelay: '150ms'}}></span>
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" style={{animationDelay: '300ms'}}></span>
    </div>
  </div>
);

export default RedirectingOverlay;
