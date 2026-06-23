import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

const CategoryCard = ({ category }) => (
  <Link
    to={`/${category.slug}`}
    className="group block relative overflow-hidden rounded-lg shadow-md hover:shadow-2xl transition-shadow duration-300"
  >
    <div className="aspect-[4/5] bg-slate-100 overflow-hidden">
      <img
        src={category.image}
        alt={category.name}
        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
      />
    </div>
    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent" />
    <div className="absolute bottom-0 left-0 right-0 p-5 flex items-center justify-between">
      <h3 className="text-white text-xl md:text-2xl font-black uppercase tracking-wider">
        {category.name}
      </h3>
      <div className="h-9 w-9 rounded-full bg-white grid place-items-center group-hover:bg-sky-500 group-hover:text-white transition-colors">
        <ArrowRight className="h-4 w-4" />
      </div>
    </div>
  </Link>
);

export default CategoryCard;
