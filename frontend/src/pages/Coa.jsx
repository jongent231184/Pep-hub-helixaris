import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import Breadcrumbs from '../components/Breadcrumbs';
import { Coas, resolveImage } from '../lib/api';
import { Loader2, FileText, Image as ImageIcon, Download, ExternalLink, Search, ShieldCheck } from 'lucide-react';
import { Input } from '../components/ui/input';

const formatDate = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (_) {
    return iso;
  }
};

const CoaCard = ({ c }) => {
  const url = resolveImage(c.file_url);
  const isPdf = c.file_type === 'pdf';
  return (
    <article
      className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:shadow-lg hover:border-sky-200 transition-all group"
      data-testid={`coa-card-${c.id}`}
    >
      {/* Preview */}
      <div className="aspect-[4/3] bg-slate-50 grid place-items-center border-b border-slate-100 relative overflow-hidden">
        {isPdf ? (
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <FileText className="h-16 w-16 text-red-500 group-hover:scale-105 transition-transform" strokeWidth={1.2} />
            <span className="text-[10px] font-mono uppercase tracking-widest">PDF Report</span>
          </div>
        ) : (
          <img src={url} alt={c.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
        )}
        {c.batch_number && (
          <span className="absolute top-3 left-3 px-2 py-1 bg-slate-900/90 text-white text-[10px] font-mono uppercase tracking-widest rounded">
            Batch {c.batch_number}
          </span>
        )}
      </div>

      {/* Meta */}
      <div className="p-5">
        <h3 className="font-black text-slate-900 leading-tight mb-1 line-clamp-2">{c.title}</h3>
        {c.product_name && (
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-3">{c.product_name}</p>
        )}
        <dl className="space-y-1 text-xs text-slate-600">
          {c.test_date && (
            <div className="flex justify-between">
              <dt className="uppercase tracking-widest text-slate-400">Tested</dt>
              <dd className="font-semibold">{formatDate(c.test_date)}</dd>
            </div>
          )}
        </dl>
        {c.notes && (
          <p className="text-xs text-slate-500 mt-3 line-clamp-3 leading-relaxed border-t border-slate-100 pt-3">{c.notes}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-4">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded font-bold uppercase text-xs tracking-wider transition-colors"
            data-testid={`coa-view-${c.id}`}
          >
            <ExternalLink className="h-3.5 w-3.5" /> View
          </a>
          <a
            href={url}
            download
            className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-900 rounded font-bold uppercase text-xs tracking-wider transition-colors"
            title="Download"
          >
            <Download className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </article>
  );
};

const Coa = () => {
  const [coas, setCoas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    Coas.list().then(setCoas).catch(() => setCoas([])).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return coas;
    const q = query.toLowerCase();
    return coas.filter(c =>
      (c.title || '').toLowerCase().includes(q) ||
      (c.product_name || '').toLowerCase().includes(q) ||
      (c.batch_number || '').toLowerCase().includes(q)
    );
  }, [coas, query]);

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-10">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Certificates of Analysis' }]} />

        {/* Hero */}
        <div className="mt-6 mb-8 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-[11px] uppercase tracking-widest text-emerald-800 font-bold mb-4">
            <ShieldCheck className="h-3.5 w-3.5" /> Third-party verified
          </div>
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight text-slate-900">
            Certificates of Analysis
          </h1>
          <p className="text-slate-600 mt-4 text-base leading-relaxed">
            Every batch we stock is independently tested. Browse and download the lab reports from our suppliers below — full transparency, no hidden pages.
          </p>
        </div>

        {/* Search */}
        {!loading && coas.length > 0 && (
          <div className="relative mb-8 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by product, batch or title…"
              className="pl-9"
              data-testid="coa-search"
            />
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="grid place-items-center py-20"><Loader2 className="h-10 w-10 animate-spin text-sky-500" /></div>
        ) : coas.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-slate-300 mb-4" strokeWidth={1.2} />
            <p className="text-slate-600 font-semibold">Lab reports coming soon.</p>
            <p className="text-sm text-slate-500 mt-2">Check back shortly — we&apos;re working with our supplier to publish current batch COAs.</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-slate-500 text-center py-16">No COAs match your search.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" data-testid="coa-grid">
            {filtered.map(c => <CoaCard key={c.id} c={c} />)}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Coa;
