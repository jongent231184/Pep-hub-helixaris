import React, { useEffect, useState } from 'react';
import { Coaches } from '../../lib/api';
import { Loader2, PoundSterling, ChevronRight, X, CheckCircle2, Trash2, GraduationCap } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { useToast } from '../../hooks/use-toast';

const fmt = (n) => `£${Number(n || 0).toFixed(2)}`;
const dt = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB') : '—');

const AdminCoachEarnings = () => {
  const { toast } = useToast();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [payoutForm, setPayoutForm] = useState({ amount: '', note: '' });
  const [savingPayout, setSavingPayout] = useState(false);

  const load = () => {
    setLoading(true);
    Coaches.adminEarningsList()
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openDetail = async (c) => {
    setSelected(c);
    setDetail(null);
    setDetailLoading(true);
    setSelectedOrderIds([]);
    setPayoutForm({ amount: '', note: '' });
    try {
      const d = await Coaches.adminEarningsGet(c.user.id);
      setDetail(d);
    } catch (e) {
      toast({ title: 'Failed to load coach earnings', variant: 'destructive' });
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelected(null);
    setDetail(null);
    setSelectedOrderIds([]);
    setPayoutForm({ amount: '', note: '' });
  };

  const pendingOrders = (detail?.orders || []).filter(o => !o.coach_payout_paid);

  const toggleOrder = (o, checked) => {
    const nextIds = checked
      ? [...selectedOrderIds, o.id]
      : selectedOrderIds.filter(id => id !== o.id);
    setSelectedOrderIds(nextIds);
    const byId = new Map(pendingOrders.map(x => [x.id, x]));
    const total = nextIds
      .map(id => byId.get(id))
      .filter(Boolean)
      .reduce((s, x) => s + Number(x.total || 0), 0);
    setPayoutForm(f => ({ ...f, amount: total ? total.toFixed(2) : '' }));
  };

  const toggleAll = (checked) => {
    if (checked) {
      const ids = pendingOrders.map(o => o.id);
      setSelectedOrderIds(ids);
      const total = pendingOrders.reduce((s, o) => s + Number(o.total || 0), 0);
      setPayoutForm(f => ({ ...f, amount: total ? total.toFixed(2) : '' }));
    } else {
      setSelectedOrderIds([]);
      setPayoutForm(f => ({ ...f, amount: '' }));
    }
  };

  const handlePayout = async () => {
    if (!selected) return;
    const amt = Number(payoutForm.amount);
    if (!amt || amt <= 0) {
      toast({ title: 'Enter an amount > 0', variant: 'destructive' });
      return;
    }
    setSavingPayout(true);
    try {
      await Coaches.adminCreatePayout(selected.user.id, {
        amount: amt,
        note: payoutForm.note,
        order_ids: selectedOrderIds,
      });
      const covered = selectedOrderIds.length;
      toast({
        title: 'Payout recorded',
        description: `${fmt(amt)}${covered ? ` · ${covered} order${covered === 1 ? '' : 's'} marked paid` : ''}`,
      });
      setPayoutForm({ amount: '', note: '' });
      setSelectedOrderIds([]);
      await openDetail(selected);
      load();
    } catch (err) {
      toast({
        title: 'Payout failed',
        description: String(err.response?.data?.detail || err.message),
        variant: 'destructive',
      });
    } finally {
      setSavingPayout(false);
    }
  };

  const handleDeletePayout = async (payoutId) => {
    if (!selected) return;
    if (!window.confirm('Delete this payout record? Linked orders will revert to Pending.')) return;
    try {
      await Coaches.adminDeletePayout(selected.user.id, payoutId);
      await openDetail(selected);
      load();
    } catch (err) {
      toast({
        title: 'Delete failed',
        description: String(err.response?.data?.detail || err.message),
        variant: 'destructive',
      });
    }
  };

  return (
    <div data-testid="admin-coach-earnings-page">
      <div className="flex items-start gap-3 mb-6">
        <div className="h-10 w-10 rounded-lg bg-sky-100 text-sky-700 grid place-items-center border border-sky-200">
          <GraduationCap className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-3xl font-black uppercase text-slate-900 tracking-tight">Coach Earnings</h1>
          <p className="text-sm text-slate-500">Paid orders attributed to each coach&apos;s clients. Tick pending rows to record a payout.</p>
        </div>
      </div>

      {loading ? (
        <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>
      ) : list.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center text-slate-500">
          No coaches on the platform yet.
        </div>
      ) : (
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-slate-50 text-slate-600 uppercase text-xs">
              <tr>
                <th className="p-3 text-left">Coach</th>
                <th className="p-3 text-right">Orders</th>
                <th className="p-3 text-right">Total Gross</th>
                <th className="p-3 text-right">Paid Out</th>
                <th className="p-3 text-right">Pending</th>
                <th className="p-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {list.map(c => (
                <tr key={c.user.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => openDetail(c)} data-testid={`coach-earnings-row-${c.user.email}`}>
                  <td className="p-3">
                    <p className="font-semibold">{c.user.first_name} {c.user.last_name}</p>
                    <p className="text-xs text-slate-500">{c.user.email}</p>
                  </td>
                  <td className="p-3 text-right">{c.earnings.orders_count}</td>
                  <td className="p-3 text-right font-semibold">{fmt(c.earnings.gross_total)}</td>
                  <td className="p-3 text-right text-emerald-700">{fmt(c.earnings.total_paid_out)}</td>
                  <td className="p-3 text-right font-bold text-amber-700">{fmt(c.earnings.pending_payout)}</td>
                  <td className="p-3 text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="View & manage">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={closeDetail}>
          <div
            className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={e => e.stopPropagation()}
            data-testid="coach-earnings-modal"
          >
            <div className="sticky top-0 bg-white border-b p-5 flex items-center justify-between z-10">
              <div>
                <h2 className="text-xl font-black uppercase">{selected.user.first_name} {selected.user.last_name}</h2>
                <p className="text-xs text-slate-500">{selected.user.email}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={closeDetail}><X className="h-5 w-5" /></Button>
            </div>

            <div className="p-6 space-y-6">
              {detailLoading || !detail ? (
                <div className="grid place-items-center py-10"><Loader2 className="h-6 w-6 animate-spin text-sky-500" /></div>
              ) : (
                <>
                  {/* Earnings KPI */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Orders</p>
                      <p className="text-xl font-black">{detail.earnings.orders_count}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Total Gross</p>
                      <p className="text-xl font-black">{fmt(detail.earnings.gross_total)}</p>
                    </div>
                    <div className="bg-emerald-50 rounded-lg p-3">
                      <p className="text-[10px] uppercase tracking-widest text-emerald-700 font-bold mb-1">Paid Out</p>
                      <p className="text-xl font-black text-emerald-800">{fmt(detail.earnings.total_paid_out)}</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-3">
                      <p className="text-[10px] uppercase tracking-widest text-amber-700 font-bold mb-1">Pending</p>
                      <p className="text-xl font-black text-amber-800">{fmt(detail.earnings.pending_payout)}</p>
                    </div>
                  </div>

                  {/* Orders */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs uppercase tracking-widest text-slate-600 font-bold">
                        Orders attributed to this coach ({(detail.orders || []).length})
                      </h3>
                      {(detail.orders || []).length > 0 && (
                        <span className="text-[10px] text-slate-500">Paid orders only · Tick rows to include in a payout</span>
                      )}
                    </div>
                    <div className="border rounded-lg overflow-x-auto max-h-96 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] sticky top-0 z-10">
                          <tr>
                            <th className="p-2 w-8">
                              <Checkbox
                                checked={pendingOrders.length > 0 && pendingOrders.every(o => selectedOrderIds.includes(o.id))}
                                disabled={pendingOrders.length === 0}
                                onCheckedChange={toggleAll}
                                aria-label="Select all pending"
                                data-testid="coach-select-all-pending"
                              />
                            </th>
                            <th className="p-2 text-left">Status</th>
                            <th className="p-2 text-left">Order</th>
                            <th className="p-2 text-left">Date</th>
                            <th className="p-2 text-left">Customer</th>
                            <th className="p-2 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {(detail.orders || []).map(o => {
                            const paid = !!o.coach_payout_paid;
                            const isSelected = selectedOrderIds.includes(o.id);
                            return (
                              <tr
                                key={o.id}
                                className={`hover:bg-slate-50 ${paid ? 'bg-slate-50/50 text-slate-500' : ''} ${isSelected ? 'bg-emerald-50/60' : ''}`}
                                data-testid={`coach-order-row-${o.order_number}`}
                              >
                                <td className="p-2">
                                  {paid ? (
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                  ) : (
                                    <Checkbox
                                      checked={isSelected}
                                      onCheckedChange={(v) => toggleOrder(o, v)}
                                      data-testid={`coach-select-order-${o.order_number}`}
                                    />
                                  )}
                                </td>
                                <td className="p-2">
                                  {paid ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold text-[10px] uppercase tracking-wider">Paid</span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold text-[10px] uppercase tracking-wider">Pending</span>
                                  )}
                                </td>
                                <td className="p-2 font-mono font-bold text-sky-700">{o.order_number}</td>
                                <td className="p-2 text-slate-600">{dt(o.created_at)}</td>
                                <td className="p-2">
                                  <p className="font-semibold text-slate-900 leading-tight">{o.shipping_address?.first_name} {o.shipping_address?.last_name}</p>
                                  <p className="text-[10px] text-slate-500 truncate max-w-[160px]">{o.shipping_address?.email}</p>
                                </td>
                                <td className="p-2 text-right font-bold text-slate-900">{fmt(o.total)}</td>
                              </tr>
                            );
                          })}
                          {(detail.orders || []).length === 0 && (
                            <tr>
                              <td colSpan={6} className="p-6 text-center text-slate-500">
                                No paid orders attributed to this coach yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                        {(detail.orders || []).length > 0 && (
                          <tfoot className="bg-slate-50 font-bold sticky bottom-0">
                            <tr>
                              <td className="p-2" colSpan={5}>Total gross across attributed orders</td>
                              <td className="p-2 text-right">{fmt(detail.earnings.gross_total)}</td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                    {selectedOrderIds.length > 0 && (
                      <div className="mt-3 flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm">
                        <span className="text-emerald-900">
                          <strong>{selectedOrderIds.length}</strong> order{selectedOrderIds.length === 1 ? '' : 's'} selected · <strong>{fmt(payoutForm.amount)}</strong> total
                        </span>
                        <button
                          type="button"
                          onClick={() => { setSelectedOrderIds([]); setPayoutForm(f => ({ ...f, amount: '' })); }}
                          className="text-xs text-emerald-700 hover:underline"
                        >Clear selection</button>
                      </div>
                    )}
                  </div>

                  {/* Record payout */}
                  <div className="border-t pt-6">
                    <h3 className="text-xs uppercase tracking-widest text-slate-600 font-bold mb-3">Record a payout</h3>
                    <p className="text-xs text-slate-500 mb-3">
                      {selectedOrderIds.length > 0
                        ? <>Payout will settle <strong>{selectedOrderIds.length}</strong> selected order{selectedOrderIds.length === 1 ? '' : 's'} · they&apos;ll flip to <span className="text-emerald-700 font-semibold">Paid</span>. You can edit the amount below.</>
                        : <>Tick pending orders above to include them, or record a manual amount that doesn&apos;t link to specific orders.</>}
                    </p>
                    <div className="grid md:grid-cols-3 gap-3">
                      <div>
                        <Label>Amount (£)</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={payoutForm.amount}
                          onChange={e => setPayoutForm(f => ({ ...f, amount: e.target.value }))}
                          className="mt-1"
                          placeholder={Number(detail.earnings.pending_payout || 0).toFixed(2)}
                          data-testid="coach-payout-amount-input"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label>Note (optional)</Label>
                        <Input value={payoutForm.note} onChange={e => setPayoutForm(f => ({ ...f, note: e.target.value }))} className="mt-1" placeholder="e.g. Bank transfer March 2026" />
                      </div>
                    </div>
                    <Button
                      onClick={handlePayout}
                      disabled={savingPayout}
                      className="mt-3 bg-emerald-500 hover:bg-emerald-600 text-white gap-2"
                      data-testid="coach-record-payout-btn"
                    >
                      {savingPayout ? <Loader2 className="h-4 w-4 animate-spin" /> : <PoundSterling className="h-4 w-4" />}
                      {selectedOrderIds.length > 0
                        ? `Record payout for ${selectedOrderIds.length} order${selectedOrderIds.length === 1 ? '' : 's'}`
                        : 'Record payout'}
                    </Button>
                  </div>

                  {/* Payout history */}
                  <div className="border-t pt-6">
                    <h3 className="text-xs uppercase tracking-widest text-slate-600 font-bold mb-3">Payout history</h3>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-xs text-slate-600 uppercase">
                          <tr>
                            <th className="p-2 text-left">Date</th>
                            <th className="p-2 text-left">Orders</th>
                            <th className="p-2 text-left">Note</th>
                            <th className="p-2 text-right">Amount</th>
                            <th className="p-2"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {(detail.payouts || []).map(p => (
                            <tr key={p.id}>
                              <td className="p-2 text-xs">{dt(p.created_at)}</td>
                              <td className="p-2 text-xs text-slate-600 font-mono max-w-[220px] truncate" title={(p.order_numbers || []).join(', ')}>
                                {(p.order_numbers || []).length > 0
                                  ? (p.order_numbers.length <= 3
                                      ? p.order_numbers.join(', ')
                                      : `${p.order_numbers.slice(0, 2).join(', ')} +${p.order_numbers.length - 2} more`)
                                  : <span className="italic text-slate-400">Manual</span>}
                              </td>
                              <td className="p-2 text-xs text-slate-600">{p.note || '—'}</td>
                              <td className="p-2 text-right font-semibold">{fmt(p.amount)}</td>
                              <td className="p-2 text-right">
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:bg-red-50" onClick={() => handleDeletePayout(p.id)} title="Delete payout (reverts linked orders to Pending)">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                          {(detail.payouts || []).length === 0 && (
                            <tr><td colSpan={5} className="p-4 text-center text-slate-500 text-sm">No payouts recorded yet.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCoachEarnings;
