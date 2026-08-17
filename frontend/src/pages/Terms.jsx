import React from 'react';
import Layout from '../components/Layout';
import Breadcrumbs from '../components/Breadcrumbs';

const Terms = () => (
  <Layout>
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Terms & Conditions' }]} />
      <h1 className="text-3xl md:text-4xl font-black uppercase mt-6 mb-6">Terms &amp; Conditions</h1>
      <div className="prose max-w-none text-slate-700 space-y-6">
        <section>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-1">1. Products &amp; Compliance</p>
          <p>All products supplied by GHP-Health are intended for <strong>laboratory research use only</strong>. Not for human consumption or veterinary use.</p>
          <p>By placing an order through this website you confirm that you are <strong>aged 18 or over</strong>, that you are ordering for legitimate research purposes, and that you accept the disclaimer in the age-gate modal in full. All sales are final.</p>
          <p>Buyers are responsible for compliance with all applicable laws in their jurisdiction. GHP-Health accepts no liability for misuse of the products.</p>
        </section>

        <section>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-1">2. Coaching Service</p>
          <p>The coaching service on this website is <strong>peer-to-peer educational content</strong>. It is not medical advice. Coaches do not prescribe, diagnose or treat any condition. Users must consult a qualified medical professional before starting or changing any regimen.</p>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-1">3. Copyright &amp; Intellectual Property</p>
          <p>All content on this website — including but not limited to the <strong>GHP-Health</strong> name and logo, page layouts, imagery, product photography, product descriptions, illustrations, source code, protocol templates, coaching materials, calculators, tools and any accompanying documents — is the <strong>copyright of GHP-Health Ltd</strong> and is protected by UK and international copyright and trademark law.</p>
          <p>No part of this website may be reproduced, distributed, republished, mirrored, or transmitted in any form or by any means without prior written permission from GHP-Health Ltd.</p>
        </section>

        <section>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-1">4. Prohibited Use — Scraping, Cloning &amp; AI Training</p>
          <p>You may not, without our express written consent:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Use any automated system, robot, spider, crawler, scraper, offline reader, headless browser or similar tool to access, index, mirror or extract content from this website.</li>
            <li>Bypass, remove or interfere with any technical measure used to restrict access to any portion of the website.</li>
            <li>Copy, clone or reproduce the visual design, layout, page structure, wording or user flow of this website for use in any competing product, storefront or service.</li>
            <li>Use the content of this website — including product descriptions, imagery, coaching materials, calculators or code — as <strong>training data, fine-tuning data, evaluation data or grounding data for any artificial intelligence, machine-learning, large language, image-generation or similar model</strong>.</li>
            <li>Resell, sublicense or make available any part of this website&apos;s content to third parties.</li>
          </ul>
          <p>The presence of this website on the public internet does not constitute a licence for any of the above. Machine-readable opt-out signals (including <code>robots.txt</code>, HTML <code>&lt;meta name=&quot;robots&quot; content=&quot;noai, noimageai&quot;&gt;</code> and <code>ai-preferences</code> directives) are provided on every page and must be honoured.</p>
          <p>Breach of this section is a <strong>material breach of these Terms</strong> and of our intellectual property rights. We reserve the right to pursue civil remedies (including damages and injunctive relief) and to issue DMCA / hosting-provider takedown notices without prior warning.</p>
        </section>

        <section>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-1">5. Limitation of Liability</p>
          <p>The website and its content are provided on an &quot;as-is&quot; basis. To the fullest extent permitted by law, GHP-Health Ltd disclaims all warranties and shall not be liable for any direct, indirect, incidental, consequential or special damages arising out of or in connection with use of this website.</p>
        </section>

        <section>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-1">6. Governing Law</p>
          <p>These Terms are governed by the laws of England &amp; Wales. Any dispute arising in connection with these Terms is subject to the exclusive jurisdiction of the English courts.</p>
        </section>

        <p className="text-xs text-slate-500 pt-6 border-t border-slate-200">
          © {new Date().getFullYear()} GHP-Health Ltd. All rights reserved. Last updated: {new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}.
        </p>
      </div>
    </div>
  </Layout>
);

export default Terms;
