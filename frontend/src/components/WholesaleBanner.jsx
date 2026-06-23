import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';

const WholesaleBanner = () => (
  <div className="bg-slate-100 border-b border-slate-200">
    <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-2 text-slate-700">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <span className="text-sm font-semibold uppercase tracking-wide">
          Wholesale now available - please email team for further information
        </span>
      </div>
      <Link to="/wholesale" className="text-xs font-bold uppercase tracking-wider bg-slate-800 text-white px-4 py-2 rounded hover:bg-slate-700 transition-colors">
        Read More
      </Link>
    </div>
  </div>
);

export default WholesaleBanner;
