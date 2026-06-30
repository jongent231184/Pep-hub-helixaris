import React from 'react';
import Layout from '../components/Layout';
import Breadcrumbs from '../components/Breadcrumbs';
import { FlaskConical, ShieldAlert, Scale } from 'lucide-react';

const About = () => (
  <Layout>
    <div className="max-w-5xl mx-auto px-4 py-10">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'About Us' }]} />
      <h1 className="text-4xl md:text-5xl font-black uppercase mt-6 mb-8">About Us</h1>

      <div className="aspect-[21/9] rounded-lg overflow-hidden mb-10 bg-slate-100">
        <img
          src="https://content.webfactorysite.co.uk/749d7ff0-99f8-4621-a16e-6275b292c881.jpg?t=1778492996"
          alt="About GHP-Health"
          className="w-full h-full object-cover"
        />
      </div>

      <h2 className="text-2xl font-bold mb-4">GHP-Health</h2>
      <div className="prose max-w-none text-slate-700 leading-relaxed space-y-4">
        <p>GHP-Health is a UK-based supplier of premium-grade research peptides for the scientific and research community. We hold ourselves to the highest standards of scientific integrity and product quality.</p>
        <p>Precision, purity, and reliability sit at the core of what we do. Every batch is produced under strict quality controls and independently verified for molecular consistency.</p>
        <p>We provide fast, discreet UK delivery and transparent sourcing so researchers can focus on advancing their work with confidence.</p>
        <p className="italic text-sm text-slate-500">Please note: All products supplied by GHP-Health (GHP) are intended solely for laboratory research and are not approved for human use.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mt-12">
        {[
          { icon: FlaskConical, title: 'Research use only', body: 'Our peptides are available exclusively for scientific and laboratory work by qualified professionals.' },
          { icon: ShieldAlert, title: 'Not for human consumption', body: 'These products are not foods, drugs, or medical devices and must not be used for self-administration, clinical treatments, or diagnostics.' },
          { icon: Scale, title: 'Legal compliance', body: 'Buyers are responsible for understanding and following all applicable laws and regulations in their jurisdiction regarding the purchase, handling, and use of research chemicals.' }
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="border rounded-lg p-6">
            <Icon className="h-8 w-8 text-sky-600 mb-3" />
            <h3 className="font-bold uppercase tracking-wide text-sm mb-2">{title}</h3>
            <p className="text-sm text-slate-600 leading-relaxed">{body}</p>
          </div>
        ))}
      </div>

      <ul className="mt-10 space-y-3 text-sm text-slate-700">
        <li><strong>Final sale policy:</strong> Due to the sensitive nature of these materials, all sales are final. We’re unable to accept returns or issue refunds.</li>
        <li><strong>Responsible use and quality:</strong> We do not condone misuse or off-label application. All compounds are supplied under strict quality control for authorised research only.</li>
        <li><strong>Terms &amp; Conditions:</strong> By using this website and placing an order, you confirm that you have read, understood, and agree to this disclaimer. All products are intended for laboratory research use only. Not for human consumption.</li>
      </ul>
    </div>
  </Layout>
);

export default About;
