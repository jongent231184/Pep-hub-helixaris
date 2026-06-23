import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import ProductCard from '../components/ProductCard';
import Breadcrumbs from '../components/Breadcrumbs';
import { CATEGORIES, getProductsByCategory } from '../data/mock';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

const SORT_OPTIONS = [
  { value: 'name-asc', label: 'Sort by Name: A to Z' },
  { value: 'name-desc', label: 'Sort by Name: Z to A' },
  { value: 'price-desc', label: 'Sort by Price: High to Low' },
  { value: 'price-asc', label: 'Sort by Price: Low to High' },
  { value: 'popular', label: 'Sort by Popularity' },
  { value: 'latest', label: 'Sort by Latest Added' }
];

const CategoryPage = () => {
  const { categorySlug } = useParams();
  const [sort, setSort] = useState('name-asc');
  const cat = CATEGORIES.find(c => c.slug === categorySlug);
  const products = getProductsByCategory(categorySlug);

  const sorted = [...products].sort((a, b) => {
    if (sort === 'name-asc') return a.name.localeCompare(b.name);
    if (sort === 'name-desc') return b.name.localeCompare(a.name);
    if (sort === 'price-asc') return (a.price || 0) - (b.price || 0);
    if (sort === 'price-desc') return (b.price || 0) - (a.price || 0);
    return 0;
  });

  if (!cat) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-4 py-20 text-center">
          <h1 className="text-3xl font-bold">Category not found</h1>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-10">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: cat.name }]} />
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mt-6 mb-8 border-b pb-6">
          <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight">{cat.name}</h1>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-full sm:w-72">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {sorted.length === 0 ? (
          <p className="text-center text-slate-500 py-20">No products in this category yet.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {sorted.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default CategoryPage;
