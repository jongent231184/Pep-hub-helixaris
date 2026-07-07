import React, { useEffect, useState } from 'react';
import { Orders, Products } from '../../lib/api';
import { Loader2, Plus, X, Copy, Check, Link as LinkIcon } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { useToast } from '../../hooks/use-toast';

const CreatePaylinkModal = ({ open, onClose, onCreated }) => {
  const { toast } = useToast();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [rows, setRows] = useState([{ product_id: '', qty: 1, option: '', name: '', price: '' }]);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [createdOrder, setCreatedOrder] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Products.listAll()
      .then((all) => setProducts(all.filter(p => p.visible !== false).sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
    // reset form when re-opened
    setRows([{ product_id: '', qty: 1, option: '', name: '', price: '' }]);
    setCustomerName(''); setCustomerEmail(''); setNotes(''); setPromoCode('');
    setCreatedOrder(null); setCopied(false);
  }, [open]);

  if (!open) return null;

  const productMap = Object.fromEntries(products.map(p => [p.id, p]));
  const addRow = () => setRows(r => [...r, { product_id: '', qty: 1, option: '', name: '', price: '' }]);
  const updateRow = (i, patch) => setRows(r => r.map((row, idx) => idx === i ? { ...row, ...patch } : row));
  const removeRow = (i) => setRows(r => r.filter((_, idx) => idx !== i));

  const submit = async () => {
    const items = rows
      .filter(r => r.product_id === '__custom__' || r.product_id)
      .map(r => (r.product_id === '__custom__'
        ? {
            product_id: null,
            name: (r.name || '').trim(),
            price: Number(r.price) || 0,
            qty: Math.max(1, Number(r.qty) || 1),
          }
        : {
            product_id: r.product_id,
            qty: Math.max(1, Number(r.qty) || 1),
            option: r.option || null,
          }));
    if (items.length === 0) {
      toast({ title: 'Add at least one item', variant: 'destructive' });
      return;
    }
    // Frontend guardrails for custom lines
    for (const it of items) {
      if (it.product_id === null) {
        if (!it.name) {
          toast({ title: 'Please describe the "Other" line item', variant: 'destructive' });
          return;
        }
        if (!it.price || it.price <= 0) {
          toast({ title: 'Please enter a price for the "Other" line item', variant: 'destructive' });
          return;
        }
      }
    }
    setCreating(true);
    try {
      const order = await Orders.createPaylink({
        items,
        customer_name: customerName || undefined,
        customer_email: customerEmail || undefined,
        notes: notes || '',
        promo_code: promoCode ? promoCode.trim().toUpperCase() : undefined,
      });
      setCreatedOrder(order);
      onCreated?.(order);
    } catch (err) {
      // FastAPI validation errors come back as an array of {msg, loc}. Flatten for display.
      const detail = err.response?.data?.detail;
      let description;
      if (Array.isArray(detail)) {
        description = detail.map(d => (d.loc?.slice(-1)[0] ? `${d.loc.slice(-1)[0]}: ` : '') + d.msg).join(' • ');
      } else if (typeof detail === 'string') {
        description = detail;
      } else {
        description = err.message;
      }
      toast({ title: 'Failed to create pay link', description, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const payUrl = createdOrder ? `${window.location.origin}/pay/${createdOrder.id}` : '';

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(payUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Copy failed', description: 'Select and copy manually', variant: 'destructive' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <LinkIcon className="h-5 w-5 text-sky-500" />
            {createdOrder ? 'Pay link ready' : 'Create pay link'}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8"><X className="h-4 w-4" /></Button>
        </div>

        {createdOrder ? (
          <div className="p-6 space-y-4">
            <div className="text-sm text-slate-600">
              Order <strong className="font-mono">{createdOrder.order_number}</strong> created. Share the link below with your customer.
            </div>
            <div className="flex gap-2">
              <Input
                readOnly
                value={payUrl}
                onFocus={e => e.target.select()}
                data-testid="paylink-url"
                className="font-mono text-xs"
              />
              <Button onClick={copyLink} className="gap-2 shrink-0" data-testid="copy-paylink-btn">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <div className="border rounded p-4 text-sm space-y-1 bg-slate-50">
              <p className="font-semibold text-slate-800 mb-2">Order summary</p>
              {createdOrder.items.map((it, i) => (
                <div key={i} className="flex justify-between">
                  <span>{it.qty}× {it.name}{it.option ? ` (${it.option})` : ''}</span>
                  <span>£{(it.qty * Number(it.price)).toFixed(2)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t pt-1 mt-2">
                <span>Subtotal</span><span>£{Number(createdOrder.subtotal).toFixed(2)}</span>
              </div>
              {Number(createdOrder.discount) > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Discount ({createdOrder.promo_code})</span>
                  <span>-£{Number(createdOrder.discount).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Shipping</span><span>{createdOrder.shipping === 0 ? 'FREE' : `£${Number(createdOrder.shipping).toFixed(2)}`}</span>
              </div>
              <div className="flex justify-between font-bold pt-1 border-t">
                <span>Total</span><span>£{Number(createdOrder.total).toFixed(2)}</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>Close</Button>
              <Button onClick={() => { setCreatedOrder(null); }} className="bg-sky-500 hover:bg-sky-600 text-white">Create another</Button>
            </div>
          </div>
        ) : loading ? (
          <div className="p-10 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-sky-500" /></div>
        ) : (
          <div className="p-5 space-y-4">
            {/* Customer */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Customer name (optional)</Label>
                <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Jane Doe" className="mt-1" />
              </div>
              <div>
                <Label>Customer email (optional)</Label>
                <Input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="jane@example.com" className="mt-1" />
              </div>
            </div>

            {/* Items */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <Label>Items</Label>
                <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-1 h-8" data-testid="add-paylink-item-btn">
                  <Plus className="h-3.5 w-3.5" /> Add item
                </Button>
              </div>
              <div className="space-y-2">
                {rows.map((row, i) => {
                  const isCustom = row.product_id === '__custom__';
                  const prod = productMap[row.product_id];
                  const variants = prod?.variants || [];
                  const legacyOptions = prod?.options || [];
                  const optionList = variants.length > 0
                    ? variants.map(v => ({ label: v.label, price: Number(v.price || 0) }))
                    : legacyOptions.map(l => ({ label: l, price: Number(prod?.price || 0) }));
                  return (
                    <div key={i} className="space-y-2 border-l-2 border-slate-100 pl-3">
                      <div className="grid grid-cols-[1fr,120px,90px,40px] gap-2 items-start">
                        <Select value={row.product_id} onValueChange={v => updateRow(i, { product_id: v, option: '', name: '', price: '' })}>
                          <SelectTrigger data-testid={`paylink-product-${i}`}><SelectValue placeholder="Choose product..." /></SelectTrigger>
                          <SelectContent className="max-h-72">
                            <SelectItem value="__custom__" data-testid="paylink-custom-option">
                              <span className="font-semibold text-sky-700">Other (custom line)</span>
                            </SelectItem>
                            {products.map(p => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name} <span className="text-slate-400 text-xs">({p.category})</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {isCustom ? (
                          <div className="text-xs text-slate-500 flex items-center px-2 h-10 italic">custom</div>
                        ) : optionList.length > 0 ? (
                          <Select value={row.option || ''} onValueChange={v => updateRow(i, { option: v })}>
                            <SelectTrigger><SelectValue placeholder="Option" /></SelectTrigger>
                            <SelectContent>
                              {optionList.map(o => (
                                <SelectItem key={o.label} value={o.label}>
                                  {o.label}{o.price > 0 ? ` — £${o.price.toFixed(2)}` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="text-xs text-slate-400 flex items-center px-2 h-10">no options</div>
                        )}
                        <Input
                          type="number"
                          min="1"
                          value={row.qty}
                          onChange={e => updateRow(i, { qty: e.target.value })}
                          className="h-10"
                          data-testid={`paylink-qty-${i}`}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeRow(i)}
                          disabled={rows.length === 1}
                          className="text-red-600 h-10 w-10"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      {isCustom && (
                        <div className="grid grid-cols-[1fr,140px] gap-2 items-start pl-1">
                          <Input
                            value={row.name}
                            onChange={e => updateRow(i, { name: e.target.value })}
                            placeholder="Description (e.g. Wholesale — 50× BPC-157 5mg)"
                            className="text-sm"
                            data-testid={`paylink-custom-name-${i}`}
                          />
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.price}
                            onChange={e => updateRow(i, { price: e.target.value })}
                            placeholder="Price £"
                            className="text-sm"
                            data-testid={`paylink-custom-price-${i}`}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Promo code (optional)</Label>
                <Input value={promoCode} onChange={e => setPromoCode(e.target.value.toUpperCase())} placeholder="LAUNCH10" className="mt-1 font-mono uppercase" />
              </div>
              <div>
                <Label>Notes (optional, internal only)</Label>
                <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Wholesale customer" className="mt-1" />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button
                onClick={submit}
                disabled={creating}
                className="bg-sky-500 hover:bg-sky-600 text-white gap-2"
                data-testid="create-paylink-submit-btn"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
                Generate pay link
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreatePaylinkModal;
