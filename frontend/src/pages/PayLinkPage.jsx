import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Orders, PayPal } from '../lib/api';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { Loader2, Lock, CheckCircle2 } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import Layout from '../components/Layout';

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

const PayLinkPage = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const paypalRef = useRef(null);

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [step, setStep] = useState('address'); // 'address' | 'payment' | 'paid'
  const [processing, setProcessing] = useState(false);
  const [paypalConfig, setPaypalConfig] = useState(null);
  const [form, setForm] = useState({
    email: '', firstName: '', lastName: '', phone: '',
    address1: '', address2: '', city: '', postcode: '', country: 'United Kingdom',
  });

  const update = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    (async () => {
      try {
        const [o, cfg] = await Promise.all([
          Orders.getPaylink(orderId),
          PayPal.config().catch(() => null),
        ]);
        setOrder(o);
        setPaypalConfig(cfg);
        // Pre-fill from admin's hint
        setForm(f => ({
          ...f,
          firstName: o.shipping_address?.first_name || '',
          lastName: o.shipping_address?.last_name || '',
          email: o.shipping_address?.email && o.shipping_address.email !== 'pending@ghp-health.com' ? o.shipping_address.email : '',
          phone: o.shipping_address?.phone || '',
          address1: o.shipping_address?.address1 || '',
          address2: o.shipping_address?.address2 || '',
          city: o.shipping_address?.city || '',
          postcode: o.shipping_address?.postcode || '',
          country: o.shipping_address?.country || 'United Kingdom',
        }));
        if (o.payment_status === 'paid') setStep('paid');
      } catch (err) {
        setError(err.response?.status === 404 ? 'Pay link not found' : (err.response?.data?.detail || err.message));
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  // Mount PayPal buttons when in payment step
  useEffect(() => {
    if (step !== 'payment' || !paypalConfig?.client_id || !order) return;
    let cancelled = false;
    (async () => {
      try {
        const paypal = await loadPayPalScript(paypalConfig.client_id, paypalConfig.currency || 'GBP');
        if (cancelled || !paypalRef.current) return;
        paypalRef.current.innerHTML = '';
        paypal.Buttons({
          style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal' },
          createOrder: async () => {
            try {
              const { paypal_order_id } = await PayPal.createOrder(order.id);
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
              const res = await PayPal.captureOrder(order.id, data.orderID);
              if (res.payment_status === 'paid') {
                toast({ title: 'Payment successful' });
                navigate(`/order-confirmation/${order.order_number}`);
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
          },
        }).render(paypalRef.current);
      } catch (e) {
        toast({ title: 'Failed to load PayPal', description: String(e), variant: 'destructive' });
      }
    })();
    return () => { cancelled = true; };
  }, [step, order, paypalConfig, navigate, toast]);

  const submitAddress = async (e) => {
    e.preventDefault();
    setProcessing(true);
    try {
      const updated = await Orders.setPaylinkAddress(orderId, {
        first_name: form.firstName,
        last_name: form.lastName,
        email: form.email,
        phone: form.phone,
        address1: form.address1,
        address2: form.address2,
        city: form.city,
        postcode: form.postcode,
        country: form.country,
      });
      setOrder(updated);
      setStep('payment');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast({ title: 'Could not save details', description: detail ? JSON.stringify(detail) : err.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return <Layout><div className="max-w-3xl mx-auto px-4 py-20 grid place-items-center"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div></Layout>;
  }
  if (error) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <h1 className="text-2xl font-bold mb-4">{error}</h1>
          <p className="text-slate-600">Check the link with the sender or contact GHP-Health.</p>
        </div>
      </Layout>
    );
  }
  if (step === 'paid' || order.payment_status === 'paid') {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <CheckCircle2 className="h-14 w-14 mx-auto text-emerald-500 mb-4" />
          <h1 className="text-2xl font-bold mb-2">This order has already been paid</h1>
          <p className="text-slate-600">Order <span className="font-mono">{order.order_number}</span> is complete. Thank you.</p>
        </div>
      </Layout>
    );
  }

  const OrderSummary = () => (
    <aside className="bg-slate-50 border rounded-lg p-5 h-fit sticky top-4">
      <h2 className="text-sm font-bold uppercase tracking-wide mb-3">Your order</h2>
      <div className="space-y-1 text-sm mb-4">
        {order.items.map((it, i) => (
          <div key={i} className="flex justify-between">
            <span>{it.qty}× {it.name}{it.option ? ` (${it.option})` : ''}</span>
            <span>£{(it.qty * Number(it.price)).toFixed(2)}</span>
          </div>
        ))}
      </div>
      <div className="border-t pt-3 space-y-1 text-sm">
        <div className="flex justify-between"><span>Subtotal</span><span>£{Number(order.subtotal).toFixed(2)}</span></div>
        {Number(order.discount) > 0 && (
          <div className="flex justify-between text-emerald-700">
            <span>Discount ({order.promo_code})</span>
            <span>-£{Number(order.discount).toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between"><span>Shipping</span><span>{order.shipping === 0 ? 'FREE' : `£${Number(order.shipping).toFixed(2)}`}</span></div>
        <div className="flex justify-between font-bold text-base pt-2 border-t"><span>Total</span><span>£{Number(order.total).toFixed(2)}</span></div>
      </div>
      <p className="text-xs text-slate-500 mt-4 font-mono">Order: {order.order_number}</p>
    </aside>
  );

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-10">
        <h1 className="text-2xl md:text-4xl font-black uppercase tracking-tight mb-8">
          {step === 'address' ? 'Complete your order' : 'Pay now'}
        </h1>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-2">
            {step === 'address' ? (
              <form onSubmit={submitAddress} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><Label>First name</Label><Input required value={form.firstName} onChange={update('firstName')} className="mt-1" data-testid="pay-first-name" /></div>
                  <div><Label>Last name</Label><Input required value={form.lastName} onChange={update('lastName')} className="mt-1" data-testid="pay-last-name" /></div>
                </div>
                <div><Label>Email</Label><Input type="email" required value={form.email} onChange={update('email')} className="mt-1" data-testid="pay-email" /></div>
                <div><Label>Phone</Label><Input required value={form.phone} onChange={update('phone')} className="mt-1" data-testid="pay-phone" /></div>
                <div><Label>Address line 1</Label><Input required value={form.address1} onChange={update('address1')} className="mt-1" data-testid="pay-address1" /></div>
                <div><Label>Address line 2 (optional)</Label><Input value={form.address2} onChange={update('address2')} className="mt-1" /></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><Label>City</Label><Input required value={form.city} onChange={update('city')} className="mt-1" data-testid="pay-city" /></div>
                  <div><Label>Postcode</Label><Input required value={form.postcode} onChange={update('postcode')} className="mt-1" data-testid="pay-postcode" /></div>
                </div>
                <div><Label>Country</Label><Input required value={form.country} onChange={update('country')} className="mt-1" /></div>
                <Button
                  type="submit"
                  disabled={processing}
                  className="w-full bg-sky-500 hover:bg-sky-600 text-white h-12 gap-2"
                  data-testid="pay-continue-btn"
                >
                  {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                  Continue to payment · £{Number(order.total).toFixed(2)}
                </Button>
              </form>
            ) : (
              <div className="space-y-6">
                <div className="border rounded-lg p-5">
                  <p className="text-sm text-slate-700 mb-1">Shipping to:</p>
                  <p className="font-semibold">{order.shipping_address.first_name} {order.shipping_address.last_name}</p>
                  <p className="text-sm text-slate-600">{order.shipping_address.address1}{order.shipping_address.address2 ? `, ${order.shipping_address.address2}` : ''}</p>
                  <p className="text-sm text-slate-600">{order.shipping_address.city}, {order.shipping_address.postcode}, {order.shipping_address.country}</p>
                  <button
                    type="button"
                    onClick={() => setStep('address')}
                    className="text-xs text-sky-600 underline mt-2"
                  >
                    Edit details
                  </button>
                </div>
                {paypalConfig?.client_id ? (
                  <div>
                    <p className="text-sm text-slate-700 mb-3">Choose a payment method:</p>
                    <div ref={paypalRef} className="min-h-[120px]" />
                    {processing && (
                      <p className="text-xs text-slate-500 mt-2 flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" /> Confirming payment…
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="border border-amber-200 bg-amber-50 rounded p-4 text-sm text-amber-800">
                    Payment is not currently configured. Please contact GHP-Health to complete this order.
                  </div>
                )}
              </div>
            )}
          </div>
          <OrderSummary />
        </div>
      </div>
    </Layout>
  );
};

export default PayLinkPage;
