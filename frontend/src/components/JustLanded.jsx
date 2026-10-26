import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import ProductCard from './ProductCard';

const DAYS = 14;

export const getJustLanded = (products) => {
  const cutoff = Date.now() - DAYS * 24 * 60 * 60 * 1000;
  return products
    .filter(p => p.visible !== false && p.created_at && new Date(p.created_at).getTime() >= cutoff)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
};

const JustLanded = ({ products }) => {
  const scroller = useRef(null);
  const items = getJustLanded(products);
  if (items.length === 0) return null;

  const scroll = (dir) => scroller.current?.scrollBy({ left: dir * 520, behavior: 'smooth' });

  return (
    <section className="bg-slate-950 text-white" data-testid="just-landed-section">
      <div className="max-w-7xl mx-auto px-4 py-14">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-400 flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> New this fortnight
            </p>
            <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight mt-2">Just landed</h2>
            <p className="text-sm text-slate-400 mt-2">{items.length} new research compound{items.length === 1 ? '' : 's'} added in the last {DAYS} days.</p>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <button type="button" onClick={() => scroll(-1)} aria-label="Scroll left" data-testid="just-landed-prev"
              className="h-10 w-10 rounded-full border border-slate-700 grid place-items-center hover:bg-slate-800 transition-colors">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => scroll(1)} aria-label="Scroll right" data-testid="just-landed-next"
              className="h-10 w-10 rounded-full border border-slate-700 grid place-items-center hover:bg-slate-800 transition-colors">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div ref={scroller} className="flex gap-5 overflow-x-auto pb-3 snap-x snap-mandatory [scrollbar-width:thin]" data-testid="just-landed-row">
          {items.map(p => (
            <div key={p.id} className="min-w-[230px] sm:min-w-[260px] max-w-[260px] snap-start text-slate-900">
              <ProductCard product={p} />
            </div>
          ))}
        </div>
        <Link to="/vials" className="inline-block mt-4 text-sm font-bold uppercase tracking-wider text-amber-400 hover:text-amber-300" data-testid="just-landed-view-all">
          Browse all vials →
        </Link>
      </div>
    </section>
  );
};

export default JustLanded;
