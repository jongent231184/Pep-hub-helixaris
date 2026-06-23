import React, { useState } from 'react';
import Layout from '../components/Layout';
import Breadcrumbs from '../components/Breadcrumbs';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { Mail, Clock } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import { SITE } from '../data/mock';

const Contact = () => {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const { toast } = useToast();
  const update = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    toast({ title: 'Message sent', description: 'We’ll get back to you shortly.' });
    setForm({ name: '', email: '', subject: '', message: '' });
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-10">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Contact' }]} />
        <h1 className="text-4xl md:text-5xl font-black uppercase mt-6 mb-8">Contact Us</h1>

        <div className="grid md:grid-cols-2 gap-10">
          <div className="space-y-6">
            <p className="text-slate-700 leading-relaxed">
              For wholesale enquiries, product questions, or any other queries, reach our team directly.
            </p>
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-sky-600 mt-1" />
              <div>
                <p className="font-semibold">Email</p>
                <a href={`mailto:${SITE.email}`} className="text-sky-600 hover:text-sky-700">{SITE.email}</a>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-sky-600 mt-1" />
              <div>
                <p className="font-semibold">Customer service hours</p>
                <p className="text-slate-600">{SITE.customerHours}</p>
              </div>
            </div>
          </div>

          <form onSubmit={submit} className="border rounded-lg p-6 space-y-4 bg-slate-50">
            <div><Label>Name</Label><Input required value={form.name} onChange={update('name')} className="mt-1" /></div>
            <div><Label>Email</Label><Input required type="email" value={form.email} onChange={update('email')} className="mt-1" /></div>
            <div><Label>Subject</Label><Input required value={form.subject} onChange={update('subject')} className="mt-1" /></div>
            <div><Label>Message</Label><Textarea required rows={5} value={form.message} onChange={update('message')} className="mt-1" /></div>
            <Button type="submit" className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold uppercase tracking-wider h-11">Send Message</Button>
          </form>
        </div>
      </div>
    </Layout>
  );
};

export default Contact;
