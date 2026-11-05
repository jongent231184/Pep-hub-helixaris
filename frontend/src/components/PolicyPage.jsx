import React from 'react';
import Layout from './Layout';
import SEO from './SEO';
import Breadcrumbs from './Breadcrumbs';
import { useStore } from '../context/StoreContext';
import { BRAND } from '../config/brand';

export const PolicySection = ({ number, title, children }) => (
  <section className="mb-8">
    <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-2">{number}. {title}</p>
    <div className="space-y-3 text-slate-700 leading-relaxed">{children}</div>
  </section>
);

export const usePolicyBrand = () => {
  const { settings = {} } = useStore();
  const s = settings || {};
  return {
    brandName: s.site_name || BRAND.legalName || BRAND.name,
    supportEmail: s.contact_email || BRAND.support_email,
    domain: BRAND.domain,
  };
};

export const PolicyPage = ({ title, description, lastUpdated, testId, children }) => {
  const { brandName } = usePolicyBrand();
  return (
    <Layout>
      <SEO title={title} description={description} />
      <div className="max-w-3xl mx-auto px-4 py-10" data-testid={testId}>
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: title }]} />
        <h1 className="text-3xl md:text-4xl font-black uppercase mt-6 mb-2">{title}</h1>
        <p className="text-xs text-slate-500 mb-8">Last updated: {lastUpdated}</p>
        <div className="prose max-w-none">{children}</div>
        <p className="text-xs text-slate-500 pt-6 border-t border-slate-200">
          © {new Date().getFullYear()} {brandName}. All rights reserved.
        </p>
      </div>
    </Layout>
  );
};
