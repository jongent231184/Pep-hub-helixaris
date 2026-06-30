import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2, ShoppingBag } from 'lucide-react';
import Layout from '../components/Layout';
import Breadcrumbs from '../components/Breadcrumbs';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Products, resolveImage } from '../lib/api';
import { useStore } from '../context/StoreContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../hooks/use-toast';

const ProductDetail = () => {
  const { productSlug, categorySlug } = useParams();
  const { getCategory } = useStore();
  const { addItem } = useCart();
  const { toast } = useToast();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState('1');
  const [option, setOption] = useState('');

  const cat = getCategory(categorySlug);

  useEffect(() => {
    setLoading(true);
    Products.get(productSlug)
      .then(setProduct)
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [productSlug]);

  if (loading) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-4 py-20 grid place-items-center">
          <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
        </div>
      </Layout>
    );
  }

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

  const hasPrice = product.price > 0;

  const handleAdd = () => {
    if (product.options && product.options.length > 0 && !option) {
      toast({ title: 'Please select an option', variant: 'destructive' });
      return;
    }
    addItem({
      id: product.id,
      slug: product.slug,
      name: product.name,
      price: product.price,
      image: product.image,
      category: product.category,
    }, parseInt(qty, 10), option || null);
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
          <div className="bg-slate-50 rounded-lg overflow-hidden border">
            <img src={resolveImage(product.image)} alt={product.name} className="w-full h-full object-contain aspect-square p-8" />
          </div>

          <div>
            <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight">{product.name}</h1>
            {product.tagline && (
              <p className="text-sky-600 font-semibold mt-2">{product.tagline}</p>
            )}

            <div className="mt-6">
              {hasPrice ? (
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-bold text-slate-900">£{Number(product.price).toFixed(2)}</span>
                  {product.was_price && (
                    <span className="text-slate-500 line-through">Was £{Number(product.was_price).toFixed(2)}</span>
                  )}
                </div>
              ) : (
                <p className="text-slate-700 italic">{product.price_label || 'Email for pricing'}</p>
              )}
            </div>

            <div className="mt-8 space-y-4 max-w-md">
              {product.options && product.options.length > 0 && (
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

              {hasPrice ? (
                <Button onClick={handleAdd} className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold uppercase tracking-wider h-12 text-base">
                  <ShoppingBag className="h-5 w-5 mr-2" /> Add to Basket
                </Button>
              ) : (
                <a href="mailto:GHP-Health@outlook.com" className="block text-center w-full bg-slate-900 hover:bg-slate-800 text-white font-bold uppercase tracking-wider h-12 leading-[3rem] rounded">
                  Email for Pricing
                </a>
              )}
            </div>
          </div>
        </div>

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
