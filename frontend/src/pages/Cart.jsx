import React from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import Breadcrumbs from '../components/Breadcrumbs';
import { Button } from '../components/ui/button';
import { Trash2, Plus, Minus, ShoppingBag } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { resolveImage } from '../lib/api';

const Cart = () => {
  const { items, updateQty, removeItem, subtotal } = useCart();

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-10">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Shopping Basket' }]} />
        <h1 className="text-3xl md:text-4xl font-black uppercase mt-6 mb-8">Shopping Basket</h1>

        {items.length === 0 ? (
          <div className="text-center py-20 border rounded-lg">
            <ShoppingBag className="h-16 w-16 mx-auto text-slate-300" />
            <p className="mt-4 text-slate-600">Your basket is empty</p>
            <Link to="/" className="inline-block mt-6 bg-sky-500 hover:bg-sky-600 text-white px-6 py-3 rounded font-bold uppercase tracking-wider text-sm">
              Continue Shopping
            </Link>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              {items.map(item => (
                <div key={item._key} className="flex gap-4 border rounded-lg p-4 bg-white">
                  <Link to={`/${item.category}/${item.slug}`} className="w-24 h-24 bg-slate-50 rounded shrink-0">
                    <img src={resolveImage(item.image)} alt={item.name} className="w-full h-full object-contain p-2" />
                  </Link>
                  <div className="flex-1">
                    <Link to={`/${item.category}/${item.slug}`}>
                      <h3 className="font-bold text-slate-900 hover:text-sky-600 transition-colors">{item.name}</h3>
                    </Link>
                    {item.option && <p className="text-sm text-slate-500 mt-0.5">{item.option}</p>}
                    <p className="text-sky-600 font-bold mt-1">£{Number(item.price).toFixed(2)}</p>
                    <div className="flex items-center gap-3 mt-3">
                      <div className="flex items-center border rounded">
                        <button onClick={() => updateQty(item._key, item.qty - 1)} className="h-8 w-8 grid place-items-center hover:bg-slate-100" aria-label="Decrease"><Minus className="h-4 w-4" /></button>
                        <span className="w-10 text-center text-sm font-semibold">{item.qty}</span>
                        <button onClick={() => updateQty(item._key, item.qty + 1)} className="h-8 w-8 grid place-items-center hover:bg-slate-100" aria-label="Increase"><Plus className="h-4 w-4" /></button>
                      </div>
                      <button onClick={() => removeItem(item._key)} className="text-slate-500 hover:text-red-600 flex items-center gap-1 text-sm">
                        <Trash2 className="h-4 w-4" /> Remove
                      </button>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-slate-900">£{(item.price * item.qty).toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="border rounded-lg p-6 bg-slate-50 h-fit sticky top-32">
              <h2 className="text-lg font-bold uppercase border-b pb-3">Order Summary</h2>
              <div className="flex justify-between mt-4 text-sm">
                <span>Subtotal</span>
                <span className="font-semibold">£{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between mt-2 text-sm">
                <span>Shipping</span>
                <span className="text-slate-500">Calculated at checkout</span>
              </div>
              <div className="flex justify-between mt-4 pt-4 border-t font-bold text-lg">
                <span>Total</span>
                <span>£{subtotal.toFixed(2)}</span>
              </div>
              <Link to="/checkout">
                <Button className="w-full mt-6 bg-sky-500 hover:bg-sky-600 text-white font-bold uppercase tracking-wider h-12">
                  Proceed to Checkout
                </Button>
              </Link>
              <Link to="/" className="block text-center text-sm text-sky-600 hover:text-sky-700 mt-3">
                Continue Shopping
              </Link>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Cart;
