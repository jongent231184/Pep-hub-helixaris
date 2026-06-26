import React, { useEffect, useState } from 'react';
import { Settings as SettingsApi } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Loader2 } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import { useStore } from '../../context/StoreContext';

const AdminSettings = () => {
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { refresh } = useStore();

  useEffect(() => {
    SettingsApi.get().then(setForm).finally(() => setLoading(false));
  }, []);

  const update = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const updateNum = (k) => (e) => setForm(f => ({ ...f, [k]: Number(e.target.value) || 0 }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await SettingsApi.update(form);
      toast({ title: 'Settings saved' });
      refresh();
    } catch (err) {
      toast({ title: 'Save failed', description: String(err.response?.data?.detail || err.message), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  if (loading || !form) return <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl md:text-3xl font-black uppercase mb-6">Settings</h1>
      <form onSubmit={save} className="space-y-6 bg-white border rounded-lg p-6">
        <div className="grid grid-cols-2 gap-4">
          <div><Label>Site name</Label><Input value={form.site_name} onChange={update('site_name')} className="mt-1" /></div>
          <div><Label>Contact email</Label><Input type="email" value={form.contact_email} onChange={update('contact_email')} className="mt-1" /></div>
        </div>
        <div><Label>Customer service hours</Label><Input value={form.customer_hours} onChange={update('customer_hours')} className="mt-1" /></div>
        <div><Label>Wholesale banner text</Label><Input value={form.wholesale_banner} onChange={update('wholesale_banner')} className="mt-1" /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><Label>TikTok URL</Label><Input value={form.tiktok || ''} onChange={update('tiktok')} className="mt-1" /></div>
          <div><Label>Instagram URL</Label><Input value={form.instagram || ''} onChange={update('instagram')} className="mt-1" /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><Label>Free shipping threshold (£)</Label><Input type="number" step="0.01" value={form.free_shipping_threshold} onChange={updateNum('free_shipping_threshold')} className="mt-1" /></div>
          <div><Label>Flat shipping rate (£)</Label><Input type="number" step="0.01" value={form.flat_shipping} onChange={updateNum('flat_shipping')} className="mt-1" /></div>
        </div>

        <div className="border-t pt-4 flex justify-end">
          <Button type="submit" disabled={saving} className="bg-sky-500 hover:bg-sky-600 text-white">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save settings'}
          </Button>
        </div>

        <div className="border-t pt-4 text-xs text-slate-500">
          <p className="font-semibold mb-1">Note about PayPal:</p>
          <p>To enable real payments, set <code className="bg-slate-100 px-1 rounded">PAYPAL_CLIENT_ID</code> and <code className="bg-slate-100 px-1 rounded">PAYPAL_CLIENT_SECRET</code> in <code className="bg-slate-100 px-1 rounded">backend/.env</code> and restart the backend.</p>
        </div>
      </form>
    </div>
  );
};

export default AdminSettings;
