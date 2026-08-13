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

const CoachClientDetail = () => {
  const { clientId } = useParams();
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);

  // Forms
  const [protoForm, setProtoForm] = useState({ title: '', duration_weeks: 8, notes: '' });
  const [creatingProto, setCreatingProto] = useState(false);
  const [itemForm, setItemForm] = useState({ product_id: null, name: '', dose: '', frequency: '', notes: '' });
  const [productSearch, setProductSearch] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [calForm, setCalForm] = useState({ date: '', item_name: '', dose: '', time_of_day: '', notes: '' });
  const [addingCal, setAddingCal] = useState(false);

  const load = () => {
    setLoading(true);
    Coaches.clientDetail(clientId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [clientId]);
  useEffect(() => { Products.listAll().then(setProducts).catch(() => setProducts([])); }, []);

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
      await Coaches.addItem(proto.id, itemForm);
      setItemForm({ product_id: null, name: '', dose: '', frequency: '', notes: '' });
      toast({ title: 'Item added' });
      load();
    } catch (e) {
      toast({ title: 'Add failed', description: String(e.response?.data?.detail || e.message), variant: 'destructive' });
    } finally {
      setAddingItem(false);
    }
  };

  const removeItem = async (itemId) => {
    if (!window.confirm('Remove this item from the protocol?')) return;
    await Coaches.removeItem(proto.id, itemId);
    load();
  };

  const addCalendar = async () => {
    if (!calForm.date || !calForm.item_name) return toast({ title: 'Date and item required', variant: 'destructive' });
    setAddingCal(true);
    try {
      await Coaches.addCalendar(proto.id, calForm);
      setCalForm({ date: '', item_name: '', dose: '', time_of_day: '', notes: '' });
      toast({ title: 'Added to calendar' });
      load();
    } catch (e) {
      toast({ title: 'Add failed', description: String(e.response?.data?.detail || e.message), variant: 'destructive' });
    } finally {
      setAddingCal(false);
    }
  };

  const removeCalendar = async (entryId) => {
    await Coaches.removeCalendar(proto.id, entryId);
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
                <Input value={itemForm.frequency} onChange={e => setItemForm(f => ({ ...f, frequency: e.target.value }))} placeholder="Frequency (e.g. Weekly Mon)" data-testid="item-frequency" />
                <Button onClick={addItem} disabled={addingItem || (!itemForm.name && !itemForm.product_id)} className="bg-sky-500 hover:bg-sky-600 text-white gap-1" data-testid="add-item-btn">
                  {addingItem ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
                </Button>
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

            <div className="border rounded-lg p-4 bg-slate-50 mb-4">
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-2">Schedule a dose</p>
              <div className="grid md:grid-cols-5 gap-2">
                <Input type="date" value={calForm.date} onChange={e => setCalForm(f => ({ ...f, date: e.target.value }))} data-testid="cal-date" />
                <select value={calForm.item_name} onChange={e => setCalForm(f => ({ ...f, item_name: e.target.value }))} className="border rounded px-3 py-2 text-sm bg-white" data-testid="cal-item">
                  <option value="">Item…</option>
                  {(proto.items || []).map(it => <option key={it.id} value={it.name}>{it.name}</option>)}
                </select>
                <Input value={calForm.dose} onChange={e => setCalForm(f => ({ ...f, dose: e.target.value }))} placeholder="Dose" />
                <Input value={calForm.time_of_day} onChange={e => setCalForm(f => ({ ...f, time_of_day: e.target.value }))} placeholder="Time (e.g. AM)" />
                <Button onClick={addCalendar} disabled={addingCal} className="bg-sky-500 hover:bg-sky-600 text-white gap-1" data-testid="add-cal-btn">
                  {addingCal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
                </Button>
              </div>
              <Input value={calForm.notes} onChange={e => setCalForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes (optional)" className="mt-2" />
            </div>

            {proto.calendar?.length > 0 ? (
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-600 uppercase">
                    <tr>
                      <th className="p-2 text-left">Date</th>
                      <th className="p-2 text-left">Time</th>
                      <th className="p-2 text-left">Item</th>
                      <th className="p-2 text-left">Dose</th>
                      <th className="p-2 text-left">Notes</th>
                      <th className="p-2 text-center">Done</th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {proto.calendar.map(e => (
                      <tr key={e.id} className={e.done ? 'bg-emerald-50/50 text-slate-500' : ''}>
                        <td className="p-2 font-mono text-xs">{e.date}</td>
                        <td className="p-2 text-xs">{e.time_of_day || '—'}</td>
                        <td className="p-2 font-semibold">{e.item_name}</td>
                        <td className="p-2">{e.dose || '—'}</td>
                        <td className="p-2 text-xs text-slate-500">{e.notes || '—'}</td>
                        <td className="p-2 text-center">{e.done ? '✅' : '⏳'}</td>
                        <td className="p-2 text-right">
                          <Button variant="ghost" size="icon" onClick={() => removeCalendar(e.id)} className="h-7 w-7 text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic">No scheduled doses yet — add entries above.</p>
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
