import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Coaches, Products, resolveImage } from '../../lib/api';
import { Loader2, ArrowLeft, Plus, Trash2, Package, Search, Calendar as CalendarIcon, X } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Button } from '../../components/ui/button';
import { useToast } from '../../hooks/use-toast';

const AREA_LABEL = { weightloss: 'Weight loss', peptide_info: 'Peptide Information', dosage_guide: 'Dosage Guide', how_to_guide: 'How-to Guide' };
const DAY_CODES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// JS Date.getDay(): 0=Sun..6=Sat. Convert to Mon=0..Sun=6
const jsDayToIdx = (d) => (d + 6) % 7;

// Compute Monday of the ISO week containing the given ISO date string
const weekStart = (isoDate) => {
  const d = new Date(isoDate + 'T00:00:00Z');
  const dow = jsDayToIdx(d.getUTCDay());
  d.setUTCDate(d.getUTCDate() - dow);
  return d;
};
const addDays = (d, n) => { const c = new Date(d); c.setUTCDate(c.getUTCDate() + n); return c; };
const toISO = (d) => d.toISOString().slice(0, 10);
const shortDate = (d) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

const CoachClientDetail = () => {
  const { clientId } = useParams();
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);

  // Forms
  const [protoForm, setProtoForm] = useState({ title: '', duration_weeks: 8, notes: '' });
  const [creatingProto, setCreatingProto] = useState(false);
  const [itemForm, setItemForm] = useState({ product_id: null, name: '', dose: '', freqDays: [], freqTime: '', notes: '' });
  const [productSearch, setProductSearch] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(1);

  const load = () => {
    setLoading(true);
    Coaches.clientDetail(clientId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [clientId]);
  useEffect(() => { Products.list().then(setProducts).catch(() => setProducts([])); }, []);

  const productMatches = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return (products || []).filter(p =>
      !q || p.name.toLowerCase().includes(q) || (p.slug || '').includes(q)
    ).slice(0, 8);
  }, [products, productSearch]);

  const proto = data?.protocol;
  const client = data?.client;

  const createProto = async () => {
    if (!protoForm.title) return toast({ title: 'Title required', variant: 'destructive' });
    setCreatingProto(true);
    try {
      await Coaches.createProtocol(clientId, {
        title: protoForm.title,
        area: client?.area,
        duration_weeks: Number(protoForm.duration_weeks) || 8,
        notes: protoForm.notes,
      });
      toast({ title: 'Protocol created' });
      setProtoForm({ title: '', duration_weeks: 8, notes: '' });
      load();
    } catch (e) {
      toast({ title: 'Create failed', description: String(e.response?.data?.detail || e.message), variant: 'destructive' });
    } finally {
      setCreatingProto(false);
    }
  };

  const pickProduct = (p) => {
    setItemForm(f => ({ ...f, product_id: p.id, name: p.name }));
    setProductSearch('');
  };
  const clearProduct = () => setItemForm(f => ({ ...f, product_id: null, name: '' }));

  const addItem = async () => {
    if (!itemForm.name) return toast({ title: 'Item name required', variant: 'destructive' });
    setAddingItem(true);
    try {
      const frequency = [
        itemForm.freqDays.length ? itemForm.freqDays.join('+') : '',
        itemForm.freqTime,
      ].filter(Boolean).join(' · ');
      await Coaches.addItem(proto.id, {
        product_id: itemForm.product_id,
        name: itemForm.name,
        dose: itemForm.dose,
        notes: itemForm.notes,
        frequency,
        freq_days: itemForm.freqDays,
        freq_time: itemForm.freqTime,
      });
      setItemForm({ product_id: null, name: '', dose: '', freqDays: [], freqTime: '', notes: '' });
      toast({ title: 'Item added · calendar auto-scheduled' });
      load();
    } catch (e) {
      toast({ title: 'Add failed', description: String(e.response?.data?.detail || e.message), variant: 'destructive' });
    } finally {
      setAddingItem(false);
    }
  };

  const toggleFreqDay = (day) => {
    setItemForm(f => ({
      ...f,
      freqDays: f.freqDays.includes(day) ? f.freqDays.filter(d => d !== day) : [...f.freqDays, day],
    }));
  };

  const removeItem = async (itemId) => {
    if (!window.confirm('Remove this item and its scheduled doses?')) return;
    await Coaches.removeItem(proto.id, itemId);
    load();
  };

  const [paylinkBusy, setPaylinkBusy] = useState(false);
  const createPaylink = async () => {
    setPaylinkBusy(true);
    try {
      const res = await Coaches.createPaylink(proto.id);
      const url = `${window.location.origin}${res.payment_link}`;
      try { await navigator.clipboard.writeText(url); } catch (_) { /* ignore */ }
      toast({ title: 'Paylink ready · copied to clipboard', description: `${res.order_number} · £${Number(res.amount).toFixed(2)}` });
      load();
    } catch (e) {
      toast({ title: 'Paylink failed', description: String(e.response?.data?.detail || e.message), variant: 'destructive' });
    } finally {
      setPaylinkBusy(false);
    }
  };

  const [msgs, setMsgs] = useState([]);
  const [msgDraft, setMsgDraft] = useState('');
  const [msgSending, setMsgSending] = useState(false);
  useEffect(() => { if (client) Coaches.clientMessages(client.id).then(setMsgs).catch(() => {}); }, [client]);
  const sendMsg = async () => {
    if (!msgDraft.trim()) return;
    setMsgSending(true);
    try {
      await Coaches.sendMessage(client.id, msgDraft.trim());
      setMsgDraft('');
      const fresh = await Coaches.clientMessages(client.id);
      setMsgs(fresh);
    } catch (e) {
      toast({ title: 'Send failed', variant: 'destructive' });
    } finally {
      setMsgSending(false);
    }
  };

  const endProtocol = async () => {
    if (!window.confirm('End (deactivate) this protocol? You can create a new one afterwards.')) return;
    await Coaches.deleteProtocol(proto.id);
    toast({ title: 'Protocol ended' });
    load();
  };

  if (loading) return <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>;
  if (!client) return <div className="p-6"><Link to="/coach/clients" className="text-sky-600"><ArrowLeft className="h-4 w-4 inline" /> Back</Link><p className="mt-4 text-slate-500">Client not found.</p></div>;

  return (
    <div className="space-y-6">
      <Link to="/coach/clients" className="text-sm text-sky-600 hover:underline inline-flex items-center gap-1"><ArrowLeft className="h-4 w-4" /> Back to clients</Link>

      {/* Client header */}
      <div className="bg-white border rounded-xl p-6">
        <h1 className="text-2xl font-black">{client.customer_name}</h1>
        <p className="text-sm text-slate-600 mt-1">{client.customer_email} · <strong>{AREA_LABEL[client.area] || client.area || '—'}</strong></p>
        <p className="text-xs text-slate-500 mt-1">Client since {new Date(client.started_at).toLocaleDateString('en-GB')}</p>
      </div>

      {/* No protocol yet — show create form */}
      {!proto && (
        <div className="bg-white border rounded-xl p-6" data-testid="create-protocol-form">
          <h2 className="text-lg font-bold uppercase mb-4">Create a protocol</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Label>Protocol title</Label>
              <Input value={protoForm.title} onChange={e => setProtoForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. 8-week weight loss with Reta" className="mt-1" data-testid="proto-title-input" />
            </div>
            <div>
              <Label>Duration (weeks)</Label>
              <Input type="number" min="1" value={protoForm.duration_weeks} onChange={e => setProtoForm(f => ({ ...f, duration_weeks: e.target.value }))} className="mt-1" />
            </div>
            <div className="md:col-span-3">
              <Label>Notes for the client</Label>
              <Textarea rows={3} value={protoForm.notes} onChange={e => setProtoForm(f => ({ ...f, notes: e.target.value }))} placeholder="Overall protocol notes visible to the client…" className="mt-1" />
            </div>
          </div>
          <Button onClick={createProto} disabled={creatingProto} className="mt-4 bg-sky-500 hover:bg-sky-600 text-white gap-2" data-testid="create-proto-btn">
            {creatingProto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create protocol
          </Button>
        </div>
      )}

      {/* Protocol exists — show builder */}
      {proto && (
        <>
          <div className={`border rounded-xl p-6 ${proto.paid ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className={`text-[10px] uppercase tracking-widest font-bold ${proto.paid ? 'text-emerald-700' : 'text-amber-700'}`}>Active protocol</p>
                  <span className={`text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded ${proto.paid ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-200 text-amber-800'}`}>
                    {proto.paid ? 'Paid · Unlocked' : 'Payment pending'}
                  </span>
                </div>
                <h2 className="text-2xl font-black text-slate-900">{proto.title}</h2>
                <p className="text-sm text-slate-600 mt-1">{proto.duration_weeks} weeks · {proto.items?.length || 0} item{proto.items?.length === 1 ? '' : 's'} · {proto.calendar?.length || 0} scheduled dose{proto.calendar?.length === 1 ? '' : 's'} · £{Number(proto.price || 9.99).toFixed(2)}</p>
                {proto.notes && <p className="text-xs text-slate-600 mt-2 whitespace-pre-wrap">{proto.notes}</p>}
                {!proto.paid && (
                  <div className="mt-3">
                    <Button onClick={createPaylink} disabled={paylinkBusy} className="bg-sky-500 hover:bg-sky-600 text-white gap-2" data-testid="send-paylink-btn">
                      {paylinkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : '💳'} {proto.payment_order_id ? 'Copy payment link' : 'Send payment link'}
                    </Button>
                    {proto.payment_order_id && (
                      <p className="text-xs text-slate-600 mt-2">Client sees the protocol only once paid.</p>
                    )}
                  </div>
                )}
              </div>
              <Button onClick={endProtocol} variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 gap-1"><X className="h-4 w-4" />End</Button>
            </div>
          </div>

          {/* Items / products */}
          <div className="bg-white border rounded-xl p-6">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600 mb-4 flex items-center gap-2">
              <Package className="h-4 w-4" /> Items & products
            </h3>

            {/* Add item form */}
            <div className="border rounded-lg p-4 bg-slate-50 mb-4">
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-2">Add an item</p>
              {/* Product picker */}
              <div className="relative mb-3">
                {itemForm.product_id ? (
                  <div className="flex items-center gap-2 bg-sky-50 border border-sky-200 rounded px-3 py-2">
                    <span className="text-sm font-semibold flex-1">🛒 {itemForm.name}</span>
                    <button onClick={clearProduct} className="text-xs text-slate-500 hover:underline">Clear</button>
                  </div>
                ) : (
                  <>
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    <Input value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Search store products (or leave blank for a custom item)…" className="pl-9" data-testid="product-search" />
                    {productSearch && productMatches.length > 0 && (
                      <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border shadow-lg rounded max-h-64 overflow-y-auto">
                        {productMatches.map(p => (
                          <button key={p.id} onClick={() => pickProduct(p)} className="w-full flex items-center gap-3 p-2 hover:bg-slate-50 text-left">
                            {p.image && <img src={resolveImage(p.image)} alt="" className="h-8 w-8 object-contain bg-white rounded border" />}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate">{p.name}</p>
                              <p className="text-xs text-slate-500">£{Number(p.price).toFixed(2)}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="grid md:grid-cols-4 gap-2">
                {!itemForm.product_id && (
                  <div className="md:col-span-2">
                    <Input value={itemForm.name} onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))} placeholder="Custom item name" />
                  </div>
                )}
                <Input value={itemForm.dose} onChange={e => setItemForm(f => ({ ...f, dose: e.target.value }))} placeholder="Dose (e.g. 2.5mg)" data-testid="item-dose" />
                <Button onClick={addItem} disabled={addingItem || (!itemForm.name && !itemForm.product_id)} className="bg-sky-500 hover:bg-sky-600 text-white gap-1" data-testid="add-item-btn">
                  {addingItem ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
                </Button>
              </div>

              {/* Frequency: multi-day chips + AM/PM */}
              <div className="mt-3">
                <p className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1.5">Frequency</p>
                <div className="flex flex-wrap gap-1.5">
                  {DAY_CODES.map(d => {
                    const on = itemForm.freqDays.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleFreqDay(d)}
                        className={`px-2.5 py-1 rounded text-xs font-bold border transition ${on ? 'bg-sky-500 text-white border-sky-500' : 'bg-white text-slate-600 border-slate-200 hover:border-sky-300'}`}
                        data-testid={`freq-day-${d}`}
                      >
                        {d}
                      </button>
                    );
                  })}
                  <select
                    value={itemForm.freqTime}
                    onChange={e => setItemForm(f => ({ ...f, freqTime: e.target.value }))}
                    className="border border-slate-200 rounded px-2 py-1 text-xs bg-white font-semibold"
                    data-testid="item-freq-time"
                  >
                    <option value="">Time…</option>
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                    <option value="AM+PM">AM & PM</option>
                  </select>
                </div>
              </div>
              <Textarea rows={2} value={itemForm.notes} onChange={e => setItemForm(f => ({ ...f, notes: e.target.value }))} placeholder="Item notes (optional)" className="mt-2" />
            </div>

            {/* Item list */}
            {proto.items?.length > 0 ? (
              <div className="space-y-2">
                {proto.items.map(it => (
                  <div key={it.id} className="flex items-center gap-3 p-3 border rounded-lg" data-testid={`item-row-${it.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-slate-900">{it.name}</p>
                        {it.product_id && <span className="text-[10px] uppercase tracking-wider bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded">Store product</span>}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {it.dose && <span><strong>{it.dose}</strong></span>}
                        {it.dose && it.frequency && ' · '}
                        {it.frequency && <span>{it.frequency}</span>}
                      </p>
                      {it.notes && <p className="text-xs text-slate-500 mt-1">{it.notes}</p>}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeItem(it.id)} className="text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic">No items yet — add compounds, products or notes above.</p>
            )}
          </div>

          {/* Calendar */}
          <div className="bg-white border rounded-xl p-6">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600 mb-4 flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" /> Dose calendar ({proto.calendar?.length || 0})
            </h3>

            {/* Visual 7-day week grid — populated automatically from item frequency */}
            {proto.duration_weeks > 0 && (() => {
              // Week 1 = Monday of the week the protocol was created
              const wk1Mon = weekStart(toISO(new Date(proto.created_at)));
              const wkMon = addDays(wk1Mon, (selectedWeek - 1) * 7);
              const days = Array.from({ length: 7 }, (_, i) => addDays(wkMon, i));
              const entriesByDate = (proto.calendar || []).reduce((acc, e) => {
                (acc[e.date] = acc[e.date] || []).push(e); return acc;
              }, {});
              const todayISO = toISO(new Date());
              return (
                <div data-testid="week-visual">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs uppercase tracking-widest font-bold text-slate-500">Week view · auto-scheduled from item frequency</p>
                    <select
                      value={selectedWeek}
                      onChange={e => setSelectedWeek(Number(e.target.value))}
                      className="border rounded px-3 py-1 text-sm bg-white font-semibold"
                      data-testid="week-select"
                    >
                      {Array.from({ length: proto.duration_weeks }, (_, i) => (
                        <option key={i} value={i + 1}>Week {i + 1}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {days.map((d, i) => {
                      const iso = toISO(d);
                      const list = entriesByDate[iso] || [];
                      const isToday = iso === todayISO;
                      return (
                        <div
                          key={iso}
                          className={`border rounded-lg p-2 min-h-[110px] ${isToday ? 'border-sky-400 bg-sky-50/40 ring-1 ring-sky-300' : 'border-slate-200 bg-white'}`}
                          data-testid={`week-day-${i}`}
                        >
                          <p className="text-[10px] uppercase font-bold text-slate-500 leading-none">{DAY_CODES[i]}</p>
                          <p className="text-xs font-bold text-slate-700 mt-0.5">{d.getUTCDate()} {d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}</p>
                          <div className="mt-1.5 space-y-1">
                            {list.length === 0 ? (
                              <p className="text-[10px] text-slate-300 italic">—</p>
                            ) : list.map(e => (
                              <div
                                key={e.id}
                                className={`text-[10px] leading-tight px-1.5 py-1 rounded ${e.done ? 'bg-emerald-100 text-emerald-800 line-through' : 'bg-sky-100 text-sky-900'}`}
                                title={`${e.item_name}${e.dose ? ' · ' + e.dose : ''}${e.time_of_day ? ' · ' + e.time_of_day : ''}`}
                              >
                                <p className="font-bold truncate">{e.item_name}</p>
                                {(e.dose || e.time_of_day) && (
                                  <p className="opacity-80 truncate">{[e.dose, e.time_of_day].filter(Boolean).join(' · ')}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2">Week {selectedWeek} · {shortDate(days[0])} – {shortDate(days[6])}</p>
                </div>
              );
            })()}

            {(proto.items?.length || 0) === 0 && (
              <p className="text-sm text-slate-500 italic mt-3">Add an item with a day + time above and doses will auto-populate here.</p>
            )}
          </div>

          {/* Messages */}
          <div className="bg-white border rounded-xl p-6">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600 mb-4">💬 Messages with client</h3>
            <div className="max-h-72 overflow-y-auto space-y-2 mb-4 border rounded p-3 bg-slate-50">
              {msgs.length === 0 ? (
                <p className="text-xs text-slate-500 italic">No messages yet.</p>
              ) : msgs.map(m => (
                <div key={m.id} className={`text-sm p-2 rounded max-w-[80%] ${m.from_role === 'coach' ? 'bg-sky-100 ml-auto' : 'bg-white border'}`}>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{new Date(m.created_at).toLocaleString('en-GB')} · {m.from_role}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={msgDraft} onChange={e => setMsgDraft(e.target.value)} placeholder="Type a message to your client…" onKeyDown={e => e.key === 'Enter' && sendMsg()} />
              <Button onClick={sendMsg} disabled={msgSending || !msgDraft.trim()} className="bg-sky-500 hover:bg-sky-600 text-white">Send</Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CoachClientDetail;
