import React from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import Layout from '../components/Layout';
import Breadcrumbs from '../components/Breadcrumbs';
import ProductCard from '../components/ProductCard';
import { useStore } from '../context/StoreContext';

const Search = () => {
  const q = (new URLSearchParams(useLocation().search).get('q') || '').toLowerCase();
  const { products, loading } = useStore();
  const results = q ? products.filter(p => p.name.toLowerCase().includes(q)) : [];

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-10">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Search' }]} />
        <h1 className="text-3xl md:text-4xl font-black uppercase mt-6 mb-2">Search Results</h1>
        <p className="text-slate-600 mb-8">{results.length} result{results.length !== 1 ? 's' : ''} for “{q}”</p>
        {loading ? (
          <div className="py-12 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-sky-500" /></div>
        ) : results.length === 0 ? (
          <p className="text-center py-20 text-slate-500">No products found. Try a different search term.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {results.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Search;
