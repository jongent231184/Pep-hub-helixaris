import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Droplets, Plus, X } from 'lucide-react';
import { Button } from './ui/button';
import { useCart } from '../context/CartContext';
import { Products, resolveImage } from '../lib/api';
import { useToast } from '../hooks/use-toast';

const BAC_SLUG = 'bac-water';

const BacWaterUpsell = () => {
  const { items, addItem } = useCart();
  const { toast } = useToast();
  const [product, setProduct] = useState(null);
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem('ghp_bac_upsell_dismissed') === '1');

  const hasVial = items.some(i => i.category === 'vials' && i.slug !== BAC_SLUG);
  const hasBac = items.some(i => i.slug === BAC_SLUG);
  const show = hasVial && !hasBac && !dismissed;

  useEffect(() => {
    if (show && !product) Products.get(BAC_SLUG).then(setProduct).catch(() => {});
  }, [show, product]);

  if (!show || !product) return null;

  const add = () => {
    addItem(product, 1);
    toast({ title: 'Added to basket', description: `${product.name} — for reconstituting your vials.` });
  };
  const dismiss = () => {
    sessionStorage.setItem('ghp_bac_upsell_dismissed', '1');
    setDismissed(true);
  };

  return (
    <div className="relative flex gap-4 border-2 border-dashed border-sky-300 rounded-lg p-4 bg-sky-50/60" data-testid="bac-water-upsell">
      <button onClick={dismiss} aria-label="Dismiss" data-testid="bac-water-upsell-dismiss" className="absolute top-2 right-2 text-slate-400 hover:text-slate-700">
        <X className="h-4 w-4" />
      </button>
      <Link to={`/${product.category}/${product.slug}`} className="w-20 h-20 bg-white rounded shrink-0 border">
        <img src={resolveImage(product.image)} alt={product.name} className="w-full h-full object-contain p-2" />
      </Link>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold uppercase tracking-wider text-sky-700 flex items-center gap-1"><Droplets className="h-3.5 w-3.5" /> Don't forget</p>
        <h3 className="font-bold text-slate-900 mt-0.5">Add bacteriostatic water?</h3>
        <p className="text-sm text-slate-600 mt-1">Lyophilised vials need bacteriostatic water for reconstitution. It's not included with your vial.</p>
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <Button onClick={add} size="sm" className="bg-sky-500 hover:bg-sky-600 text-white gap-1" data-testid="bac-water-upsell-add">
            <Plus className="h-4 w-4" /> Add for £{Number(product.price).toFixed(2)}
          </Button>
          <button onClick={dismiss} className="text-sm text-slate-500 hover:text-slate-800" data-testid="bac-water-upsell-skip">No thanks</button>
        </div>
      </div>
    </div>
  );
};

export default BacWaterUpsell;
