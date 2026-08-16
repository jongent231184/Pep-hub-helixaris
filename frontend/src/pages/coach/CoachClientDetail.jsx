import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Coaches, Products, resolveImage } from '../../lib/api';
import { Loader2, ArrowLeft, Plus, Trash2, Package, Search, Calendar as CalendarIcon, X, ShoppingCart } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Button } from '../../components/ui/button';
import { useToast } from '../../hooks/use-toast';
import WeighInPanel from '../../components/WeighInPanel';

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
  const [itemForm, setItemForm] = useState({
    product_id: null, variant_label: '', name: '', dose_amount: '', dose_unit: 'mg',
    vial_strength_mg: '', freqDays: [], freqTime: '', notes: '',
  });
  // Selected product cached to render its variants dropdown
  const [selectedProduct, setSelectedProduct] = useState(null);
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
    // Auto-pick first variant with a vial_strength (or first variant)
    const variants = p.variants || [];
    const withStrength = variants.find(v => v.vial_strength_mg) || variants[0];
    // Fallback: try to infer vial strength from the product name (e.g. "TB-500 10mg" → 10)
    let inferredVial = withStrength?.vial_strength_mg || '';
    if (!inferredVial) {
      const m = /(\d+(?:\.\d+)?)\s*mg\b/i.exec(p.name || '');
      if (m) inferredVial = m[1];
    }
    setSelectedProduct(p);
    setItemForm(f => ({
      ...f,
      product_id: p.id,
      name: p.name,
      variant_label: withStrength?.label || '',
      vial_strength_mg: inferredVial,
    }));
    setProductSearch('');
  };
  const clearProduct = () => {
    setSelectedProduct(null);
    setItemForm(f => ({ ...f, product_id: null, name: '', variant_label: '', vial_strength_mg: '' }));
  };
  const pickVariant = (label) => {
    const v = (selectedProduct?.variants || []).find(x => x.label === label);
    setItemForm(f => ({ ...f, variant_label: label, vial_strength_mg: v?.vial_strength_mg || '' }));
  };

  const addItem = async () => {
    if (!itemForm.name) return toast({ title: 'Item name required', variant: 'destructive' });
    setAddingItem(true);
    try {
      const dayStr = itemForm.freqDays.length ? itemForm.freqDays.join('+') : '';
      const doseDisplay = itemForm.dose_amount ? `${itemForm.dose_amount} ${itemForm.dose_unit}` : '';
      const frequency = [dayStr, itemForm.freqTime].filter(Boolean).join(' · ');
      await Coaches.addItem(proto.id, {
        product_id: itemForm.product_id,
        variant_label: itemForm.variant_label || null,
        name: itemForm.name,
        dose: doseDisplay,
        dose_amount: itemForm.dose_amount ? Number(itemForm.dose_amount) : null,
        dose_unit: itemForm.dose_unit,
        vial_strength_mg: itemForm.vial_strength_mg ? Number(itemForm.vial_strength_mg) : null,
        notes: itemForm.notes,
        frequency,
        freq_days: itemForm.freqDays,
        freq_time: itemForm.freqTime,
      });
      setItemForm({
        product_id: null, variant_label: '', name: '', dose_amount: '', dose_unit: 'mg',
        vial_strength_mg: '', freqDays: [], freqTime: '', notes: '',
      });
      setSelectedProduct(null);
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

  // Client-side vial calc mirroring backend logic (so coach sees numbers instantly)
  const UNIT_TO_MG = { mg: 1, mcg: 0.001, IU: null, clicks: null };
  const computeVials = (it) => {
    const days = (it.freq_days || []).length;
    const weeks = proto?.duration_weeks || 0;
    const dose = it.dose_amount;
    const unit = it.dose_unit;
    const doses_per_day = it.freq_time === 'AM+PM' ? 2 : 1;
    const factor = UNIT_TO_MG[unit];
    if (!dose || factor == null || !days || !weeks) return null;
    const weekly_mg = dose * factor * days * doses_per_day;
    const total_mg = weekly_mg * weeks;
    const vs = it.vial_strength_mg;
    const vials = vs && vs > 0 ? Math.ceil(total_mg / vs) : null;
    return { weekly_mg: +weekly_mg.toFixed(3), total_mg: +total_mg.toFixed(3), vials, vs };
  };

  const removeItem = async (itemId) => {
    if (!window.confirm('Remove this item and its scheduled doses?')) return;
    await Coaches.removeItem(proto.id, itemId);
    load();
  };

  const toggleEntry = async (entry) => {
    const next = !entry.done;
    // Optimistic UI — update within data.protocol.calendar
    setData(d => ({
      ...d,
      protocol: {
        ...d.protocol,
        calendar: (d.protocol.calendar || []).map(x => x.id === entry.id ? { ...x, done: next } : x),
      },
    }));
    try {
      await Coaches.toggleEntryCoach(proto.id, entry.id, next);
    } catch {
      // Rollback on failure
      setData(d => ({
        ...d,
        protocol: {
          ...d.protocol,
          calendar: (d.protocol.calendar || []).map(x => x.id === entry.id ? { ...x, done: !next } : x),
        },
      }));
      toast({ title: 'Could not update dose', variant: 'destructive' });
    }
  };

  const [editingProto, setEditingProto] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', duration_weeks: 8, notes: '' });
  const openEdit = () => {
    setEditForm({ title: proto.title || '', duration_weeks: proto.duration_weeks || 8, notes: proto.notes || '' });
    setEditingProto(true);
  };
  const saveEdit = async () => {
    const weeks = Number(editForm.duration_weeks) || 1;
    if (weeks < 1) return toast({ title: 'Weeks must be at least 1', variant: 'destructive' });
    const oldWeeks = Number(proto.duration_weeks) || 0;
    if (weeks < oldWeeks) {
      const proceed = window.confirm(`Shortening from ${oldWeeks} to ${weeks} weeks will delete calendar entries beyond week ${weeks}. Continue?`);
      if (!proceed) return;
    }
    try {
      await Coaches.updateProtocol(proto.id, { title: editForm.title.trim(), duration_weeks: weeks, notes: editForm.notes });
      toast({ title: 'Protocol updated' });
      setEditingProto(false);
      load();
    } catch (e) {
      toast({ title: 'Update failed', description: String(e?.response?.data?.detail || e.message), variant: 'destructive' });
    }
  };

  const [paylinkBusy, setPaylinkBusy] = useState(false);
  const [paylinkPrice, setPaylinkPrice] = useState('');
  useEffect(() => {
    if (proto && paylinkPrice === '') {
      setPaylinkPrice(String(Number(proto.price ?? 9.99).toFixed(2)));
    }
  }, [proto]);
  const createPaylink = async () => {
    const priceNum = parseFloat(paylinkPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      return toast({ title: 'Enter a valid price', variant: 'destructive' });
    }
    setPaylinkBusy(true);
    try {
      // If a paylink already exists at a different price, backend will regenerate. Copy-only when price matches.
      const shouldRegen = !proto.payment_order_id || Math.abs(Number(proto.price || 0) - priceNum) > 0.001;
      const res = await Coaches.createPaylink(proto.id, shouldRegen ? priceNum : null);
      const url = `${window.location.origin}${res.payment_link}`;
      try { await navigator.clipboard.writeText(url); } catch (_) { /* ignore */ }
      toast({ title: shouldRegen && proto.payment_order_id ? 'Paylink regenerated · copied' : 'Paylink ready · copied to clipboard', description: `${res.order_number} · £${Number(res.amount).toFixed(2)}` });
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
                {editingProto ? (
                  <div className="space-y-2 mt-1" data-testid="proto-edit-form">
                    <Input
                      value={editForm.title}
                      onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="Protocol title"
                      className="text-lg font-bold"
                      data-testid="proto-edit-title"
                    />
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-slate-600 whitespace-nowrap">Duration (weeks):</Label>
                      <Input
                        type="number"
                        min="1"
                        max="52"
                        value={editForm.duration_weeks}
                        onChange={e => setEditForm(f => ({ ...f, duration_weeks: e.target.value }))}
                        className="w-24"
                        data-testid="proto-edit-weeks"
                      />
                    </div>
                    <Textarea
                      rows={2}
                      value={editForm.notes}
                      onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="Notes"
                      data-testid="proto-edit-notes"
                    />
                    <div className="flex items-center gap-2">
                      <Button onClick={saveEdit} className="bg-sky-500 hover:bg-sky-600 text-white gap-1" data-testid="proto-edit-save">Save</Button>
                      <Button onClick={() => setEditingProto(false)} variant="outline" data-testid="proto-edit-cancel">Cancel</Button>
                    </div>
                    {Number(editForm.duration_weeks) !== Number(proto.duration_weeks) && (
                      <p className="text-[11px] text-amber-700">
                        Duration change: calendar entries will be re-synced (extending adds new doses per item, shortening removes future entries beyond week {editForm.duration_weeks}).
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <h2 className="text-2xl font-black text-slate-900">{proto.title}</h2>
                    <p className="text-sm text-slate-600 mt-1">{proto.duration_weeks} weeks · {proto.items?.length || 0} item{proto.items?.length === 1 ? '' : 's'} · {proto.calendar?.length || 0} scheduled dose{proto.calendar?.length === 1 ? '' : 's'} · £{Number(proto.price || 9.99).toFixed(2)}</p>
                    {proto.notes && <p className="text-xs text-slate-600 mt-2 whitespace-pre-wrap">{proto.notes}</p>}
                  </>
                )}
                {!editingProto && !proto.paid && (
                  <div className="mt-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center border rounded overflow-hidden">
                        <span className="px-2 py-2 text-sm font-bold bg-slate-100 text-slate-600">£</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0.50"
                          value={paylinkPrice}
                          onChange={e => setPaylinkPrice(e.target.value)}
                          className="border-0 focus-visible:ring-0 w-24 font-semibold"
                          data-testid="paylink-price"
                        />
                      </div>
                      <Button onClick={createPaylink} disabled={paylinkBusy} className="bg-sky-500 hover:bg-sky-600 text-white gap-2" data-testid="send-paylink-btn">
                        {paylinkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : '💳'} {proto.payment_order_id ? (Math.abs(Number(proto.price || 0) - parseFloat(paylinkPrice || 0)) > 0.001 ? 'Regenerate link' : 'Copy payment link') : 'Send payment link'}
                      </Button>
                    </div>
                    {proto.payment_order_id && (
                      <p className="text-xs text-slate-600 mt-2">
                        {Math.abs(Number(proto.price || 0) - parseFloat(paylinkPrice || 0)) > 0.001
                          ? `Current link is for £${Number(proto.price).toFixed(2)} — saving a new price will regenerate it.`
                          : 'Client sees the protocol only once paid.'}
                      </p>
                    )}
                  </div>
                )}
              </div>
              {!editingProto && (
                <div className="flex flex-col gap-2 items-end">
                  <Button onClick={openEdit} variant="outline" className="gap-1" data-testid="proto-edit-btn">
                    ✏️ Edit
                  </Button>
                  <Button onClick={endProtocol} variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 gap-1"><X className="h-4 w-4" />End</Button>
                </div>
              )}
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

              {/* Variant picker (when product has variants) */}
              {itemForm.product_id && selectedProduct?.variants?.length > 0 && (
                <div className="mb-3 flex items-center gap-2">
                  <Label className="text-xs uppercase tracking-widest font-bold text-slate-500">Variant</Label>
                  <select
                    value={itemForm.variant_label}
                    onChange={e => pickVariant(e.target.value)}
                    className="border rounded px-2 py-1 text-sm bg-white font-semibold"
                    data-testid="item-variant"
                  >
                    {selectedProduct.variants.map(v => (
                      <option key={v.label} value={v.label}>
                        {v.label} {v.vial_strength_mg ? `(${v.vial_strength_mg}mg/vial)` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid md:grid-cols-6 gap-2 items-end">
                {!itemForm.product_id && (
                  <div className="md:col-span-2">
                    <Input value={itemForm.name} onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))} placeholder="Custom item name" />
                  </div>
                )}
                <div className="md:col-span-2">
                  <Label className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Dose per admin.</Label>
                  <div className="flex gap-1">
                    <Input
                      type="number"
                      step="0.01"
                      value={itemForm.dose_amount}
                      onChange={e => setItemForm(f => ({ ...f, dose_amount: e.target.value }))}
                      placeholder="2.5"
                      data-testid="item-dose-amount"
                      className="flex-1"
                    />
                    <select
                      value={itemForm.dose_unit}
                      onChange={e => setItemForm(f => ({ ...f, dose_unit: e.target.value }))}
                      className="border rounded px-2 py-2 text-sm bg-white font-semibold"
                      data-testid="item-dose-unit"
                    >
                      <option value="mg">mg</option>
                      <option value="mcg">mcg</option>
                      <option value="IU">IU</option>
                      <option value="clicks">clicks</option>
                    </select>
                  </div>
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Vial (mg)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={itemForm.vial_strength_mg}
                    onChange={e => setItemForm(f => ({ ...f, vial_strength_mg: e.target.value }))}
                    placeholder="5"
                    data-testid="item-vial-strength"
                  />
                </div>
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
                {proto.items.map(it => {
                  const calc = computeVials(it);
                  return (
                    <div key={it.id} className="flex items-center gap-3 p-3 border rounded-lg" data-testid={`item-row-${it.id}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-slate-900">{it.name}</p>
                          {it.variant_label && <span className="text-[10px] uppercase tracking-wider bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">{it.variant_label}</span>}
                          {it.product_id && <span className="text-[10px] uppercase tracking-wider bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded">Store product</span>}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {it.dose && <span><strong>{it.dose}</strong></span>}
                          {it.dose && it.frequency && ' · '}
                          {it.frequency && <span>{it.frequency}</span>}
                        </p>
                        {calc && calc.weekly_mg != null && (
                          <p className="text-xs mt-1 font-semibold text-slate-700" data-testid={`item-calc-${it.id}`}>
                            <span className="text-sky-700">{calc.weekly_mg} mg/week</span>
                            {calc.vials != null && (
                              <>
                                <span className="text-slate-400"> · </span>
                                <span className="text-emerald-700">{calc.vials} × {calc.vs}mg vial{calc.vials === 1 ? '' : 's'} for {proto.duration_weeks} weeks</span>
                              </>
                            )}
                          </p>
                        )}
                        {it.notes && <p className="text-xs text-slate-500 mt-1">{it.notes}</p>}
                      </div>
                      {it.product_id && calc?.vials && (
                        <span className="text-[10px] text-slate-400 whitespace-nowrap italic" title="Customer clicks 'Add to cart' from their view">Client can add</span>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => removeItem(it.id)} className="text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  );
                })}
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
                              <button
                                key={e.id}
                                type="button"
                                onClick={() => toggleEntry(e)}
                                className={`w-full text-[10px] leading-tight px-1.5 py-1 rounded text-left transition ${e.done ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300' : 'bg-sky-100 text-sky-900 hover:bg-sky-200'}`}
                                title={`${e.item_name}${e.dose ? ' · ' + e.dose : ''}${e.time_of_day ? ' · ' + e.time_of_day : ''}${e.done ? ' — click to un-mark' : ' — click to mark done'}`}
                                data-testid={`week-entry-${e.id}`}
                              >
                                <p className="font-bold truncate flex items-center gap-1">
                                  {e.done && <span className="text-emerald-600 leading-none">✓</span>}
                                  <span className="truncate">{e.item_name}</span>
                                </p>
                                {(e.dose || e.time_of_day) && (
                                  <p className="opacity-80 truncate">{[e.dose, e.time_of_day].filter(Boolean).join(' · ')}</p>
                                )}
                              </button>
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

          {/* Weigh-in tracker (read-only for coach) */}
          <WeighInPanel readOnly coachFetch={() => Coaches.coachWeighIns(client.id)} />

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
