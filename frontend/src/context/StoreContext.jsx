import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Categories, Products, Settings as SettingsApi } from '../lib/api';

const StoreContext = createContext(null);

export const StoreProvider = ({ children }) => {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [cats, prods, set] = await Promise.all([
        Categories.list(),
        Products.list({ limit: 500 }),
        SettingsApi.get(),
      ]);
      setCategories(cats);
      setProducts(prods);
      setSettings(set);
    } catch (e) {
      console.error('Store load failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const getCategory = (slug) => categories.find(c => c.slug === slug);
  const getProduct = (slug) => products.find(p => p.slug === slug);
  const getProductsByCategory = (cat) => products.filter(p => p.category === cat);
  const getFeatured = () => products.filter(p => p.featured);

  return (
    <StoreContext.Provider value={{
      categories, products, settings, loading, refresh,
      getCategory, getProduct, getProductsByCategory, getFeatured
    }}>
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
};
