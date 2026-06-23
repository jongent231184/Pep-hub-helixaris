import React from 'react';
import { Link } from 'react-router-dom';

const ProductCard = ({ product }) => {
  const url = `/${product.category}/${product.slug}`;
  return (
    <div className="group bg-white border border-slate-200 rounded-md overflow-hidden hover:shadow-xl transition-shadow duration-300 relative flex flex-col">
      {product.badge && (
        <span className="absolute top-3 left-3 z-10 bg-sky-500 text-white text-[10px] font-bold uppercase px-2.5 py-1 rounded tracking-wider">
          {product.badge}
        </span>
      )}
      <Link to={url} className="block aspect-square bg-slate-50 overflow-hidden">
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          className="w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-500"
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
          {product.price > 0 ? (
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-slate-900">£{product.price.toFixed(2)}</span>
              {product.wasPrice && (
                <span className="text-xs text-slate-500 line-through">Was £{product.wasPrice.toFixed(2)}</span>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-600 italic">{product.priceLabel}</p>
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
