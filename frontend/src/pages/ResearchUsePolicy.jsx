import React from 'react';
import Layout from '../components/Layout';
import SEO from '../components/SEO';
import Breadcrumbs from '../components/Breadcrumbs';
import { useStore } from '../context/StoreContext';
import { BRAND } from '../config/brand';

const Section = ({ number, title, children }) => (
  <section className="mb-8">
    <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-2">{number}. {title}</p>
    <div className="space-y-3 text-slate-700 leading-relaxed">{children}</div>
  </section>
);

const ResearchUsePolicy = () => {
  const { settings = {} } = useStore();
  const s = settings || {};
  const brandName = s.site_name || BRAND.legalName || BRAND.name;
  const lastUpdated = 'February 2026';

  return (
    <Layout>
      <SEO
        title="Research-Use Policy"
        description="GHP Health's Research-Use Policy. All products supplied strictly for in-vitro laboratory research and educational use only. Not for human consumption."
      />
      <div className="max-w-3xl mx-auto px-4 py-10" data-testid="research-use-policy-page">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Research-Use Policy' }]} />
        <h1 className="text-3xl md:text-4xl font-black uppercase mt-6 mb-2">Research-Use Policy</h1>
        <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-8">Last updated: {lastUpdated}</p>

        <div className="bg-amber-50 border-l-4 border-amber-400 rounded-r-md px-4 py-3 mb-8 text-sm text-amber-900">
          <p className="font-bold uppercase tracking-wider text-xs mb-1">Important</p>
          <p>
            All products supplied by {brandName} are strictly for <strong>in-vitro laboratory research and educational use only</strong>. They are <strong>not</strong> intended, marketed, sold, or approved for human consumption, therapeutic use, in-vitro diagnostic use, veterinary use, animal consumption, ingestion, injection, inhalation, or topical application.
          </p>
        </div>

        <Section number="1" title="Scope">
          <p>
            This Research-Use Policy applies to every product, tool, calculator, article, and coaching service made available through this website. By accessing the site, placing an order, or using any of the tools or services provided, you agree to be bound by this policy in addition to our Terms &amp; Conditions.
          </p>
        </Section>

        <Section number="2" title="Product Classification">
          <p>
            All peptide products, laboratory consumables, and reagents are supplied as <strong>research-grade laboratory chemicals</strong>. They are not classified as, and are not sold as:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Medicinal or pharmaceutical products;</li>
            <li>Food supplements or nutraceuticals;</li>
            <li>Cosmetic products;</li>
            <li>Medical devices;</li>
            <li>In-vitro diagnostic devices;</li>
            <li>Veterinary products.</li>
          </ul>
          <p>
            {brandName} does not hold, and does not require, a Marketing Authorisation or Wholesale Dealer&apos;s Licence under the UK Human Medicines Regulations 2012, because none of the products supplied are marketed, sold, or held out as medicinal products for human use.
          </p>
        </Section>

        <Section number="3" title="Intended Use">
          <p>
            Products are supplied strictly for use in a controlled laboratory or educational setting by qualified researchers, students, or institutions engaged in bona-fide in-vitro research. Permitted use is limited to:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>In-vitro biochemical, cellular, or molecular research;</li>
            <li>Analytical reference and method development;</li>
            <li>Educational demonstration and teaching in a laboratory setting;</li>
            <li>Non-clinical academic study.</li>
          </ul>
        </Section>

        <Section number="4" title="Prohibited Use">
          <p>The following uses are expressly and permanently prohibited:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Any use in, on, or with the human body — including but not limited to ingestion, injection, inhalation, topical application, or absorption;</li>
            <li>Administration to any animal or veterinary subject;</li>
            <li>Use in the diagnosis, treatment, cure, mitigation, or prevention of any disease or condition;</li>
            <li>Compounding, dispensing, or resale of the product to any party for consumer end-use;</li>
            <li>Any use that is unlawful in the buyer&apos;s jurisdiction of receipt.</li>
          </ul>
        </Section>

        <Section number="5" title="Buyer Warranties">
          <p>By placing an order, the buyer warrants and represents that:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>They are aged 18 years or over;</li>
            <li>They are purchasing the product exclusively for the research and educational purposes set out in section 3;</li>
            <li>They have the necessary qualifications, facilities, and safety controls to handle and store research-grade laboratory chemicals responsibly;</li>
            <li>They will not resell, transfer, or otherwise supply the product to any third party in a manner inconsistent with this policy;</li>
            <li>They accept sole responsibility for compliance with all laws and regulations applicable in the jurisdiction of receipt and use.</li>
          </ul>
        </Section>

        <Section number="6" title="Compliance Controls">
          <p>
            To keep our supply of research-grade materials aligned with this policy, {brandName} operates the following controls:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Age gate</strong> — every visitor to this website must confirm they are aged 18 or over before viewing any product or tool. The site cannot be accessed without confirmation.</li>
            <li><strong>Research-use disclaimer</strong> — the research-use-only disclaimer appears on the site-wide footer, on every product page, in the order confirmation email, and on the PDF invoice.</li>
            <li><strong>Checkout compliance tickbox</strong> — before any payment button is enabled, the buyer must actively tick a compliance box confirming the purchase is for research or educational use only. This is enforced both in the browser and by the server.</li>
            <li><strong>Certificate of Analysis (COA)</strong> — every product batch is supported by an independent third-party laboratory certificate, published publicly at <a href="/coa" className="text-sky-600 hover:underline">/coa</a>.</li>
            <li><strong>Marketing review</strong> — product titles, imagery, and descriptions are reviewed against this policy. Consumer-oriented language, therapeutic claims, and end-use suggestions are not permitted anywhere on the site or in any marketing collateral.</li>
            <li><strong>Ambassador &amp; Coach contracts</strong> — every ambassador and every coach is contractually prohibited from promoting, describing, or advising on the personal use of any product supplied by {brandName}.</li>
            <li><strong>Customer service scripts</strong> — support staff are trained to decline any question relating to dosage, administration, therapeutic use, or personal application, and to redirect such enquiries to a licensed medical practitioner.</li>
          </ul>
        </Section>

        <Section number="7" title="Peptide Tools & Calculators">
          <p>
            The calculators and reference tools published on this website (including the peptide reconstitution calculator) are provided as <strong>educational unit-conversion utilities</strong> for laboratory researchers. They perform standard reconstitution and dilution mathematics only. They do <strong>not</strong> recommend therapeutic amounts, do not reference human bodyweight, and do not provide medical guidance of any kind.
          </p>
        </Section>

        <Section number="8" title="Coaching Services">
          <p>
            The Coaching services offered by {brandName} are limited to general wellness, fitness, nutrition, and lifestyle support. Coaches are contractually and operationally prohibited from providing medical advice, prescribing, or advising on the personal use of any peptide product. The Coaching service is a distinct service line and is not cross-sold or bundled with our research reagent catalogue.
          </p>
        </Section>

        <Section number="9" title="Regulatory Framework">
          <p>
            {brandName}&apos;s activity is governed by the ordinary consumer, commercial, and data-protection frameworks that apply to any UK-registered online retailer, including:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Companies Act 2006 and Companies House registration;</li>
            <li>Consumer Rights Act 2015;</li>
            <li>UK GDPR and the Data Protection Act 2018;</li>
            <li>Advertising Standards Authority (ASA) CAP Code;</li>
            <li>HMRC / VAT rules as applicable.</li>
          </ul>
          <p>
            Research chemicals supplied for in-vitro laboratory use sit outside the scope of medicines-licensing regimes (MHRA, EMA, FDA) because they are not marketed, sold, or held out as medicinal products for human use.
          </p>
        </Section>

        <Section number="10" title="Enforcement">
          <p>
            {brandName} reserves the right to refuse or cancel any order, close any account, and share information with law-enforcement or regulatory authorities where there is reasonable evidence that a buyer intends to use a product outside the terms of this policy. Any breach of this policy is also a material breach of our Terms &amp; Conditions.
          </p>
        </Section>

        <Section number="11" title="Contact">
          <p>
            Questions about this Research-Use Policy should be sent to{' '}
            <a href={`mailto:${s.contact_email || 'GHP-Health@outlook.com'}`} className="text-sky-600 hover:underline">
              {s.contact_email || 'GHP-Health@outlook.com'}
            </a>.
          </p>
        </Section>

        <p className="text-xs text-slate-500 border-t border-slate-200 pt-6 mt-10">
          This Research-Use Policy is provided for transparency and forms part of our contractual terms with every buyer. It may be updated from time to time; the &quot;Last updated&quot; date at the top of this page reflects the current version in force.
        </p>
      </div>
    </Layout>
  );
};

export default ResearchUsePolicy;
