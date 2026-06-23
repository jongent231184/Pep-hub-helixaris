import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import Breadcrumbs from '../components/Breadcrumbs';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { CATEGORIES, getProduct } from '../data/mock';
import { useCart } from '../context/CartContext';
import { useToast } from '../hooks/use-toast';
import { ShoppingBag } from 'lucide-react';

const ProductDetail = () => {
  const { productSlug, categorySlug } = useParams();
  const navigate = useNavigate();
  const product = getProduct(productSlug);
  const cat = CATEGORIES.find(c => c.slug === categorySlug);
  const { addItem } = useCart();
  const { toast } = useToast();

  const [qty, setQty] = useState('1');
  const [option, setOption] = useState('');

  if (!product) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <h1 className="text-2xl font-bold mb-4">Product not found</h1>
          <Link to="/" className="text-sky-600 hover:text-sky-700">Return to home</Link>
        </div>
      </Layout>
    );
  }

  const handleAdd = () => {
    if (product.options && !option) {
      toast({ title: 'Please select a size', variant: 'destructive' });
      return;
    }
    addItem(product, parseInt(qty, 10), option || null);
    toast({ title: 'Added to basket', description: product.name });
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-10">
        <Breadcrumbs items={[
          { label: 'Home', to: '/' },
          { label: cat?.name || product.category, to: `/${product.category}` },
          { label: product.name }
        ]} />

        <div className="grid lg:grid-cols-2 gap-10 mt-8">
          {/* Image */}
          <div className="bg-slate-50 rounded-lg overflow-hidden border">
            <img src={product.image} alt={product.name} className="w-full h-full object-contain aspect-square p-8" />
          </div>

          {/* Info */}
          <div>
            <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight">{product.name}</h1>
            {product.tagline && (
              <p className="text-sky-600 font-semibold mt-2">{product.tagline}</p>
            )}

            <div className="mt-6">
              {product.price > 0 ? (
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-bold text-slate-900">£{product.price.toFixed(2)}</span>
                  {product.wasPrice && (
                    <span className="text-slate-500 line-through">Was £{product.wasPrice.toFixed(2)}</span>
                  )}
                </div>
              ) : (
                <p className="text-slate-700 italic">{product.priceLabel}</p>
              )}
            </div>

            <div className="mt-8 space-y-4 max-w-md">
              {product.options && (
                <div>
                  <label className="text-sm font-semibold uppercase tracking-wide block mb-2">Size</label>
                  <Select value={option} onValueChange={setOption}>
                    <SelectTrigger><SelectValue placeholder="Select Option..." /></SelectTrigger>
                    <SelectContent>
                      {product.options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <label className="text-sm font-semibold uppercase tracking-wide block mb-2">Qty</label>
                <Select value={qty} onValueChange={setQty}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 20 }, (_, i) => i + 1).map(n => (
                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {product.price > 0 ? (
                <Button onClick={handleAdd} className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold uppercase tracking-wider h-12 text-base">
                  <ShoppingBag className="h-5 w-5 mr-2" /> Add to Basket
                </Button>
              ) : (
                <a href="mailto:ghpeptides@outlook.com" className="block text-center w-full bg-slate-900 hover:bg-slate-800 text-white font-bold uppercase tracking-wider h-12 leading-[3rem] rounded">
                  Email for Pricing
                </a>
              )}
            </div>

            <div className="mt-8 pt-6 border-t">
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500">We Accept:</h4>
              <div className="flex gap-2 mt-3">
                {['visa', 'mastercard', 'visa-electron'].map(c => (
                  <img key={c} src={`https://content.webfactorysite.co.uk/14-card-${c}.png`} alt={c} className="h-7" />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="mt-14 max-w-3xl">
          <h2 className="text-xl font-bold uppercase tracking-wide border-b pb-3 mb-4">Description</h2>
          <p className="text-slate-700 leading-relaxed whitespace-pre-line">{product.description}</p>
          <p className="text-xs text-slate-500 italic mt-6">For laboratory research use only. Not for human consumption.</p>
        </div>
      </div>
    </Layout>
  );
};

export default ProductDetail;
