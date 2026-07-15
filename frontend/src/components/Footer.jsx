import React from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Landmark, Lock } from 'lucide-react';
import { useStore } from '../context/StoreContext';

const TikTokIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.62a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.83 4.83 0 0 1-1.84-.05Z"/></svg>
);

const Footer = () => {
  const { settings, categories } = useStore();
  const s = settings || {};
  const shopCats = categories.filter(c => c.visible !== false);

  return (
    <footer className="bg-slate-900 text-slate-200 mt-16">
      <div className="max-w-7xl mx-auto px-4 py-12 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div>
          <h4 className="text-white font-bold uppercase tracking-wider mb-4">Get In Touch</h4>
          <p className="text-sm font-semibold">Reach us directly:</p>
          {s.contact_email && (
            <a href={`mailto:${s.contact_email}`} className="text-sky-400 hover:text-sky-300 text-sm break-all">{s.contact_email}</a>
          )}
          {s.customer_hours && (
            <>
              <p className="text-sm font-semibold mt-4">Customer service hours</p>
              <p className="text-sm text-slate-400">{s.customer_hours}</p>
            </>
          )}
        </div>
        <div>
          <h4 className="text-white font-bold uppercase tracking-wider mb-4">Shop</h4>
          <ul className="space-y-2 text-sm">
            {shopCats.map(c => (
              <li key={c.slug}><Link to={`/${c.slug}`} className="hover:text-sky-400">{c.name}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-white font-bold uppercase tracking-wider mb-4">Follow Us</h4>
          <div className="flex gap-3">
            {s.tiktok && (
              <a href={s.tiktok} target="_blank" rel="noreferrer" className="h-10 w-10 grid place-items-center bg-slate-800 hover:bg-sky-500 rounded-full transition-colors">
                <TikTokIcon className="h-5 w-5" />
              </a>
            )}
            {s.instagram && (
              <a href={s.instagram} target="_blank" rel="noreferrer" className="h-10 w-10 grid place-items-center bg-slate-800 hover:bg-sky-500 rounded-full transition-colors">
                <Instagram className="h-5 w-5" />
              </a>
            )}
          </div>
        </div>
        <div>
          <h4 className="text-white font-bold uppercase tracking-wider mb-4">Payments</h4>
          <div className="flex items-center gap-3 bg-slate-800 rounded-lg px-4 py-3" data-testid="footer-payment-methods">
            <Landmark className="h-6 w-6 text-emerald-400 shrink-0" />
            <div>
              <p className="text-white text-sm font-bold uppercase tracking-wider leading-tight">Pay by Bank</p>
              <p className="text-[11px] text-slate-400 leading-tight mt-0.5">Instant · Secure · No card fees</p>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mt-3 flex items-center gap-1.5">
            <Lock className="h-3 w-3" /> Bank-grade encryption
          </p>
        </div>
      </div>
      <div className="border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-5 text-xs text-slate-400 flex flex-col sm:flex-row justify-between gap-2">
          <p>Copyright © {new Date().getFullYear()} {s.site_name || 'GHP-Health'} Ltd. | <Link to="/terms" className="hover:text-sky-400">Terms &amp; Conditions</Link></p>
          <p>Premium-grade research peptides</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
