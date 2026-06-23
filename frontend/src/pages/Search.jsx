import React from 'react';
import { useLocation } from 'react-router-dom';
import Layout from '../components/Layout';
import Breadcrumbs from '../components/Breadcrumbs';
import ProductCard from '../components/ProductCard';
import { PRODUCTS } from '../data/mock';

const Search = () => {
  const q = new URLSearchParams(useLocation().search).get('q') || '';
  const results = PRODUCTS.filter(p => p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-10">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Search' }]} />
        <h1 className="text-3xl md:text-4xl font-black uppercase mt-6 mb-2">Search Results</h1>
        <p className="text-slate-600 mb-8">{results.length} result{results.length !== 1 ? 's' : ''} for “{q}”</p>
        {results.length === 0 ? (
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
