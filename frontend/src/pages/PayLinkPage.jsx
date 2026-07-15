import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Orders, Wallid } from '../lib/api';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { Loader2, Lock, CheckCircle2 } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import Layout from '../components/Layout';
import BankTrustBadges from '../components/BankTrustBadges';
import WallidPaymentModal from '../components/WallidPaymentModal';

const PayLinkPage = () => {
  const { orderId } = useParams();
  const { toast } = useToast();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [step, setStep] = useState('address'); // 'address' | 'payment' | 'paid'
  const [processing, setProcessing] = useState(false);
  const [wallidConfig, setWallidConfig] = useState(null);
  const [wallidLoading, setWallidLoading] = useState(false);
  const [wallidPaymentLink, setWallidPaymentLink] = useState(null);
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
          Wallid.config().catch(() => null),
        ]);
        setOrder(o);
        setWallidConfig(cfg);
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

  const payWithWallid = async () => {
    if (!order) return;
    setWallidLoading(true);
    try {
      const res = await Wallid.createPayment(order.id);
      if (!res?.payment_link) throw new Error('No payment link returned');
      setWallidPaymentLink(res.payment_link);
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast({ title: 'Could not start payment', description: detail || err.message, variant: 'destructive' });
    } finally {
      setWallidLoading(false);
    }
  };

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
                {wallidConfig?.configured ? (
                  <div>
                    <p className="text-sm text-slate-700 mb-3">Complete your payment:</p>
                    <Button
                      onClick={payWithWallid}
                      disabled={wallidLoading || processing}
                      className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-bold uppercase tracking-wider text-base"
                      data-testid="paylink-wallid-pay-btn"
                    >
                      {wallidLoading
                        ? <Loader2 className="h-5 w-5 animate-spin" />
                        : <><Lock className="h-4 w-4 mr-2" /> Pay by Bank · £{Number(order.total).toFixed(2)}</>}
                    </Button>
                    <p className="text-xs text-slate-500 mt-2 text-center">
                      Instant secure transfer from your bank · No card details required
                    </p>
                    <BankTrustBadges />
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

      {wallidPaymentLink && order && (
        <WallidPaymentModal
          orderId={order.id}
          orderNumber={order.order_number}
          paymentLink={wallidPaymentLink}
          onClose={() => setWallidPaymentLink(null)}
          onPaid={() => {
            setWallidPaymentLink(null);
            setStep('paid');
            toast({ title: 'Payment successful' });
          }}
          onFailed={(res) => {
            setWallidPaymentLink(null);
            toast({
              title: 'Payment not completed',
              description: `Status: ${res.wallid_status}. You can try again or contact us.`,
              variant: 'destructive',
            });
          }}
        />
      )}
    </Layout>
  );
};

export default PayLinkPage;
