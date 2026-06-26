import React from 'react';
import Layout from '../components/Layout';
import Breadcrumbs from '../components/Breadcrumbs';

const Terms = () => (
  <Layout>
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Terms & Conditions' }]} />
      <h1 className="text-3xl md:text-4xl font-black uppercase mt-6 mb-6">Terms &amp; Conditions</h1>
      <div className="prose max-w-none text-slate-700 space-y-4">
        <p>All products supplied by GHP-Research are intended for laboratory research use only. Not for human consumption.</p>
        <p>By placing an order through this website you confirm that you are aged 18 or over and that you accept the disclaimer in full. All sales are final.</p>
        <p>Buyers are responsible for compliance with all applicable laws in their jurisdiction. GHP-Research accepts no liability for misuse of the products.</p>
      </div>
    </div>
  </Layout>
);

export default Terms;
