import React, { useState } from 'react';
import { FlaskConical, Atom, Beaker, ScrollText, BookOpen, ChevronDown, ExternalLink } from 'lucide-react';

/**
 * Peptiology-style Research Profile block for the public product page.
 * Reads product.research_profile and renders the structured scientific content
 * that drives long-form SEO. Every field is optional — the block silently
 * hides sections that have no data.
 */

const Chip = ({ children, tone = 'sky' }) => (
  <span
    className={`inline-block text-[11px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full mr-1.5 mb-1.5 border ${
      tone === 'sky'
        ? 'bg-sky-50 border-sky-200 text-sky-700'
        : tone === 'gold'
          ? 'bg-amber-50 border-amber-200 text-amber-800'
          : tone === 'slate'
            ? 'bg-slate-50 border-slate-200 text-slate-700'
            : 'bg-emerald-50 border-emerald-200 text-emerald-800'
    }`}
  >
    {children}
  </span>
);

const SpecRow = ({ label, value }) => (
  <div className="flex items-baseline justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
    <span className="text-xs uppercase tracking-widest font-bold text-slate-500 shrink-0">{label}</span>
    <span className="text-sm text-slate-800 text-right font-mono break-all">{value}</span>
  </div>
);

const Section = ({ icon: Icon, title, subtitle, children }) => (
  <section className="mb-10">
    <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-200">
      <div className="h-9 w-9 rounded-full bg-sky-50 text-sky-600 grid place-items-center">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <h3 className="text-lg font-black uppercase tracking-tight text-slate-900">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 tracking-wide">{subtitle}</p>}
      </div>
    </div>
    {children}
  </section>
);

const Collapsible = ({ title, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-200 rounded-lg mb-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 text-left"
      >
        <span className="font-bold text-sm text-slate-900">{title}</span>
        <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-4 pb-4 pt-1 text-sm text-slate-700 leading-relaxed space-y-3">{children}</div>}
    </div>
  );
};

const pubmedUrl = (phrase) =>
  `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(phrase)}`;

const ResearchProfileBlock = ({ product }) => {
  const rp = product?.research_profile || {};
  const hasContent = Boolean(
    rp.overview || rp.mechanism || (rp.references && rp.references.length > 0) || rp.molecular_class
  );
  if (!hasContent) return null;

  const specs = [
    { label: 'Molecular class', value: rp.molecular_class },
    { label: 'Formula', value: rp.molecular_formula },
    { label: 'Molecular weight', value: rp.molecular_weight },
    { label: 'Receptor / target', value: rp.receptor_target },
    { label: 'Sequence', value: rp.sequence },
  ].filter((s) => s.value);

  const pubmedPhrase = rp.pubmed_query || `"${product.name}"`;

  return (
    <div className="mt-16 border-t-2 border-slate-200 pt-12" data-testid="product-research-profile">
      <div className="mb-8">
        <p className="text-[11px] uppercase tracking-[0.25em] text-sky-600 font-bold mb-2">Research Intelligence</p>
        <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight text-slate-900">
          {product.name} — Research Profile
        </h2>
        <p className="text-xs text-slate-500 mt-3 max-w-3xl">
          The scientific summary below reflects published research literature and is provided for educational,
          in-vitro research context only. It does not constitute dosing, therapeutic, or clinical guidance.
        </p>
      </div>

      {rp.overview && (
        <Section icon={FlaskConical} title="Overview" subtitle="What researchers study">
          <p className="text-slate-700 leading-relaxed">{rp.overview}</p>
        </Section>
      )}

      {specs.length > 0 && (
        <Section icon={Atom} title="Molecular Data" subtitle="Chemical & structural characteristics">
          <div className="bg-slate-50 rounded-lg p-5 border border-slate-200">
            {specs.map((s) => <SpecRow key={s.label} label={s.label} value={s.value} />)}
          </div>
        </Section>
      )}

      {(rp.areas_of_research?.length > 0 || rp.study_systems?.length > 0) && (
        <Section icon={Beaker} title="Research Landscape" subtitle="Where this peptide has been studied">
          {rp.areas_of_research?.length > 0 && (
            <div className="mb-5">
              <p className="text-xs uppercase tracking-widest font-bold text-slate-500 mb-2">Areas of research</p>
              <div>
                {rp.areas_of_research.map((a, i) => <Chip key={i} tone="sky">{a}</Chip>)}
              </div>
            </div>
          )}
          {rp.study_systems?.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-widest font-bold text-slate-500 mb-2">Study systems</p>
              <div>
                {rp.study_systems.map((s, i) => <Chip key={i} tone="slate">{s}</Chip>)}
              </div>
            </div>
          )}
        </Section>
      )}

      {(rp.key_finding || rp.mechanism || rp.signalling || rp.limitations || rp.open_questions) && (
        <Section icon={ScrollText} title="Research Deep Dive" subtitle="Mechanistic detail from the literature">
          {rp.key_finding && (
            <Collapsible title="Key finding" defaultOpen>
              <p>{rp.key_finding}</p>
            </Collapsible>
          )}
          {rp.mechanism && (
            <Collapsible title="Molecular mechanism">
              <p>{rp.mechanism}</p>
            </Collapsible>
          )}
          {rp.signalling && (
            <Collapsible title="Cellular signalling cascade">
              <p>{rp.signalling}</p>
            </Collapsible>
          )}
          {rp.limitations && (
            <Collapsible title="Important limitations">
              <p>{rp.limitations}</p>
            </Collapsible>
          )}
          {rp.open_questions && (
            <Collapsible title="Open research questions">
              <p>{rp.open_questions}</p>
            </Collapsible>
          )}
          {rp.storage_handling && (
            <Collapsible title="Storage & handling">
              <p>{rp.storage_handling}</p>
            </Collapsible>
          )}
        </Section>
      )}

      {(rp.references?.length > 0 || rp.pubmed_query) && (
        <Section icon={BookOpen} title="Published Literature" subtitle="Explore the primary research">
          <div className="flex flex-wrap gap-3 mb-6">
            <a
              href={pubmedUrl(pubmedPhrase)}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest font-bold text-sky-600 hover:text-sky-700 border border-sky-200 hover:border-sky-400 rounded px-3 py-2 bg-sky-50 hover:bg-sky-100 transition-colors"
              data-testid="rp-pubmed-all"
            >
              PubMed — all studies <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href={pubmedUrl(`${pubmedPhrase} mechanism receptor`)}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest font-bold text-sky-600 hover:text-sky-700 border border-sky-200 hover:border-sky-400 rounded px-3 py-2 bg-sky-50 hover:bg-sky-100 transition-colors"
            >
              PubMed — mechanism <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href={`https://clinicaltrials.gov/search?term=${encodeURIComponent(product.name)}`}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest font-bold text-slate-700 hover:text-slate-900 border border-slate-200 hover:border-slate-400 rounded px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              ClinicalTrials.gov <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {rp.references?.length > 0 && (
            <ol className="space-y-2 list-decimal pl-5 text-sm text-slate-700">
              {rp.references.map((r, i) => (
                <li key={i} className="leading-relaxed">
                  {r.url ? (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="text-sky-600 hover:text-sky-700 hover:underline"
                    >
                      {r.citation} <ExternalLink className="h-3 w-3 inline" />
                    </a>
                  ) : (
                    <span>
                      {r.citation}{' '}
                      <a
                        href={pubmedUrl(r.citation)}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="text-sky-600 hover:underline text-xs uppercase tracking-widest font-bold ml-1"
                      >
                        Find on PubMed
                      </a>
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Section>
      )}

      <div className="mt-6 bg-amber-50 border-l-4 border-amber-500 rounded-r px-4 py-3 text-xs text-amber-900">
        <strong className="uppercase tracking-widest">Research-use information only.</strong>{' '}
        Mechanistic summaries describe published experimental findings and do not constitute dosing,
        diagnostic, or clinical-use guidance. See our{' '}
        <a href="/research-use-policy" className="underline font-bold">Research-Use Policy</a>.
      </div>
    </div>
  );
};

export default ResearchProfileBlock;
