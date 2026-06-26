import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, FlaskConical, BadgeCheck, Truck, ArrowRight, Loader2 } from 'lucide-react';
import Layout from '../components/Layout';
import CategoryCard from '../components/CategoryCard';
import ProductCard from '../components/ProductCard';
import { useStore } from '../context/StoreContext';

const FEATURES = [
  { icon: ShieldCheck, title: 'Scientific Integrity', desc: 'Highest standards of scientific integrity and product quality.' },
  { icon: FlaskConical, title: 'Premium Research Grade', desc: 'Specialist premium-grade research peptides.' },
  { icon: BadgeCheck, title: 'Verified Quality & Purity', desc: 'Strict quality control and independent verification.' },
  { icon: Truck, title: 'Fast & Reliable UK Delivery', desc: 'Fast, discreet UK delivery with transparent sourcing.' },
];

const Home = () => {
  const { categories, getFeatured, loading } = useStore();
  const featured = getFeatured();

  return (
    <Layout>
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: 'url(https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=1920&q=80)',
            filter: 'brightness(0.6) saturate(1.2)'
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-sky-900/80 via-slate-900/70 to-slate-900/30" />
        <div className="relative max-w-7xl mx-auto px-4 py-24 md:py-36">
          <div className="max-w-2xl">
            <h1 className="text-white text-4xl md:text-6xl font-black uppercase tracking-tight leading-tight">
              Premium-grade<br />research peptides
            </h1>
            <p className="text-slate-100 mt-6 text-base md:text-lg max-w-xl leading-relaxed">
              Based in the United Kingdom, supplying premium-grade research peptides to the scientific and research community.
            </p>
            <Link
              to="/about-us"
              className="inline-flex items-center gap-2 mt-8 bg-sky-500 hover:bg-sky-600 text-white font-bold uppercase tracking-wider px-7 py-3.5 rounded transition-colors"
            >
              Learn More <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="p-6 text-center border border-slate-200 rounded-lg hover:border-sky-400 hover:shadow-lg transition-all">
              <div className="h-14 w-14 mx-auto rounded-full bg-sky-50 grid place-items-center text-sky-600 mb-4">
                <Icon className="h-7 w-7" />
              </div>
              <h3 className="font-bold text-slate-900 uppercase tracking-wide text-sm">{title}</h3>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 pb-16">
        {loading ? (
          <div className="py-12 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-sky-500" /></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {categories.filter(c => c.slug !== 'bundles').map(cat => (
              <CategoryCard key={cat.slug} category={cat} />
            ))}
          </div>
        )}
      </section>

      <section className="max-w-7xl mx-auto px-4 pb-20">
        <div className="flex items-end justify-between mb-8">
          <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight text-slate-900">Latest Products</h2>
          <Link to="/bundles" className="text-sm font-bold uppercase text-sky-600 hover:text-sky-700 tracking-wider hidden sm:inline">View All</Link>
        </div>
        {loading ? (
          <div className="py-12 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-sky-500" /></div>
        ) : featured.length === 0 ? (
          <p className="text-center text-slate-500 py-12">No featured products yet.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {featured.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </section>
    </Layout>
  );
};

export default Home;
