import React from 'react';
import Layout from '../components/Layout';
import Breadcrumbs from '../components/Breadcrumbs';
import ProductCard from '../components/ProductCard';
import { PRODUCTS } from '../data/mock';

const Bundles = () => {
  const bundles = PRODUCTS.filter(p => p.category === 'bundles');
  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-10">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Bundles' }]} />
        <h1 className="text-3xl md:text-5xl font-black uppercase mt-6 mb-8 border-b pb-6">Bundles</h1>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {bundles.map(p => <ProductCard key={p.id} product={p} />)}
        </div>
      </div>
    </Layout>
  );
};

export default Bundles;
