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

  const variants = Array.isArray(product.variants) ? product.variants : [];
  const legacyOptions = Array.isArray(product.options) ? product.options : [];
  const productStock = Number.isFinite(product.stock) ? product.stock : 999;
  // Prefer new-style variants; fall back to legacy string options (all at base price)
  const optionList = variants.length > 0
    ? variants.map(v => ({
        label: v.label,
        price: Number(v.price ?? product.price ?? 0),
        stock: v.stock === null || v.stock === undefined ? productStock : Number(v.stock),
      }))
    : legacyOptions.map(l => ({ label: l, price: Number(product.price ?? 0), stock: productStock }));

  const selectedVariant = option ? optionList.find(o => o.label === option) : null;
  const currentPrice = selectedVariant ? selectedVariant.price : Number(product.price ?? 0);
  const currentStock = selectedVariant ? selectedVariant.stock : productStock;

  const hasPrice = currentPrice > 0 || (optionList.length > 0 && optionList.some(o => o.price > 0));
  // If variants exist, "sold out" means ALL variants have 0 stock. If no variants, product stock rules.
  const anyInStock = optionList.length > 0
    ? optionList.some(o => o.stock > 0)
    : productStock > 0;
  const outOfStock = hasPrice && !anyInStock;
  const stockForNudge = selectedVariant ? currentStock : (optionList.length > 0 ? Math.max(...optionList.map(o => o.stock)) : productStock);
  const lowStock = hasPrice && stockForNudge > 0 && stockForNudge <= 5;
  const maxQty = Math.max(1, Math.min(20, currentStock || 1));

  const handleAdd = () => {
    if (optionList.length > 0 && !option) {
      toast({ title: 'Please select an option', variant: 'destructive' });
      return;
    }
    if (selectedVariant && selectedVariant.stock <= 0) {
      toast({ title: 'This option is sold out', variant: 'destructive' });
      return;
    }
    addItem({
      id: product.id,
      slug: product.slug,
      name: product.name,
      price: currentPrice,
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

        <div
          data-testid="research-disclaimer-banner"
          className="mt-6 bg-amber-50 border-l-4 border-amber-500 rounded px-4 py-3 text-xs sm:text-sm text-amber-900"
        >
          <strong className="uppercase tracking-wider">For research use only.</strong>{' '}
          Supplied strictly for laboratory research purposes. Not for human consumption, therapeutic use, or in vitro diagnostic use.
        </div>

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
                  <span className="text-3xl font-bold text-slate-900" data-testid="product-price">£{Number(currentPrice).toFixed(2)}</span>
                  {product.was_price && (
                    <span className="text-slate-500 line-through">Was £{Number(product.was_price).toFixed(2)}</span>
                  )}
                  {optionList.length > 0 && !option && (
                    <span className="text-xs text-slate-500 italic">Select an option to confirm price</span>
                  )}
                </div>
              ) : (
                <p className="text-slate-700 italic">{product.price_label || 'Email for pricing'}</p>
              )}
            </div>

            <div className="mt-8 space-y-4 max-w-md">
              {optionList.length > 0 && (
                <div>
                  <label className="text-sm font-semibold uppercase tracking-wide block mb-2">Option</label>
                  <Select value={option} onValueChange={setOption}>
                    <SelectTrigger data-testid="variant-select"><SelectValue placeholder="Select Option..." /></SelectTrigger>
                    <SelectContent>
                      {optionList.map(o => {
                        const opSoldOut = o.stock <= 0;
                        const opLow = o.stock > 0 && o.stock <= 5;
                        return (
                          <SelectItem key={o.label} value={o.label} disabled={opSoldOut}>
                            {o.label}
                            {o.price > 0 && ` — £${Number(o.price).toFixed(2)}`}
                            {opSoldOut && ' — Sold out'}
                            {opLow && ` (only ${o.stock} left)`}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <label className="text-sm font-semibold uppercase tracking-wide block mb-2">Qty</label>
                <Select value={qty} onValueChange={setQty} disabled={outOfStock}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: maxQty }, (_, i) => i + 1).map(n => (
                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {hasPrice && (lowStock || outOfStock || (selectedVariant && selectedVariant.stock <= 0)) && (
                  <p
                    data-testid="stock-message"
                    className={`text-xs font-semibold mt-2 ${(outOfStock || (selectedVariant && selectedVariant.stock <= 0)) ? 'text-red-600' : 'text-amber-600'}`}
                  >
                    {outOfStock
                      ? 'Sold Out'
                      : selectedVariant && selectedVariant.stock <= 0
                        ? `${selectedVariant.label} is sold out — pick another option`
                        : selectedVariant
                          ? `Only ${selectedVariant.stock} left of ${selectedVariant.label}`
                          : `Only ${stockForNudge} left in stock`}
                  </p>
                )}
              </div>

              {hasPrice ? (
                <Button
                  onClick={handleAdd}
                  disabled={outOfStock}
                  data-testid="add-to-basket-btn"
                  className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold uppercase tracking-wider h-12 text-base disabled:bg-slate-300 disabled:cursor-not-allowed"
                >
                  <ShoppingBag className="h-5 w-5 mr-2" /> {outOfStock ? 'Sold Out' : 'Add to Basket'}
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
