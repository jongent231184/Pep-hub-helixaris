import React from 'react';
import Layout from '../components/Layout';
import Breadcrumbs from '../components/Breadcrumbs';

const Wholesale = () => (
  <Layout>
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Wholesale' }]} />
      <h1 className="text-4xl md:text-5xl font-black uppercase mt-6 mb-6">Wholesale</h1>
      <p className="text-slate-700 leading-relaxed">Wholesale enquiries welcome. For bulk pricing and bespoke arrangements, please email our team directly.</p>
      <a href="mailto:GHP-Health@outlook.com" className="inline-block mt-6 bg-sky-500 hover:bg-sky-600 text-white px-7 py-3 rounded font-bold uppercase tracking-wider text-sm">Email Our Team</a>
    </div>
  </Layout>
);

export default Wholesale;
