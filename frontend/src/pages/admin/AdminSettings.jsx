import React, { useEffect, useState } from 'react';
import { Settings as SettingsApi } from '../../lib/api';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Loader2, Globe, Lock, Eye, EyeOff } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import { useStore } from '../../context/StoreContext';
import ChangePasswordCard from '../../components/ChangePasswordCard';

const AdminSettings = () => {
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const { toast } = useToast();
  const { refresh } = useStore();

  useEffect(() => {
    // Use admin endpoint to get the full settings including site_password
    api.get('/settings/admin').then(r => setForm(r.data)).finally(() => setLoading(false));
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
      <form onSubmit={save} className="space-y-6">
        {/* --- PUBLISH SECTION --- */}
        <section className="bg-white border rounded-lg p-6">
          <h2 className="text-base font-bold uppercase tracking-wide mb-4 flex items-center gap-2">
            {form.published ? <Globe className="h-5 w-5 text-emerald-600" /> : <Lock className="h-5 w-5 text-amber-600" />} Publish status
          </h2>

          <div className={`flex items-start justify-between gap-4 rounded-lg p-4 border ${form.published ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
            <div>
              <p className="font-bold">{form.published ? 'Site is LIVE' : 'Site is PRIVATE'}</p>
              <p className="text-xs text-slate-600 mt-1">
                {form.published
                  ? 'Anyone can visit your storefront. Customers can shop and check out.'
                  : 'Visitors are blocked behind a password gate. Only people with the preview password (or admin login) can view the storefront.'}
              </p>
            </div>
            <Switch checked={form.published} onCheckedChange={v => setForm(f => ({ ...f, published: v }))} />
          </div>

          <div className="mt-4">
            <Label>Preview password (used while site is private)</Label>
            <div className="mt-1 relative">
              <Input
                type={showPwd ? 'text' : 'password'}
                value={form.site_password || ''}
                onChange={update('site_password')}
                placeholder="e.g. preview2026"
                className="pr-10"
              />
              <button type="button" onClick={() => setShowPwd(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700" aria-label="toggle">
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Share this password with anyone you want to preview the site before going live. Admins can always view the site without it once logged in.
            </p>
          </div>
        </section>

        {/* --- BRAND --- */}
        <section className="bg-white border rounded-lg p-6 space-y-4">
          <h2 className="text-base font-bold uppercase tracking-wide">Brand & contact</h2>
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
        </section>

        {/* --- COMMUNITY / WHATSAPP INVITE --- */}
        <section className="bg-white border rounded-lg p-6 space-y-4">
          <h2 className="text-base font-bold uppercase tracking-wide">Community invite</h2>
          <p className="text-xs text-slate-500 -mt-2">
            Optional WhatsApp / Telegram / Discord group link shown on the
            order confirmation email and the checkout thank-you page. Leave
            the URL blank to hide the block completely.
          </p>
          <div>
            <Label>Invite URL</Label>
            <Input
              value={form.whatsapp_invite_url || ''}
              onChange={update('whatsapp_invite_url')}
              placeholder="https://chat.whatsapp.com/xxxxxxxxxxxxxxxxxxxxxx"
              className="mt-1"
              data-testid="settings-whatsapp-url"
            />
          </div>
          <div>
            <Label>Headline</Label>
            <Input
              value={form.whatsapp_invite_headline || ''}
              onChange={update('whatsapp_invite_headline')}
              placeholder="Join our WhatsApp community"
              className="mt-1"
              data-testid="settings-whatsapp-headline"
            />
          </div>
          <div>
            <Label>Body text</Label>
            <Input
              value={form.whatsapp_invite_body || ''}
              onChange={update('whatsapp_invite_body')}
              placeholder="Get first-look drops, batch updates, restock alerts and peer discussion — direct from the team."
              className="mt-1"
              data-testid="settings-whatsapp-body"
            />
          </div>
        </section>

        {/* --- LEGAL / COMPLIANCE --- */}
        <section className="bg-white border rounded-lg p-6 space-y-4">
          <h2 className="text-base font-bold uppercase tracking-wide">Legal &amp; compliance</h2>
          <p className="text-xs text-slate-500 -mt-2">
            Shown in the site footer and referenced on merchant / payment
            provider applications. Leave blank to hide a field.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>UK company number</Label>
              <Input
                value={form.company_number || ''}
                onChange={update('company_number')}
                placeholder="e.g. 15234567"
                className="mt-1"
                data-testid="settings-company-number"
              />
            </div>
            <div>
              <Label>VAT number (optional)</Label>
              <Input
                value={form.vat_number || ''}
                onChange={update('vat_number')}
                placeholder="e.g. GB 123 4567 89"
                className="mt-1"
                data-testid="settings-vat-number"
              />
            </div>
          </div>
          <div>
            <Label>Registered address</Label>
            <Input
              value={form.registered_address || ''}
              onChange={update('registered_address')}
              placeholder="e.g. 71-75 Shelton Street, Covent Garden, London, WC2H 9JQ"
              className="mt-1"
              data-testid="settings-registered-address"
            />
          </div>
        </section>

        {/* --- SHIPPING --- */}
        <section className="bg-white border rounded-lg p-6 space-y-4">
          <h2 className="text-base font-bold uppercase tracking-wide">Shipping</h2>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Free shipping threshold (£)</Label><Input type="number" step="0.01" value={form.free_shipping_threshold} onChange={updateNum('free_shipping_threshold')} className="mt-1" /></div>
            <div><Label>Flat shipping rate (£)</Label><Input type="number" step="0.01" value={form.flat_shipping} onChange={updateNum('flat_shipping')} className="mt-1" /></div>
          </div>
        </section>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving} className="bg-sky-500 hover:bg-sky-600 text-white">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save settings'}
          </Button>
        </div>
      </form>

      <div className="mt-8 bg-white border rounded-lg">
        <ChangePasswordCard />
      </div>
    </div>
  );
};

export default AdminSettings;
