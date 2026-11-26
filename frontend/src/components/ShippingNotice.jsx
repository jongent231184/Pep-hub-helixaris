import React, { useEffect, useState } from 'react';
import { Truck } from 'lucide-react';
import { ShippingRestrictions } from '../lib/api';

let cache = null;
export const useShippingRestrictions = () => {
  const [data, setData] = useState(cache);
  useEffect(() => {
    if (cache) return;
    ShippingRestrictions.get().then(d => { cache = d; setData(d); }).catch(() => setData({ countries: [], postcode_prefixes: [], areas: [] }));
  }, []);
  return data || { countries: [], postcode_prefixes: [], areas: [] };
};

export const restrictionText = (r) => {
  const parts = [...(r.countries || []), ...(r.areas || [])];
  return parts.length ? `UK mainland only — we're unable to deliver to ${parts.join(', ')}.` : 'UK mainland delivery only.';
};

export const ShippingNotice = ({ className = '' }) => {
  const r = useShippingRestrictions();
  return (
    <p className={`flex items-start gap-2 text-xs text-slate-600 ${className}`} data-testid="shipping-notice">
      <Truck className="h-4 w-4 text-sky-600 shrink-0 mt-0.5" />
      <span>{restrictionText(r)}</span>
    </p>
  );
};
