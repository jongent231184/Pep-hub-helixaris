import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sales, resolveImage } from '../../lib/api';
import {
  BarChart3, Loader2, Search, X, TrendingUp, ShoppingBag, Package, DollarSign,
  Calendar, ExternalLink, Trophy,
} from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';

const fmtMoney = (n) => `£${Number(n || 0).toFixed(2)}`;
const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const KpiCard = ({ icon: Icon, label, value, sub, tone = 'sky' }) => {
  const toneMap = {
    sky: 'bg-sky-50 text-sky-700 border-sky-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    violet: 'bg-violet-50 text-violet-700 border-violet-100',
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-lg grid place-items-center border ${toneMap[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-widest font-bold text-slate-500">{label}</p>
          <p className="text-2xl font-black text-slate-900 leading-tight" data-testid={`sales-kpi-${label.toLowerCase().replace(/\s+/g,'-')}`}>{value}</p>
          {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  );
};

const StockPill = ({ stock }) => {
  if (stock === null || stock === undefined) return <span className="text-xs text-slate-400">—</span>;
  if (stock <= 1) return <span className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded">{stock} left</span>;
  if (stock <= 5) return <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">{stock}</span>;
  return <span className="text-xs font-semibold text-slate-700">{stock}</span>;
};

const StatusPill = ({ status, tone = 'slate' }) => (
  <span className={`inline-block text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded ${
    tone === 'emerald' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
    tone === 'amber' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
    tone === 'sky' ? 'bg-sky-50 text-sky-700 border border-sky-200' :
    'bg-slate-100 text-slate-700 border border-slate-200'
  }`}>{status}</span>
);

const orderStatusTone = (s) => ({
  pending: 'amber',
  processing: 'sky',
  shipped: 'sky',
  delivered: 'emerald',
  cancelled: 'slate',
}[s] || 'slate');

// -----------------------------------------------------------------------------
// Drill-down panel — orders that bought a single product/variant
// -----------------------------------------------------------------------------
const ProductDrillDown = ({ row, onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Sales.productOrders(row.product_id, row.option)
      .then(res => { if (alive) setData(res); })
      .catch(e => { if (alive) setErr(e?.response?.data?.detail || e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [row.product_id, row.option]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-white w-full max-w-5xl rounded-xl shadow-2xl my-8" data-testid="sales-drilldown">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 rounded-t-xl p-5 flex items-start gap-4">
          {row.image && (
            <img src={resolveImage(row.image)} alt="" className="h-16 w-16 rounded object-cover border border-slate-200" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-widest font-bold text-sky-600">Product KPI Pack</p>
            <h2 className="text-xl font-black text-slate-900 truncate">{row.name}</h2>
            {row.option && (
              <span className="inline-block mt-1 text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded">
                Variant: {row.option}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded hover:bg-slate-100 text-slate-500" data-testid="sales-drilldown-close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading && (
          <div className="p-10 text-center text-slate-500 text-sm">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" /> Loading order history…
          </div>
        )}

        {err && (
          <div className="p-10 text-center text-rose-600 text-sm">Failed to load: {err}</div>
        )}

        {!loading && data && (
          <>
            {/* KPI strip for this product */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-5 border-b border-slate-200 bg-slate-50/70">
              <KpiCard icon={ShoppingBag} label="Units Sold" value={data.units_sold} tone="emerald" />
              <KpiCard icon={DollarSign} label="Revenue" value={fmtMoney(data.revenue)} tone="sky" />
              <KpiCard icon={Package} label="Orders" value={data.orders_count} tone="violet" />
              <KpiCard icon={Calendar} label="Last Sold" value={fmtDate(data.last_sold_at)} sub={data.first_sold_at ? `First: ${fmtDate(data.first_sold_at)}` : null} tone="amber" />
            </div>

            {/* Orders list */}
            <div className="p-5">
              {data.orders.length === 0 ? (
                <p className="text-center text-sm text-slate-500 py-8">No paid orders yet.</p>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-widest text-slate-600">
                      <tr>
                        <th className="text-left px-3 py-2.5 font-bold">Order</th>
                        <th className="text-left px-3 py-2.5 font-bold">Date</th>
                        <th className="text-left px-3 py-2.5 font-bold">Customer</th>
                        <th className="text-right px-3 py-2.5 font-bold">Qty</th>
                        <th className="text-right px-3 py-2.5 font-bold">Unit £</th>
                        <th className="text-right px-3 py-2.5 font-bold">Line total</th>
                        <th className="text-left px-3 py-2.5 font-bold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.orders.map((o, idx) => (
                        <tr key={`${o.order_id}-${idx}`} className="hover:bg-slate-50">
                          <td className="px-3 py-2.5 font-mono text-xs">
                            <Link to={`/admin/orders/${o.order_id}`} className="text-sky-700 hover:underline inline-flex items-center gap-1 font-bold" data-testid={`drilldown-order-link-${o.order_number}`}>
                              #{o.order_number} <ExternalLink className="h-3 w-3" />
                            </Link>
                          </td>
                          <td className="px-3 py-2.5 text-slate-600">{fmtDate(o.created_at)}</td>
                          <td className="px-3 py-2.5">
                            <div className="text-slate-900 font-semibold">{o.customer_name || '—'}</div>
                            <div className="text-xs text-slate-500">{o.customer_email}</div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold">{o.qty}</td>
                          <td className="px-3 py-2.5 text-right font-mono">{fmtMoney(o.unit_price)}</td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900">{fmtMoney(o.line_total)}</td>
                          <td className="px-3 py-2.5">
                            <StatusPill status={o.status} tone={orderStatusTone(o.status)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// Main sales page
// -----------------------------------------------------------------------------
const AdminSales = () => {
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([Sales.summary(), Sales.products()])
      .then(([s, p]) => {
        if (!alive) return;
        setSummary(s);
        setRows(p.rows || []);
      })
      .catch(e => { if (alive) setErr(e?.response?.data?.detail || e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const filteredRows = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter(r =>
      (r.name || '').toLowerCase().includes(q) ||
      (r.option || '').toLowerCase().includes(q) ||
      (r.slug || '').toLowerCase().includes(q)
    );
  }, [rows, query]);

  return (
    <div className="space-y-6" data-testid="admin-sales-page">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-sky-100 text-sky-700 grid place-items-center border border-sky-200">
          <BarChart3 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-3xl font-black uppercase text-slate-900 tracking-tight">Sales</h1>
          <p className="text-sm text-slate-500">All-time bestsellers, revenue and per-product drill-down. Only paid orders are counted.</p>
        </div>
      </div>

      {/* Store-wide KPIs */}
      {loading ? (
        <div className="p-6 text-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
      ) : err ? (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded text-sm text-rose-700">Failed to load sales: {err}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard icon={DollarSign} label="Revenue" value={fmtMoney(summary?.revenue)} tone="emerald" />
            <KpiCard icon={ShoppingBag} label="Orders" value={summary?.orders ?? 0} tone="sky" />
            <KpiCard icon={Package} label="Units Sold" value={summary?.units_sold ?? 0} tone="violet" />
            <KpiCard icon={TrendingUp} label="Avg Order" value={fmtMoney(summary?.avg_order_value)} tone="amber" />
          </div>

          {/* Search */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
            <Search className="h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by product name, variant or slug…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="border-0 shadow-none focus-visible:ring-0 h-9 px-0"
              data-testid="sales-search-input"
            />
            {query && (
              <Button variant="ghost" size="sm" onClick={() => setQuery('')} className="text-xs">Clear</Button>
            )}
          </div>

          {/* Bestsellers table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50/60">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-800">Bestsellers</h2>
              </div>
              <span className="text-xs text-slate-500">{filteredRows.length} of {rows.length}</span>
            </div>

            {filteredRows.length === 0 ? (
              <div className="p-10 text-center text-slate-500 text-sm">
                {rows.length === 0 ? 'No paid orders yet. Once a customer completes a purchase, this table will populate.' : 'No matches for that search.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-widest text-slate-600">
                    <tr>
                      <th className="text-left px-4 py-3 font-bold w-10">#</th>
                      <th className="text-left px-4 py-3 font-bold">Product / Variant</th>
                      <th className="text-right px-4 py-3 font-bold">Units Sold</th>
                      <th className="text-right px-4 py-3 font-bold">Revenue</th>
                      <th className="text-right px-4 py-3 font-bold">Orders</th>
                      <th className="text-right px-4 py-3 font-bold">Stock Left</th>
                      <th className="text-left px-4 py-3 font-bold">Last Sold</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.map((r, idx) => (
                      <tr
                        key={`${r.product_id}-${r.option || 'default'}`}
                        onClick={() => setSelected(r)}
                        className="hover:bg-sky-50 cursor-pointer transition-colors"
                        data-testid={`sales-row-${r.slug}${r.option ? '-' + r.option.replace(/\s+/g,'-') : ''}`}
                      >
                        <td className="px-4 py-3 text-slate-400 font-mono text-xs">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {r.image && (
                              <img src={resolveImage(r.image)} alt="" className="h-10 w-10 rounded object-cover border border-slate-200" />
                            )}
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 truncate">{r.name}</div>
                              {r.option && (
                                <div className="text-xs text-slate-500 mt-0.5">
                                  <span className="inline-block bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 font-semibold">{r.option}</span>
                                </div>
                              )}
                              {!r.product_visible && (
                                <div className="text-[10px] uppercase tracking-widest font-bold text-rose-600 mt-0.5">Hidden</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-black text-slate-900">{r.units_sold}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">{fmtMoney(r.revenue)}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-600">{r.orders_count}</td>
                        <td className="px-4 py-3 text-right"><StockPill stock={r.current_stock} /></td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{fmtDate(r.last_sold_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {selected && <ProductDrillDown row={selected} onClose={() => setSelected(null)} />}
    </div>
  );
};

export default AdminSales;
