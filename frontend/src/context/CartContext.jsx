import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { Coaches } from '../lib/api';
import { toast } from 'sonner';

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

  const addItem = useCallback((product, qty = 1, option = null) => {
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
  }, []);

  const updateQty = (key, qty) => {
    if (qty <= 0) return removeItem(key);
    setItems(prev => prev.map(i => i._key === key ? { ...i, qty } : i));
  };

  const removeItem = (key) => {
    setItems(prev => prev.filter(i => i._key !== key));
  };

  const clearCart = () => setItems([]);

  // Poll for prescribed-cart pushes from the client's coach; auto-merge into local cart.
  // Guards against duplicates: in-flight ref + per-push id de-dupe set + consume-before-add ordering.
  const syncInFlight = useRef(false);
  const consumedIds = useRef(new Set());
  useEffect(() => {
    const syncPrescribed = async () => {
      if (syncInFlight.current) return;
      if (!localStorage.getItem('ghp_token')) return;
      syncInFlight.current = true;
      try {
        const pushes = await Coaches.myPrescribedCart();
        const fresh = (pushes || []).filter(p => !consumedIds.current.has(p.id));
        if (fresh.length === 0) return;
        // Mark ids as claimed BEFORE any await so a second effect run won't re-process them.
        fresh.forEach(p => consumedIds.current.add(p.id));
        // Consume first so a race can't double-fetch, then add locally.
        await Coaches.consumePrescribedCart(fresh.map(p => p.id));
        fresh.forEach(p => {
          addItem(
            { id: p.product_id, slug: p.product_slug, name: p.product_name, price: p.product_price, image: p.product_image, category: 'peptides' },
            p.qty,
            p.variant_label,
          );
        });
        toast(`Your coach added ${fresh.length} item${fresh.length === 1 ? '' : 's'} to your cart`, {
          description: fresh.map(p => `${p.qty} × ${p.product_name}${p.variant_label ? ' · ' + p.variant_label : ''}`).join(' · '),
        });
      } catch { /* ignore silently */ }
      finally {
        syncInFlight.current = false;
      }
    };
    syncPrescribed();
    const onFocus = () => syncPrescribed();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [addItem]);

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
