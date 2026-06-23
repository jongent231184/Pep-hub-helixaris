import React, { createContext, useContext, useEffect, useState } from 'react';

const CartContext = createContext(null);

export const CartProvider = ({ children }) => {
  const [items, setItems] = useState(() => {
    try {
      const raw = localStorage.getItem('ghp_cart');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('ghp_cart', JSON.stringify(items));
  }, [items]);

  const addItem = (product, qty = 1, option = null) => {
    setItems(prev => {
      const key = product.id + (option || '');
      const existing = prev.find(i => i._key === key);
      if (existing) {
        return prev.map(i => i._key === key ? { ...i, qty: i.qty + qty } : i);
      }
      return [...prev, {
        _key: key,
        id: product.id,
        slug: product.slug,
        name: product.name,
        price: product.price,
        image: product.image,
        category: product.category,
        option,
        qty
      }];
    });
  };

  const updateQty = (key, qty) => {
    if (qty <= 0) return removeItem(key);
    setItems(prev => prev.map(i => i._key === key ? { ...i, qty } : i));
  };

  const removeItem = (key) => {
    setItems(prev => prev.filter(i => i._key !== key));
  };

  const clearCart = () => setItems([]);

  const totalItems = items.reduce((s, i) => s + i.qty, 0);
  const subtotal = items.reduce((s, i) => s + (i.price || 0) * i.qty, 0);

  return (
    <CartContext.Provider value={{ items, addItem, updateQty, removeItem, clearCart, totalItems, subtotal }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
};
