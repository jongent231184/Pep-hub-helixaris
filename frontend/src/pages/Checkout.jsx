import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import Breadcrumbs from '../components/Breadcrumbs';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { useCart } from '../context/CartContext';
import { useStore } from '../context/StoreContext';
import { useToast } from '../hooks/use-toast';
import { Lock, Loader2 } from 'lucide-react';
import { Orders, PayPal, resolveImage } from '../lib/api';

const loadPayPalScript = (clientId, currency = 'GBP') => new Promise((resolve, reject) => {
  if (window.paypal) return resolve(window.paypal);
  const existing = document.getElementById('paypal-sdk');
  if (existing) {
    existing.addEventListener('load', () => resolve(window.paypal));
    existing.addEventListener('error', reject);
    return;
  }
  const s = document.createElement('script');
  s.id = 'paypal-sdk';
  s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${currency}&intent=capture`;
  s.onload = () => resolve(window.paypal);
  s.onerror = reject;
  document.head.appendChild(s);
});

const Checkout = () => {
  const { items, subtotal, clearCart } = useCart();
  const { settings } = useStore();
  const navigate = useNavigate();
  const { toast } = useToast();
  const paypalRef = useRef(null);

  const [step, setStep] = useState('details'); // 'details' | 'payment'
  const [processing, setProcessing] = useState(false);
  const [paypalConfig, setPaypalConfig] = useState(null);
  const [createdOrder, setCreatedOrder] = useState(null);
  const [form, setForm] = useState({
    email: '', firstName: '', lastName: '', phone: '',
    address1: '', address2: '', city: '', postcode: '', country: 'United Kingdom',
  });

  const update = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const flat = settings?.flat_shipping ?? 4.99;
  const threshold = settings?.free_shipping_threshold ?? 50;
  const shipping = subtotal >= threshold ? 0 : flat;
  const total = subtotal + shipping;

  useEffect(() => {
    PayPal.config().then(setPaypalConfig).catch(() => setPaypalConfig({ configured: false }));
  }, []);

  // Render PayPal buttons after order is created
  useEffect(() => {
    if (step !== 'payment' || !createdOrder || !paypalConfig?.configured) return;
    let cancelled = false;
    (async () => {
      try {
        const paypal = await loadPayPalScript(paypalConfig.client_id, 'GBP');
        if (cancelled || !paypalRef.current) return;
        paypalRef.current.innerHTML = '';
        paypal.Buttons({
          style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal' },
          createOrder: async () => {
            try {
              const { paypal_order_id } = await PayPal.createOrder(createdOrder.id);
              return paypal_order_id;
            } catch (e) {
              const msg = e.response?.data?.detail || e.message || 'Unable to start payment';
              toast({ title: 'Cannot proceed', description: String(msg), variant: 'destructive' });
              throw e;
            }
          },
          onApprove: async (data) => {
            setProcessing(true);
            try {
              const res = await PayPal.captureOrder(createdOrder.id, data.orderID);
              if (res.payment_status === 'paid') {
                clearCart();
                toast({ title: 'Payment successful' });
                navigate(`/order-confirmation/${createdOrder.order_number}`);
              } else {
                toast({ title: 'Payment incomplete', description: 'Please try again or contact support.', variant: 'destructive' });
              }
            } catch (e) {
              toast({ title: 'Capture failed', description: String(e.response?.data?.detail || e.message), variant: 'destructive' });
            } finally {
              setProcessing(false);
            }
          },
          onError: (err) => {
            toast({ title: 'PayPal error', description: String(err), variant: 'destructive' });
          }
        }).render(paypalRef.current);
      } catch (e) {
        toast({ title: 'Failed to load PayPal', description: String(e), variant: 'destructive' });
      }
    })();
    return () => { cancelled = true; };
  }, [step, createdOrder, paypalConfig, clearCart, navigate, toast]);

  const submitDetails = async (e) => {
    e.preventDefault();
    setProcessing(true);
    try {
      const orderPayload = {
        items: items.map(i => ({
          product_id: i.id,
          slug: i.slug,
          name: i.name,
          image: i.image || '',
          option: i.option,
          qty: i.qty,
          price: i.price,
        })),
        shipping_address: {
          first_name: form.firstName,
          last_name: form.lastName,
          email: form.email,
          phone: form.phone,
          address1: form.address1,
          address2: form.address2,
          city: form.city,
          postcode: form.postcode,
          country: form.country,
        },
        subtotal, shipping, total,
      };
      const order = await Orders.create(orderPayload);
      setCreatedOrder(order);
      setStep('payment');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast({ title: 'Failed to create order', description: detail ? JSON.stringify(detail) : err.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  // Test/manual mark-paid when PayPal not configured
  const completeTestOrder = async () => {
    if (!createdOrder) return;
    clearCart();
    toast({ title: 'Order placed', description: 'Awaiting payment configuration' });
    navigate(`/order-confirmation/${createdOrder.order_number}`);
  };

  if (items.length === 0 && !createdOrder) {
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
        <Breadcrumbs items={[
          { label: 'Home', to: '/' },
          { label: 'Cart', to: '/cart' },
          { label: 'Checkout' }
        ]} />
        <h1 className="text-3xl md:text-4xl font-black uppercase mt-6 mb-8">Checkout</h1>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {step === 'details' && (
              <form id="details-form" onSubmit={submitDetails} className="space-y-8">
                <section className="border rounded-lg p-6 bg-white">
                  <h2 className="text-lg font-bold uppercase mb-4">Contact Information</h2>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" required value={form.email} onChange={update('email')} className="mt-1" />
                  </div>
                </section>

                <section className="border rounded-lg p-6 bg-white">
                  <h2 className="text-lg font-bold uppercase mb-4">Shipping Address</h2>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div><Label>First Name</Label><Input required value={form.firstName} onChange={update('firstName')} className="mt-1" /></div>
                    <div><Label>Last Name</Label><Input required value={form.lastName} onChange={update('lastName')} className="mt-1" /></div>
                    <div className="sm:col-span-2"><Label>Address Line 1</Label><Input required value={form.address1} onChange={update('address1')} className="mt-1" /></div>
                    <div className="sm:col-span-2"><Label>Address Line 2 (Optional)</Label><Input value={form.address2} onChange={update('address2')} className="mt-1" /></div>
                    <div><Label>City</Label><Input required value={form.city} onChange={update('city')} className="mt-1" /></div>
                    <div><Label>Postcode</Label><Input required value={form.postcode} onChange={update('postcode')} className="mt-1" /></div>
                    <div>
                      <Label>Country</Label>
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
              </form>
            )}

            {step === 'payment' && (
              <section className="border rounded-lg p-6 bg-white">
                <h2 className="text-lg font-bold uppercase mb-4">Payment</h2>
                <p className="text-sm text-slate-600 mb-6">Order <span className="font-mono font-bold">{createdOrder?.order_number}</span> created. Complete payment below.</p>

                {paypalConfig?.configured ? (
                  <div>
                    <div ref={paypalRef} className="min-h-[100px]"></div>
                    <p className="text-xs text-slate-500 mt-3 flex items-center gap-1">
                      <Lock className="h-3 w-3" /> Secured by PayPal
                    </p>
                  </div>
                ) : (
                  <div className="border border-amber-200 bg-amber-50 rounded p-4 text-sm text-amber-900">
                    <p className="font-semibold mb-1">PayPal not yet configured.</p>
                    <p>An admin must add PayPal credentials before payments can be taken. The order has been saved as <span className="font-mono">{createdOrder?.order_number}</span> and can be paid later via an invoice.</p>
                    <Button onClick={completeTestOrder} className="mt-4 bg-slate-900 hover:bg-slate-800 text-white">Continue (test mode)</Button>
                  </div>
                )}

                <button onClick={() => setStep('details')} className="mt-6 text-sm text-sky-600 hover:text-sky-700">← Edit details</button>
              </section>
            )}
          </div>

          <div className="border rounded-lg p-6 bg-slate-50 h-fit sticky top-32">
            <h2 className="text-lg font-bold uppercase border-b pb-3">Order Summary</h2>
            <div className="space-y-3 mt-4 max-h-72 overflow-y-auto">
              {items.map(it => (
                <div key={it._key} className="flex gap-3 text-sm">
                  <img src={resolveImage(it.image)} alt={it.name} className="w-14 h-14 bg-white rounded border object-contain p-1 shrink-0" />
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

            {step === 'details' && (
              <Button form="details-form" type="submit" disabled={processing} className="w-full mt-6 bg-sky-500 hover:bg-sky-600 text-white font-bold uppercase tracking-wider h-12">
                {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : `Continue to payment · £${total.toFixed(2)}`}
              </Button>
            )}

            <p className="text-[11px] text-slate-500 text-center mt-3 flex items-center justify-center gap-1">
              <Lock className="h-3 w-3" /> SSL secure checkout
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Checkout;
