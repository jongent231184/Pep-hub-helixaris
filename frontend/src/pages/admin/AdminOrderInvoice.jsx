import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Orders, Settings as SettingsApi, resolveImage } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { ArrowLeft, Loader2, Printer, Download } from 'lucide-react';

const LOGO_URL = 'https://customer-assets.emergentagent.com/job_ghp-ecommerce-pay/artifacts/0f0tlig3_ghp%20logo.jpg';

const AdminOrderInvoice = () => {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([Orders.get(orderId), SettingsApi.get()])
      .then(([o, s]) => { setOrder(o); setSettings(s); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orderId]);

  if (loading) return <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>;
  if (!order) return <p className="p-6">Invoice not found.</p>;

  const a = order.shipping_address || {};
  const b = order.billing_address || null;
  const billingDiffers = b && (
    b.address1 !== a.address1 ||
    b.postcode !== a.postcode ||
    b.city !== a.city ||
    b.first_name !== a.first_name ||
    b.last_name !== a.last_name
  );
  const billTo = billingDiffers ? b : a;
  const s = settings || {};
  const paid = order.payment_status === 'paid';
  const created = new Date(order.created_at);

  return (
    <div>
      {/* Toolbar - hidden on print */}
      <div className="no-print flex items-center justify-between mb-6 flex-wrap gap-3">
        <Link to={`/admin/orders/${order.id}`} className="text-sm text-sky-600 hover:underline flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to order
        </Link>
        <div className="flex gap-2">
          <Button onClick={() => window.print()} className="bg-slate-900 hover:bg-slate-800 text-white gap-2">
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button onClick={() => window.print()} variant="outline" className="gap-2">
            <Download className="h-4 w-4" /> Save as PDF
          </Button>
        </div>
      </div>

      {/* Invoice - visible on screen and print */}
      <div className="invoice bg-white border rounded-lg p-8 md:p-12 max-w-4xl mx-auto text-slate-900 shadow-sm">
        {/* Header */}
        <div className="flex justify-between items-start pb-6 border-b-2 border-slate-900 gap-6 flex-wrap">
          <div className="flex items-center gap-4">
            <img src={LOGO_URL} alt="" className="h-20 w-20 rounded-lg object-cover" />
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tight">{s.site_name || 'GHP-Health'}</h1>
              <p className="text-xs text-slate-500 mt-1">Premium-grade research peptides</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-3xl font-black uppercase tracking-tight">Invoice</p>
            <p className="font-mono text-sm text-slate-600 mt-1">{order.order_number}</p>
            <p className="text-xs text-slate-500 mt-1">{created.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>

        {/* Billing + Shipping + Order info */}
        <div className={`grid grid-cols-1 ${billingDiffers ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-8 py-6 border-b`}>
          <div>
            <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2">Billed to</p>
            <p className="font-semibold">{billTo.first_name} {billTo.last_name}</p>
            <p className="text-sm">{billTo.address1}</p>
            {billTo.address2 && <p className="text-sm">{billTo.address2}</p>}
            <p className="text-sm">{billTo.city}, {billTo.postcode}</p>
            <p className="text-sm">{billTo.country}</p>
            <p className="text-sm mt-2 text-slate-600">{a.email}</p>
            {(billTo.phone || a.phone) && <p className="text-sm text-slate-600">{billTo.phone || a.phone}</p>}
          </div>
          {billingDiffers && (
            <div>
              <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2">Shipped to</p>
              <p className="font-semibold">{a.first_name} {a.last_name}</p>
              <p className="text-sm">{a.address1}</p>
              {a.address2 && <p className="text-sm">{a.address2}</p>}
              <p className="text-sm">{a.city}, {a.postcode}</p>
              <p className="text-sm">{a.country}</p>
              {a.phone && <p className="text-sm mt-2 text-slate-600">{a.phone}</p>}
            </div>
          )}
          <div className="md:text-right">
            <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2">Details</p>
            <p className="text-sm"><span className="text-slate-500">Order number:</span> <span className="font-mono">{order.order_number}</span></p>
            <p className="text-sm"><span className="text-slate-500">Order date:</span> {created.toLocaleString('en-GB')}</p>
            <p className="text-sm"><span className="text-slate-500">Payment method:</span> PayPal</p>
            <p className="text-sm"><span className="text-slate-500">Payment status:</span> <span className={`font-bold uppercase ${paid ? 'text-emerald-700' : 'text-amber-700'}`}>{order.payment_status}</span></p>
            <p className="text-sm"><span className="text-slate-500">Fulfilment:</span> <span className="capitalize font-semibold">{order.status}</span></p>
            {order.payment_id && <p className="text-[10px] font-mono text-slate-500 mt-1 break-all">PayPal ID: {order.payment_id}</p>}
          </div>
        </div>

        {/* Items table */}
        <table className="w-full text-sm mt-6">
          <thead>
            <tr className="border-b-2 border-slate-900">
              <th className="text-left py-2 uppercase text-[10px] tracking-widest">Item</th>
              <th className="text-right py-2 uppercase text-[10px] tracking-widest w-16">Qty</th>
              <th className="text-right py-2 uppercase text-[10px] tracking-widest w-24">Unit</th>
              <th className="text-right py-2 uppercase text-[10px] tracking-widest w-24">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {order.items.map((it, idx) => (
              <tr key={idx}>
                <td className="py-3">
                  <div className="flex items-center gap-3">
                    {it.image && <img src={resolveImage(it.image)} alt="" className="w-10 h-10 object-contain bg-slate-50 rounded border invoice-thumb" />}
                    <div>
                      <p className="font-semibold">{it.name}</p>
                      {it.option && <p className="text-xs text-slate-500">{it.option}</p>}
                    </div>
                  </div>
                </td>
                <td className="text-right">{it.qty}</td>
                <td className="text-right">£{Number(it.price).toFixed(2)}</td>
                <td className="text-right font-semibold">£{(it.price * it.qty).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300">
              <td colSpan={3} className="text-right py-2 text-slate-600">Subtotal</td>
              <td className="text-right py-2">£{Number(order.subtotal).toFixed(2)}</td>
            </tr>
            {Number(order.discount) > 0 && (
              <tr>
                <td colSpan={3} className="text-right py-1 text-slate-600">
                  Discount{order.promo_code ? ` (${order.promo_code})` : ''}
                </td>
                <td className="text-right py-1 text-emerald-700">-£{Number(order.discount).toFixed(2)}</td>
              </tr>
            )}
            <tr>
              <td colSpan={3} className="text-right py-1 text-slate-600">Shipping</td>
              <td className="text-right py-1">{order.shipping === 0 ? 'FREE' : `£${Number(order.shipping).toFixed(2)}`}</td>
            </tr>
            <tr className="border-t-2 border-slate-900 font-bold text-base">
              <td colSpan={3} className="text-right py-2 uppercase">Total {order.currency}</td>
              <td className="text-right py-2">£{Number(order.total).toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>

        {order.notes && (
          <div className="mt-6 pt-4 border-t">
            <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">Order notes</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{order.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-10 pt-6 border-t text-center text-xs text-slate-500">
          <p className="font-semibold">Thank you for your order</p>
          <p className="mt-1">
            {s.site_name || 'GHP-Health'}
            {s.contact_email && <> · <a href={`mailto:${s.contact_email}`}>{s.contact_email}</a></>}
          </p>
          <p className="mt-1 italic">All products supplied for laboratory research use only. Not for human consumption.</p>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 15mm; }
          body { background: white !important; }
          .no-print, header, aside, footer, nav { display: none !important; }
          .invoice { border: none !important; box-shadow: none !important; padding: 0 !important; margin: 0 !important; max-width: 100% !important; }
          main { padding: 0 !important; }
          .invoice-thumb { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
};

export default AdminOrderInvoice;
