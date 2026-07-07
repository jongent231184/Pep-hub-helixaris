import React from 'react';
import { Link } from 'react-router-dom';
import { resolveImage } from '../lib/api';

const ProductCard = ({ product }) => {
  const url = `/${product.category}/${product.slug}`;
  const hasPrice = product.price && product.price > 0;
  const productStock = Number.isFinite(product.stock) ? product.stock : 999;
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const anyVariantInStock = variants.length > 0
    ? variants.some(v => (v.stock === null || v.stock === undefined ? productStock : Number(v.stock)) > 0)
    : productStock > 0;
  const outOfStock = hasPrice && !anyVariantInStock;
  return (
    <div className="group bg-white border border-slate-200 rounded-md overflow-hidden hover:shadow-xl transition-shadow duration-300 relative flex flex-col">
      {outOfStock ? (
        <span
          data-testid="sold-out-badge"
          className="absolute top-3 left-3 z-10 bg-red-600 text-white text-[10px] font-bold uppercase px-2.5 py-1 rounded tracking-wider"
        >
          Sold Out
        </span>
      ) : product.badge && (
        <span className="absolute top-3 left-3 z-10 bg-sky-500 text-white text-[10px] font-bold uppercase px-2.5 py-1 rounded tracking-wider">
          {product.badge}
        </span>
      )}
      <Link to={url} className="block aspect-square bg-slate-50 overflow-hidden">
        <img
          src={resolveImage(product.image)}
          alt={product.name}
          loading="lazy"
          className={`w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-500 ${outOfStock ? 'opacity-60' : ''}`}
        />
      </Link>
      <div className="p-4 flex-1 flex flex-col">
        <Link to={url}>
          <h3 className="font-bold text-sm text-slate-900 hover:text-sky-600 transition-colors line-clamp-2 min-h-[40px]">
            {product.name}
          </h3>
        </Link>
        {product.tagline && (
          <p className="text-xs text-slate-500 mt-1">{product.tagline}</p>
        )}
        <div className="mt-2 mb-3">
          {hasPrice ? (
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-slate-900">£{Number(product.price).toFixed(2)}</span>
              {product.was_price ? (
                <span className="text-xs text-slate-500 line-through">Was £{Number(product.was_price).toFixed(2)}</span>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-slate-600 italic">{product.price_label || 'Email for pricing'}</p>
          )}
        </div>
        <Link
          to={url}
          className="mt-auto inline-flex justify-center items-center bg-slate-900 text-white text-xs font-bold uppercase tracking-wider px-4 py-2.5 rounded hover:bg-sky-600 transition-colors"
        >
          View
        </Link>
      </div>
    </div>
  );
};

export default ProductCard;
