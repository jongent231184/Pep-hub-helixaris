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
import { Checkbox } from '../components/ui/checkbox';
import BankTrustBadges from '../components/BankTrustBadges';
import WallidPaymentModal from '../components/WallidPaymentModal';
import { useAuth } from '../context/AuthContext';
import { Orders, Promos, Addresses, Wallid, resolveImage } from '../lib/api';

const Checkout = () => {
  const { items, subtotal, clearCart } = useCart();
  const { settings } = useStore();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState('details'); // 'details' | 'payment'
  const [processing, setProcessing] = useState(false);
  const [wallidConfig, setWallidConfig] = useState(null);
  const [wallidLoading, setWallidLoading] = useState(false);
  const [wallidPaymentLink, setWallidPaymentLink] = useState(null); // opens modal when set
  const [createdOrder, setCreatedOrder] = useState(null);
  const [form, setForm] = useState({
    email: '', firstName: '', lastName: '', phone: '',
    address1: '', address2: '', city: '', postcode: '', country: 'United Kingdom',
  });
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);
  const [billing, setBilling] = useState({
    firstName: '', lastName: '', phone: '',
    address1: '', address2: '', city: '', postcode: '', country: 'United Kingdom',
  });

  // Saved addresses for logged-in users
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedShippingId, setSelectedShippingId] = useState(''); // '' = new/manual
  const [selectedBillingId, setSelectedBillingId] = useState('');
  const [saveShippingToBook, setSaveShippingToBook] = useState(false);
  const [saveBillingToBook, setSaveBillingToBook] = useState(false);

  const applyAddress = (target, addr) => {
    const mapped = {
      firstName: addr.first_name || '', lastName: addr.last_name || '',
      phone: addr.phone || '',
      address1: addr.address1 || '', address2: addr.address2 || '',
      city: addr.city || '', postcode: addr.postcode || '',
      country: addr.country || 'United Kingdom',
    };
    if (target === 'shipping') {
      setForm((f) => ({ ...f, ...mapped }));
    } else {
      setBilling((b) => ({ ...b, ...mapped }));
    }
  };

  // Preload user's email + saved addresses; auto-populate the default one
  useEffect(() => {
    if (!user) return;
    if (user.email) setForm((f) => (f.email ? f : { ...f, email: user.email }));
    Addresses.mine().then((list) => {
      setSavedAddresses(list);
      const def = list.find((a) => a.is_default) || list[0];
      if (def) {
        setSelectedShippingId(def.id);
        applyAddress('shipping', def);
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const update = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const updateBilling = (k) => (e) => setBilling(b => ({ ...b, [k]: e.target.value }));

  const onSelectSavedShipping = (val) => {
    setSelectedShippingId(val === '__manual__' ? '' : val);
    if (val === '__manual__' || !val) return;
    const a = savedAddresses.find((x) => x.id === val);
    if (a) applyAddress('shipping', a);
  };
  const onSelectSavedBilling = (val) => {
    setSelectedBillingId(val === '__manual__' ? '' : val);
    if (val === '__manual__' || !val) return;
    const a = savedAddresses.find((x) => x.id === val);
    if (a) applyAddress('billing', a);
  };

  const flat = settings?.flat_shipping ?? 4.99;
  const threshold = settings?.free_shipping_threshold ?? 50;
  const baseShipping = subtotal >= threshold ? 0 : flat;

  // Promo state
  const [promoInput, setPromoInput] = useState('');
  const [applyingPromo, setApplyingPromo] = useState(false);
  const [promo, setPromo] = useState(null); // { code, type, discount, shipping_discount }

  const discount = promo ? Number(promo.discount || 0) : 0;
  const shipping = promo ? Math.max(0, baseShipping - Number(promo.shipping_discount || 0)) : baseShipping;
  const total = Math.max(0, subtotal - discount) + shipping;

  // Auto-remove promo if basket changes below the required minimum
  useEffect(() => {
    if (!promo) return;
    // Re-validate silently when the basket subtotal changes
    Promos.validate(promo.code, subtotal, baseShipping)
      .then(res => {
        if (!res.valid) {
          setPromo(null);
          toast({ title: 'Promo removed', description: res.message || 'No longer valid for your basket' });
        } else {
          setPromo(res);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal]);

  const applyPromo = async () => {
    const code = (promoInput || '').trim();
    if (!code) return;
    setApplyingPromo(true);
    try {
      const res = await Promos.validate(code, subtotal, baseShipping);
      if (!res.valid) {
        toast({ title: 'Invalid code', description: res.message || 'This promo code cannot be used.', variant: 'destructive' });
        return;
      }
      setPromo(res);
      setPromoInput('');
      toast({ title: 'Promo applied', description: res.code });
    } catch (err) {
      toast({ title: 'Could not apply promo', description: String(err.response?.data?.detail || err.message), variant: 'destructive' });
    } finally {
      setApplyingPromo(false);
    }
  };

  const removePromo = () => setPromo(null);

  useEffect(() => {
    Wallid.config().then(setWallidConfig).catch(() => setWallidConfig({ configured: false }));
  }, []);

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
        billing_address: billingSameAsShipping ? undefined : {
          first_name: billing.firstName,
          last_name: billing.lastName,
          email: form.email, // billing shares customer email
          phone: billing.phone,
          address1: billing.address1,
          address2: billing.address2,
          city: billing.city,
          postcode: billing.postcode,
          country: billing.country,
        },
        subtotal, shipping, total,
        promo_code: promo ? promo.code : undefined,
      };
      const order = await Orders.create(orderPayload);

      // Save address(es) to the user's account when opted in (best-effort).
      if (user) {
        try {
          if (saveShippingToBook && !selectedShippingId) {
            await Addresses.create({
              label: 'Home',
              first_name: form.firstName, last_name: form.lastName, phone: form.phone,
              address1: form.address1, address2: form.address2 || '',
              city: form.city, postcode: form.postcode, country: form.country,
              is_default: savedAddresses.length === 0,
            });
          }
          if (!billingSameAsShipping && saveBillingToBook && !selectedBillingId) {
            await Addresses.create({
              label: 'Billing',
              first_name: billing.firstName, last_name: billing.lastName, phone: billing.phone,
              address1: billing.address1, address2: billing.address2 || '',
              city: billing.city, postcode: billing.postcode, country: billing.country,
              is_default: false,
            });
          }
        } catch (_) { /* silent — order already created */ }
      }

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

  // Wallid Pay-by-Bank: open hosted checkout inside an iframe modal
  const payWithWallid = async () => {
    if (!createdOrder) return;
    setWallidLoading(true);
    try {
      const res = await Wallid.createPayment(createdOrder.id);
      if (!res?.payment_link) throw new Error('No payment link returned');
      setWallidPaymentLink(res.payment_link);
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast({ title: 'Could not start payment', description: detail || err.message, variant: 'destructive' });
    } finally {
      setWallidLoading(false);
    }
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
                  {user && savedAddresses.length > 0 && (
                    <div className="mb-5 pb-5 border-b" data-testid="saved-shipping-picker">
                      <Label className="text-xs uppercase tracking-wider text-slate-500">Use a saved address</Label>
                      <Select value={selectedShippingId || '__manual__'} onValueChange={onSelectSavedShipping}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Enter a new address" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__manual__">Enter a new address</SelectItem>
                          {savedAddresses.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {(a.label || a.address1)}{a.is_default ? ' · Default' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
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
                  {user && !selectedShippingId && (
                    <label className="flex items-center gap-2 mt-5 text-sm cursor-pointer select-none">
                      <Checkbox
                        checked={saveShippingToBook}
                        onCheckedChange={(v) => setSaveShippingToBook(v === true)}
                        data-testid="save-shipping-checkbox"
                      />
                      <span>Save this address to my account for next time</span>
                    </label>
                  )}
                </section>

                <section className="border rounded-lg p-6 bg-white">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <h2 className="text-lg font-bold uppercase">Billing Address</h2>
                    <label className="flex items-center gap-2 text-sm cursor-pointer select-none" data-testid="billing-same-toggle-label">
                      <Checkbox
                        checked={billingSameAsShipping}
                        onCheckedChange={(v) => setBillingSameAsShipping(v === true)}
                        data-testid="billing-same-checkbox"
                      />
                      <span className="text-slate-700">Same as shipping address</span>
                    </label>
                  </div>
                  {billingSameAsShipping ? (
                    <p className="text-sm text-slate-500">Billing address matches the shipping address above.</p>
                  ) : (
                    <>
                      {user && savedAddresses.length > 0 && (
                        <div className="mb-5 pb-5 border-b" data-testid="saved-billing-picker">
                          <Label className="text-xs uppercase tracking-wider text-slate-500">Use a saved address</Label>
                          <Select value={selectedBillingId || '__manual__'} onValueChange={onSelectSavedBilling}>
                            <SelectTrigger className="mt-1"><SelectValue placeholder="Enter a new address" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__manual__">Enter a new address</SelectItem>
                              {savedAddresses.map((a) => (
                                <SelectItem key={a.id} value={a.id}>
                                  {(a.label || a.address1)}{a.is_default ? ' · Default' : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div className="grid sm:grid-cols-2 gap-4" data-testid="billing-address-form">
                      <div><Label>First Name</Label><Input required value={billing.firstName} onChange={updateBilling('firstName')} className="mt-1" /></div>
                      <div><Label>Last Name</Label><Input required value={billing.lastName} onChange={updateBilling('lastName')} className="mt-1" /></div>
                      <div className="sm:col-span-2"><Label>Address Line 1</Label><Input required value={billing.address1} onChange={updateBilling('address1')} className="mt-1" /></div>
                      <div className="sm:col-span-2"><Label>Address Line 2 (Optional)</Label><Input value={billing.address2} onChange={updateBilling('address2')} className="mt-1" /></div>
                      <div><Label>City</Label><Input required value={billing.city} onChange={updateBilling('city')} className="mt-1" /></div>
                      <div><Label>Postcode</Label><Input required value={billing.postcode} onChange={updateBilling('postcode')} className="mt-1" /></div>
                      <div>
                        <Label>Country</Label>
                        <Select value={billing.country} onValueChange={v => setBilling(b => ({ ...b, country: v }))}>
                          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="United Kingdom">United Kingdom</SelectItem>
                            <SelectItem value="Ireland">Ireland</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div><Label>Phone (Optional)</Label><Input value={billing.phone} onChange={updateBilling('phone')} className="mt-1" /></div>
                    </div>
                    {user && !selectedBillingId && (
                      <label className="flex items-center gap-2 mt-5 text-sm cursor-pointer select-none">
                        <Checkbox
                          checked={saveBillingToBook}
                          onCheckedChange={(v) => setSaveBillingToBook(v === true)}
                          data-testid="save-billing-checkbox"
                        />
                        <span>Save this billing address to my account for next time</span>
                      </label>
                    )}
                    </>
                  )}
                </section>
              </form>
            )}

            {step === 'payment' && (
              <section className="border rounded-lg p-6 bg-white">
                <h2 className="text-lg font-bold uppercase mb-4">Payment</h2>
                <p className="text-sm text-slate-600 mb-6">Order <span className="font-mono font-bold">{createdOrder?.order_number}</span> created. Complete payment below.</p>

                {wallidConfig?.configured ? (
                  <div data-testid="wallid-section">
                    <Button
                      onClick={payWithWallid}
                      disabled={wallidLoading}
                      className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-bold uppercase tracking-wider text-base"
                      data-testid="wallid-pay-btn"
                    >
                      {wallidLoading
                        ? <Loader2 className="h-5 w-5 animate-spin" />
                        : <><Lock className="h-4 w-4 mr-2" /> Pay by Bank · £{Number(createdOrder?.total || 0).toFixed(2)}</>}
                    </Button>
                    <p className="text-xs text-slate-500 mt-2 text-center">
                      Instant secure transfer from your bank · No card details required
                    </p>
                    <BankTrustBadges />
                  </div>
                ) : (
                  <div className="border border-amber-200 bg-amber-50 rounded p-4 text-sm text-amber-900">
                    <p className="font-semibold mb-1">Payment temporarily unavailable.</p>
                    <p>Your order <span className="font-mono">{createdOrder?.order_number}</span> has been saved. Please contact us at <a href={`mailto:${settings?.contact_email || 'GHP-Health@outlook.com'}`} className="underline">{settings?.contact_email || 'GHP-Health@outlook.com'}</a> for an invoice link.</p>
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
              {discount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Discount ({promo.code})</span>
                  <span>-£{discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Shipping{promo?.shipping_discount > 0 && ' (free)'}</span>
                <span>{shipping === 0 ? 'FREE' : `£${shipping.toFixed(2)}`}</span>
              </div>
              <div className="flex justify-between font-bold text-base pt-2 border-t"><span>Total</span><span>£{total.toFixed(2)}</span></div>
            </div>

            {/* Promo code */}
            <div className="mt-4 border-t pt-4">
              {promo ? (
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded px-3 py-2 text-sm">
                  <div>
                    <p className="font-mono font-bold text-emerald-800">{promo.code}</p>
                    <p className="text-[11px] text-emerald-700">
                      {promo.type === 'percent' && `${promo.value}% off`}
                      {promo.type === 'fixed' && `£${Number(promo.value).toFixed(2)} off`}
                      {promo.type === 'free_shipping' && 'Free shipping'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={removePromo}
                    data-testid="remove-promo-btn"
                    className="text-xs text-slate-500 hover:text-red-600 underline"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    value={promoInput}
                    onChange={e => setPromoInput(e.target.value.toUpperCase())}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyPromo(); } }}
                    placeholder="Promo code"
                    className="h-10 font-mono uppercase"
                    data-testid="promo-code-input"
                  />
                  <Button
                    type="button"
                    onClick={applyPromo}
                    disabled={applyingPromo || !promoInput.trim()}
                    variant="outline"
                    data-testid="apply-promo-btn"
                    className="h-10 shrink-0"
                  >
                    {applyingPromo ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
                  </Button>
                </div>
              )}
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

      {wallidPaymentLink && createdOrder && (
        <WallidPaymentModal
          orderId={createdOrder.id}
          orderNumber={createdOrder.order_number}
          paymentLink={wallidPaymentLink}
          onClose={() => setWallidPaymentLink(null)}
          onPaid={() => {
            clearCart();
            toast({ title: 'Payment successful' });
            navigate(`/order-confirmation/${createdOrder.order_number}`);
          }}
          onFailed={(res) => {
            setWallidPaymentLink(null);
            toast({
              title: 'Payment not completed',
              description: `Status: ${res.wallid_status}. You can try again or contact support.`,
              variant: 'destructive',
            });
          }}
        />
      )}
    </Layout>
  );
};

export default Checkout;
