import React from 'react';
import Layout from '../components/Layout';
import Breadcrumbs from '../components/Breadcrumbs';
import ProductCard from '../components/ProductCard';
import { useStore } from '../context/StoreContext';
import { Loader2 } from 'lucide-react';

const Bundles = () => {
  const { loading, getProductsByCategory } = useStore();
  const bundles = getProductsByCategory('bundles');
  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-10">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Bundles' }]} />
        <h1 className="text-3xl md:text-5xl font-black uppercase mt-6 mb-8 border-b pb-6">Bundles</h1>
        {loading ? (
          <div className="py-12 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-sky-500" /></div>
        ) : bundles.length === 0 ? (
          <p className="text-center text-slate-500 py-12">No bundles available.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {bundles.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Bundles;
