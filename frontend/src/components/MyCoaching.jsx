import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Coaches } from '../lib/api';
import { HeartPulse, Package, ShoppingCart, Loader2, Info, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCart } from '../context/CartContext';

const AREA_LABEL = { weightloss: 'Weight loss', peptide_info: 'Peptide Information', dosage_guide: 'Dosage Guide', how_to_guide: 'How-to Guide' };

// Vial calculator — mirrors backend logic
const UNIT_TO_MG = { mg: 1, mcg: 0.001, IU: null, clicks: null };
const computeVials = (it, weeks) => {
  const days = (it.freq_days || []).length;
  const dose = it.dose_amount;
  const unit = it.dose_unit;
  const dosesPerDay = it.freq_time === 'AM+PM' ? 2 : 1;
  const factor = UNIT_TO_MG[unit];
  if (!dose || factor == null || !days || !weeks) return null;
  const weekly_mg = dose * factor * days * dosesPerDay;
  const total_mg = weekly_mg * weeks;
  const vs = it.vial_strength_mg;
  const vials = vs && vs > 0 ? Math.ceil(total_mg / vs) : null;
  return { weekly_mg: +weekly_mg.toFixed(3), total_mg: +total_mg.toFixed(3), vials, vs };
};

const MyCoaching = () => {
  const [proto, setProto] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);

  const load = () => {
    setLoading(true);
    Coaches.myProtocol()
      .then(setProto)
      .catch(() => setProto(null))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const toggle = async (entry, done) => {
    setSaving(entry.id);
    try {
      await Coaches.toggleEntry(entry.id, done);
      setProto(p => p ? { ...p, calendar: p.calendar.map(e => e.id === entry.id ? { ...e, done } : e) } : p);
    } catch (_) { /* silent */ } finally {
      setSaving(null);
    }
  };

  const [msgs, setMsgs] = useState([]);
  const [msgDraft, setMsgDraft] = useState('');
  useEffect(() => { Coaches.myMessages().then(setMsgs).catch(() => {}); }, [proto?.id]);
  const sendMsg = async () => {
    if (!msgDraft.trim()) return;
    try {
      await Coaches.sendMyMessage(msgDraft.trim());
      setMsgDraft('');
      setMsgs(await Coaches.myMessages());
    } catch (_) { /* ignore */ }
  };

  if (loading) {
    return <div className="py-8 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-sky-500" /></div>;
  }

  if (!proto) {
    return (
      <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center">
        <HeartPulse className="h-8 w-8 mx-auto text-slate-300 mb-3" />
        <p className="text-slate-600 font-semibold">No active coaching protocol.</p>
        <p className="text-sm text-slate-500 mt-1">
          Interested? <Link to="/coaching" className="text-sky-600 hover:underline font-semibold">Request coaching</Link>
        </p>
      </div>
    );
  }

  // Payment gate — hide plan details until paid
  if (!proto.paid) {
    const payUrl = proto.payment_order_id ? `/paylink/${proto.payment_order_id}` : null;
    return (
      <div className="border border-amber-200 bg-amber-50 rounded-xl p-6">
        <p className="text-[10px] uppercase tracking-widest text-amber-700 font-bold">Payment required</p>
        <h3 className="text-xl font-black text-slate-900 mt-1">{proto.title}</h3>
        <p className="text-sm text-slate-700 mt-2">Your coach {proto.coach_id ? 'has prepared' : 'is preparing'} a personalised plan. It unlocks once payment is complete (£{Number(proto.price || 9.99).toFixed(2)}).</p>
        {payUrl && (
          <Link to={payUrl} className="mt-4 inline-flex bg-sky-500 hover:bg-sky-600 text-white font-bold uppercase tracking-wider text-sm px-5 py-2.5 rounded" data-testid="pay-coaching-btn">
            Pay by Bank · £{Number(proto.price || 9.99).toFixed(2)} →
          </Link>
        )}
        {!payUrl && <p className="text-xs text-slate-500 mt-3">Your coach will share the payment link shortly.</p>}
      </div>
    );
  }

  // Group calendar entries by date
  const grouped = (proto.calendar || []).reduce((acc, e) => {
    (acc[e.date] = acc[e.date] || []).push(e);
    return acc;
  }, {});
  const sortedDates = Object.keys(grouped).sort();

  return (
    <div className="space-y-6" data-testid="my-coaching-section">
      {/* Protocol header */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
        <p className="text-[10px] uppercase tracking-widest text-emerald-700 font-bold">Your active protocol</p>
        <h3 className="text-xl font-black text-slate-900 mt-1">{proto.title}</h3>
        <p className="text-sm text-slate-600 mt-1">
          {proto.duration_weeks} weeks
          {proto.area && ` · ${AREA_LABEL[proto.area] || proto.area}`}
        </p>
        {proto.notes && (
          <div className="mt-3 p-3 bg-white border border-emerald-200 rounded text-xs text-slate-700 whitespace-pre-wrap">
            {proto.notes}
          </div>
        )}
      </div>

      {/* Items */}
      {proto.items?.length > 0 && (
        <div className="bg-white border rounded-xl p-5">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <h4 className="text-xs uppercase tracking-widest text-slate-500 font-bold flex items-center gap-2"><Package className="h-3.5 w-3.5" /> Your items</h4>
            <AddAllButton items={proto.items} weeks={proto.duration_weeks} />
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {proto.items.map(it => (
              <ItemCard key={it.id} it={it} weeks={proto.duration_weeks} />
            ))}
          </div>
        </div>
      )}

      {/* Calendar */}
      {sortedDates.length > 0 && (
        <div className="bg-white border rounded-xl p-5">
          <h4 className="text-xs uppercase tracking-widest text-slate-500 font-bold mb-3">Your dose calendar</h4>
          <div className="space-y-3">
            {sortedDates.map(date => (
              <div key={date} className="border rounded-lg p-3">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-600 mb-2">
                  {new Date(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
                <div className="space-y-1.5">
                  {grouped[date].map(e => (
                    <button
                      key={e.id}
                      onClick={() => toggle(e, !e.done)}
                      disabled={saving === e.id}
                      title={e.done ? 'Click to mark as not done' : 'Click to mark as done'}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg border transition text-left disabled:opacity-60 ${e.done ? 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100/60' : 'bg-white border-slate-200 hover:border-sky-300 hover:bg-sky-50/40'}`}
                      data-testid={`cal-entry-${e.id}`}
                    >
                      <span className={`shrink-0 h-6 w-6 rounded flex items-center justify-center border-2 transition ${e.done ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-slate-300'}`}>
                        {saving === e.id
                          ? <Loader2 className="h-4 w-4 animate-spin text-sky-500" />
                          : e.done
                            ? <CheckCircle2 className="h-4 w-4 text-white" />
                            : null}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${e.done ? 'text-emerald-800' : 'text-slate-900'}`}>
                          <strong>{e.item_name}</strong>
                          {e.dose && <span className={e.done ? '' : 'text-slate-700'}> · {e.dose}</span>}
                          {e.time_of_day && <span className={e.done ? 'text-emerald-700' : 'text-slate-500'}> · {e.time_of_day}</span>}
                        </p>
                        {e.notes && <p className={`text-xs ${e.done ? 'text-emerald-700' : 'text-slate-500'}`}>{e.notes}</p>}
                      </div>
                      {e.done && (
                        <span className="text-[10px] uppercase tracking-widest font-bold text-emerald-600 shrink-0">Done</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border rounded-xl p-5">
        <h4 className="text-xs uppercase tracking-widest text-slate-500 font-bold mb-3">💬 Messages with your coach</h4>
        <div className="max-h-64 overflow-y-auto space-y-2 mb-3 border rounded p-3 bg-slate-50">
          {msgs.length === 0 ? <p className="text-xs text-slate-500 italic">No messages yet — send one below.</p> :
            msgs.map(m => (
              <div key={m.id} className={`text-sm p-2 rounded max-w-[80%] ${m.from_role === 'client' ? 'bg-sky-100 ml-auto' : 'bg-white border'}`}>
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className="text-[10px] text-slate-500 mt-1">{new Date(m.created_at).toLocaleString('en-GB')}</p>
              </div>
            ))}
        </div>
        <div className="flex gap-2">
          <input value={msgDraft} onChange={e => setMsgDraft(e.target.value)} placeholder="Type a message…" onKeyDown={e => e.key === 'Enter' && sendMsg()} className="flex-1 border rounded px-3 py-2 text-sm" />
          <button onClick={sendMsg} disabled={!msgDraft.trim()} className="bg-sky-500 hover:bg-sky-600 text-white font-bold text-sm px-4 py-2 rounded disabled:opacity-50">Send</button>
        </div>
      </div>

      <div className="text-xs text-slate-500 flex items-start gap-2 p-3 border border-amber-200 bg-amber-50 rounded">
        <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-700" />
        <span>Your coaching protocol is for <strong>peer education only</strong>. Nothing here constitutes medical advice. Always consult a qualified healthcare professional before making changes.</span>
      </div>
    </div>
  );
};

export default MyCoaching;

const AddAllButton = ({ items, weeks }) => {
  const { addItem } = useCart();
  const addable = items
    .map(it => ({ it, calc: computeVials(it, weeks) }))
    .filter(({ it, calc }) => it.product_id && calc?.vials);
  const totalVials = addable.reduce((s, { calc }) => s + calc.vials, 0);
  if (addable.length < 2) return null;
  const addAll = () => {
    addable.forEach(({ it, calc }) => {
      addItem(
        { id: it.product_id, slug: it.product_slug, name: it.product_name || it.name, price: it.product_price, image: it.product_image, category: 'peptides' },
        calc.vials,
        it.variant_label,
      );
    });
    toast(`Added ${totalVials} vials across ${addable.length} items to cart`);
  };
  return (
    <button
      onClick={addAll}
      className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3 py-2 rounded"
      data-testid="add-all-to-cart"
    >
      <ShoppingCart className="h-3.5 w-3.5" /> Add all {totalVials} vials to cart
    </button>
  );
};

const ItemCard = ({ it, weeks }) => {
  const { addItem } = useCart();
  const calc = computeVials(it, weeks);
  const canAdd = it.product_id && calc?.vials;

  const add = () => {
    if (!canAdd) return;
    addItem(
      { id: it.product_id, slug: it.product_slug, name: it.product_name || it.name, price: it.product_price, image: it.product_image, category: 'peptides' },
      calc.vials,
      it.variant_label,
    );
    toast(`Added ${calc.vials} × ${it.product_name || it.name}${it.variant_label ? ' · ' + it.variant_label : ''} to cart`);
  };

  return (
    <div className="border rounded-lg p-3 flex flex-col gap-2" data-testid={`my-item-${it.id}`}>
      <div className="flex items-start gap-2 flex-wrap">
        <p className="font-bold text-slate-900">{it.product_name || it.name}</p>
        {it.variant_label && <span className="text-[10px] uppercase tracking-wider bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">{it.variant_label}</span>}
      </div>
      <p className="text-xs text-slate-500">
        {it.dose && <span><strong>{it.dose}</strong></span>}
        {it.dose && it.frequency && ' · '}
        {it.frequency && <span>{it.frequency}</span>}
      </p>
      {calc?.weekly_mg != null && (
        <p className="text-xs font-semibold">
          <span className="text-sky-700">{calc.weekly_mg} mg / week</span>
          {calc.vials != null && (
            <>
              <span className="text-slate-400"> · </span>
              <span className="text-emerald-700">{calc.vials} × {calc.vs}mg vial{calc.vials === 1 ? '' : 's'} for {weeks} weeks</span>
            </>
          )}
        </p>
      )}
      {it.notes && <p className="text-xs text-slate-600">{it.notes}</p>}
      {canAdd ? (
        <button
          onClick={add}
          className="mt-1 self-start inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold px-3 py-2 rounded"
          data-testid={`add-to-cart-${it.id}`}
        >
          <ShoppingCart className="h-4 w-4" /> Add {calc.vials} to cart
        </button>
      ) : it.product_id ? (
        <Link
          to={`/product/${it.product_slug || it.product_id}`}
          className="mt-1 self-start inline-flex items-center gap-1.5 bg-sky-500 hover:bg-sky-600 text-white text-sm font-bold px-3 py-2 rounded"
          data-testid={`view-product-${it.id}`}
        >
          <ShoppingCart className="h-4 w-4" /> Buy on the shop
        </Link>
      ) : null}
    </div>
  );
};
