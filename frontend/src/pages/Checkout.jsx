import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import Breadcrumbs from '../components/Breadcrumbs';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { useCart } from '../context/CartContext';
import { useToast } from '../hooks/use-toast';
import { Lock, CreditCard } from 'lucide-react';

const Checkout = () => {
  const { items, subtotal, clearCart } = useCart();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [processing, setProcessing] = useState(false);
  const [form, setForm] = useState({
    email: '', firstName: '', lastName: '', phone: '',
    address1: '', address2: '', city: '', postcode: '', country: 'United Kingdom',
    cardNumber: '', cardName: '', expiry: '', cvc: ''
  });

  const update = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const shipping = subtotal > 50 ? 0 : 4.99;
  const total = subtotal + shipping;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setProcessing(true);
    // Mock payment processing
    await new Promise(r => setTimeout(r, 1500));
    const orderId = 'GHP-' + Date.now();
    sessionStorage.setItem('ghp_last_order', JSON.stringify({
      orderId, items, total, shipping, email: form.email,
      shippingAddress: form
    }));
    clearCart();
    setProcessing(false);
    toast({ title: 'Payment successful', description: 'Redirecting to confirmation…' });
    navigate(`/order-confirmation/${orderId}`);
  };

  if (items.length === 0) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <h1 className="text-2xl font-bold mb-4">Your basket is empty</h1>
          <Link to="/" className="text-sky-600">Continue shopping</Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-10">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Cart', to: '/cart' }, { label: 'Checkout' }]} />
        <h1 className="text-3xl md:text-4xl font-black uppercase mt-6 mb-8">Checkout</h1>

        <form onSubmit={handleSubmit} className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {/* Contact */}
            <section className="border rounded-lg p-6">
              <h2 className="text-lg font-bold uppercase mb-4">Contact Information</h2>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={form.email} onChange={update('email')} className="mt-1" />
              </div>
            </section>

            {/* Shipping */}
            <section className="border rounded-lg p-6">
              <h2 className="text-lg font-bold uppercase mb-4">Shipping Address</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div><Label>First Name</Label><Input required value={form.firstName} onChange={update('firstName')} className="mt-1" /></div>
                <div><Label>Last Name</Label><Input required value={form.lastName} onChange={update('lastName')} className="mt-1" /></div>
                <div className="sm:col-span-2"><Label>Address Line 1</Label><Input required value={form.address1} onChange={update('address1')} className="mt-1" /></div>
                <div className="sm:col-span-2"><Label>Address Line 2 (Optional)</Label><Input value={form.address2} onChange={update('address2')} className="mt-1" /></div>
                <div><Label>City</Label><Input required value={form.city} onChange={update('city')} className="mt-1" /></div>
                <div><Label>Postcode</Label><Input required value={form.postcode} onChange={update('postcode')} className="mt-1" /></div>
                <div><Label>Country</Label>
                  <Select value={form.country} onValueChange={v => setForm(f => ({ ...f, country: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="United Kingdom">United Kingdom</SelectItem>
                      <SelectItem value="Ireland">Ireland</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Phone</Label><Input required value={form.phone} onChange={update('phone')} className="mt-1" /></div>
              </div>
            </section>

            {/* Payment */}
            <section className="border rounded-lg p-6">
              <h2 className="text-lg font-bold uppercase mb-1 flex items-center gap-2">
                <CreditCard className="h-5 w-5" /> Payment Details
              </h2>
              <p className="text-xs text-slate-500 mb-4 flex items-center gap-1">
                <Lock className="h-3 w-3" /> Secured by Worldpay
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2"><Label>Card Number</Label><Input required placeholder="4111 1111 1111 1111" value={form.cardNumber} onChange={update('cardNumber')} className="mt-1" /></div>
                <div className="sm:col-span-2"><Label>Cardholder Name</Label><Input required value={form.cardName} onChange={update('cardName')} className="mt-1" /></div>
                <div><Label>Expiry (MM/YY)</Label><Input required placeholder="12/26" value={form.expiry} onChange={update('expiry')} className="mt-1" /></div>
                <div><Label>CVC</Label><Input required placeholder="123" value={form.cvc} onChange={update('cvc')} className="mt-1" /></div>
              </div>
              <p className="mt-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
                Worldpay integration is currently mocked. Real payment processing will activate once Worldpay credentials are added on the backend.
              </p>
            </section>
          </div>

          {/* Summary */}
          <div className="border rounded-lg p-6 bg-slate-50 h-fit sticky top-32">
            <h2 className="text-lg font-bold uppercase border-b pb-3">Order Summary</h2>
            <div className="space-y-3 mt-4 max-h-72 overflow-y-auto">
              {items.map(it => (
                <div key={it._key} className="flex gap-3 text-sm">
                  <img src={it.image} alt={it.name} className="w-14 h-14 bg-white rounded border object-contain p-1 shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold leading-tight">{it.name}</p>
                    {it.option && <p className="text-xs text-slate-500">{it.option}</p>}
                    <p className="text-xs text-slate-500">Qty: {it.qty}</p>
                  </div>
                  <p className="font-semibold">£{(it.price * it.qty).toFixed(2)}</p>
                </div>
              ))}
            </div>
            <div className="border-t mt-4 pt-4 space-y-2 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>£{subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Shipping</span><span>{shipping === 0 ? 'FREE' : `£${shipping.toFixed(2)}`}</span></div>
              <div className="flex justify-between font-bold text-base pt-2 border-t"><span>Total</span><span>£{total.toFixed(2)}</span></div>
            </div>
            <Button type="submit" disabled={processing} className="w-full mt-6 bg-sky-500 hover:bg-sky-600 text-white font-bold uppercase tracking-wider h-12">
              {processing ? 'Processing…' : `Pay £${total.toFixed(2)}`}
            </Button>
            <p className="text-[11px] text-slate-500 text-center mt-3 flex items-center justify-center gap-1">
              <Lock className="h-3 w-3" /> SSL secure checkout
            </p>
          </div>
        </form>
      </div>
    </Layout>
  );
};

export default Checkout;
