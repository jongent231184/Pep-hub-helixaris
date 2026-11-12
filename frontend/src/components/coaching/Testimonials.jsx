import React, { useEffect, useState } from 'react';
import { Coaches } from '../../lib/api';
import { Stars } from './FeedbackCard';
import { Quote } from 'lucide-react';

const Testimonials = () => {
  const [list, setList] = useState([]);
  useEffect(() => { Coaches.testimonials().then(setList).catch(() => {}); }, []);
  if (list.length === 0) return null;
  return (
    <section className="mb-12" data-testid="coaching-testimonials">
      <h2 className="text-xs uppercase tracking-widest text-slate-500 font-bold">In members' own words</h2>
      <p className="text-2xl md:text-3xl font-black text-slate-900 mt-1 mb-6">Feedback shared with permission</p>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.slice(0, 6).map(t => (
          <figure key={t.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col gap-3" data-testid={`testimonial-${t.id}`}>
            <Quote className="h-5 w-5 text-[#c8a24a]" />
            <blockquote className="text-sm text-slate-800 italic flex-1">“{t.testimonial}”</blockquote>
            <figcaption className="flex items-center justify-between text-xs text-slate-500"><span className="font-bold text-slate-900">{t.first_name}</span><Stars value={t.rating_overall} size="h-3.5 w-3.5" /></figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
};

export default Testimonials;
