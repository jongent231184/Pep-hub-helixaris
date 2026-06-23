import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

const Breadcrumbs = ({ items }) => (
  <nav className="flex items-center text-sm text-slate-500 gap-2 flex-wrap">
    {items.map((it, idx) => (
      <React.Fragment key={idx}>
        {idx > 0 && <ChevronRight className="h-3.5 w-3.5" />}
        {it.to ? (
          <Link to={it.to} className="hover:text-sky-600">{it.label}</Link>
        ) : (
          <span className="text-slate-900 font-semibold">{it.label}</span>
        )}
      </React.Fragment>
    ))}
  </nav>
);

export default Breadcrumbs;
