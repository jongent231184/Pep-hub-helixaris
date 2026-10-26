import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Products, resolveImage } from '../../lib/api';
import { Plus, Pencil, Trash2, Loader2, Eye, EyeOff, Check, Sparkles, Thermometer, PackagePlus } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { useToast } from '../../hooks/use-toast';
import { useStore } from '../../context/StoreContext';

const StockCell = ({ product, onUpdated }) => {
  const { toast } = useToast();
  const hasVariants = Array.isArray(product.variants) && product.variants.length > 0;
  const [value, setValue] = useState(String(product.stock ?? 0));
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => { setValue(String(product.stock ?? 0)); }, [product.stock]);

  if (hasVariants) {
    return (
      <div className="text-xs text-slate-500 italic" title="Managed on each variant">
        Per variant
      </div>
    );
  }

  const commit = async () => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      setValue(String(product.stock ?? 0));
      return;
    }
    if (n === Number(product.stock ?? 0)) return; // no change
    setSaving(true);
    try {
      await Products.update(product.id, { stock: n });
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1500);
      onUpdated?.(product.id, n);
    } catch (e) {
      toast({
        title: 'Stock update failed',
        description: String(e.response?.data?.detail || e.message),
        variant: 'destructive',
      });
      setValue(String(product.stock ?? 0));
    } finally {
      setSaving(false);
    }
  };

  const numeric = Number(value);
  const lowStock = Number.isFinite(numeric) && numeric >= 0 && numeric <= 3;

  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        min="0"
        step="1"
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
          if (e.key === 'Escape') { setValue(String(product.stock ?? 0)); e.currentTarget.blur(); }
        }}
        className={`h-8 w-20 text-center font-mono font-semibold ${lowStock ? 'text-amber-700 border-amber-300 bg-amber-50' : ''}`}
        data-testid={`stock-input-${product.slug}`}
        disabled={saving}
      />
      {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
      {justSaved && !saving && <Check className="h-3.5 w-3.5 text-emerald-600" />}
    </div>
  );
};

const AdminProducts = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const { toast } = useToast();
  const { refresh } = useStore();

  const load = () => {
    setLoading(true);
    Products.listAll().then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const onDelete = async (p) => {
    if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    try {
      await Products.remove(p.id);
      toast({ title: 'Product deleted' });
      load();
      refresh();
    } catch (e) {
      toast({ title: 'Delete failed', description: String(e.response?.data?.detail || e.message), variant: 'destructive' });
    }
  };

  const handleStockUpdated = (productId, newStock) => {
    setItems(prev => prev.map(p => p.id === productId ? { ...p, stock: newStock } : p));
    refresh();
  };

  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkStatus, setBulkStatus] = useState(null);

  // Poll job status while a bulk run is active (and once on mount to reflect
  // a run started from another admin tab).
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await Products.bulkGenerateResearchStatus();
        if (cancelled) return;
        setBulkStatus(s);
        setBulkGenerating(!!s.running);
      } catch {
        /* ignore */
      }
    };
    tick();
    const iv = setInterval(tick, 4000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  const [normalizingStorage, setNormalizingStorage] = useState(false);
  const [pack, setPack] = useState(null);
  const [importingPack, setImportingPack] = useState(false);
  useEffect(() => { Products.productPackStatus().then(setPack).catch(() => setPack(null)); }, []);

  const runImportPack = async () => {
    const n = pack?.missing?.length || 0;
    const np = pack?.need_profile?.length || 0;
    if (!n && !np) return;
    const msg = n
      ? `Add ${n} new vial product${n === 1 ? '' : 's'} (Cerebrolysin, ACE-031, Pinealon, PE-22-28, PEG-MGF, PNC-27, HCG, HMG, VIP, Reta/Cagri, Gonadorelin, P21)?\n\nThey are added with suggested prices, 5 in stock, visible on the site, a "New" badge and a ready-made Research Profile. Products already present are left untouched.`
      : `Attach the ready-made Research Profiles to ${np} new vial product${np === 1 ? '' : 's'} that don't have one yet? Nothing else is changed.`;
    if (!window.confirm(msg)) return;
    setImportingPack(true);
    try {
      const res = await Products.importProductPack();
      const added = res.profiles_added?.length || 0;
      toast({
        title: res.created.length ? `${res.created.length} products added` : `${added} research profiles attached`,
        description: res.created.length && added ? `${added} existing products also got their research profile.` : res.skipped.length && res.created.length ? `${res.skipped.length} already existed and were skipped.` : 'Review prices and stock, then you are done.',
      });
      setPack(await Products.productPackStatus());
      load();
    } catch (e) {
      toast({ title: 'Import failed', description: String(e.response?.data?.detail || e.message), variant: 'destructive' });
    } finally {
      setImportingPack(false);
    }
  };

  const runNormalizeStorage = async () => {
    if (!window.confirm(
      'Rewrite the "Storage & handling" text on every product to the canonical 2–8 °C refrigerated statement?\n\n' +
      'This does NOT touch any other Research Profile field. It only fixes inconsistent storage lines produced by earlier AI runs.'
    )) return;
    setNormalizingStorage(true);
    try {
      const res = await Products.normalizeResearchStorage();
      toast({ title: 'Storage text normalized', description: `Updated ${res.updated} of ${res.total} products.` });
    } catch (e) {
      toast({ title: 'Normalize failed', description: String(e.response?.data?.detail || e.message), variant: 'destructive' });
    } finally {
      setNormalizingStorage(false);
    }
  };

  const runBulkGenerate = async () => {
    if (!window.confirm(
      'This will use AI (Claude via Emergent LLM key) to generate a scientific Research Profile for every product that does not already have one.\n\n' +
      'Products with an existing profile are skipped.\n\n' +
      'The job runs in the background — you can leave this page and it will keep going. Continue?'
    )) return;
    setBulkGenerating(true);
    try {
      await Products.bulkGenerateResearchProfiles(false);
      toast({ title: 'Bulk generation started', description: 'Runs in the background — refresh occasionally to see progress.' });
    } catch (e) {
      setBulkGenerating(false);
      toast({ title: 'Could not start job', description: String(e.response?.data?.detail || e.message), variant: 'destructive' });
    }
  };

  const filtered = items
    .filter(p =>
      !query || p.name.toLowerCase().includes(query.toLowerCase()) || p.slug.includes(query.toLowerCase())
    )
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight">Products</h1>
        <div className="flex items-center gap-2">
          {pack && (pack.missing.length > 0 || (pack.need_profile || []).length > 0) && (
            <Button
              type="button"
              variant="outline"
              onClick={runImportPack}
              disabled={importingPack}
              data-testid="import-product-pack"
              className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            >
              {importingPack ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
              {importingPack ? 'Adding…' : pack.missing.length > 0 ? `Add new vials (${pack.missing.length})` : `Add research profiles (${pack.need_profile.length})`}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={runNormalizeStorage}
            disabled={normalizingStorage}
            data-testid="normalize-storage-handling"
            className="gap-2 border-sky-300 text-sky-700 hover:bg-sky-50"
          >
            {normalizingStorage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Thermometer className="h-4 w-4" />}
            {normalizingStorage ? 'Fixing…' : 'Fix storage text'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={runBulkGenerate}
            disabled={bulkGenerating}
            data-testid="bulk-generate-research-profiles"
            className="gap-2 border-purple-300 text-purple-700 hover:bg-purple-50"
          >
            {bulkGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {bulkGenerating ? 'Generating…' : 'AI-fill research profiles'}
          </Button>
          <Link to="/admin/products/new">
            <Button className="bg-sky-500 hover:bg-sky-600 text-white gap-2"><Plus className="h-4 w-4" /> New Product</Button>
          </Link>
        </div>
      </div>

      {bulkStatus && (bulkStatus.running || bulkStatus.updated > 0 || bulkStatus.failed > 0) && (
        <div
          data-testid="bulk-generate-status"
          className={`mb-4 rounded-lg px-4 py-3 border text-sm flex items-center gap-3 ${
            bulkStatus.running
              ? 'bg-purple-50 border-purple-200 text-purple-800'
              : bulkStatus.failed > 0
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-emerald-50 border-emerald-200 text-emerald-900'
          }`}
        >
          {bulkStatus.running && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
          <div className="flex-1">
            <p className="font-bold">
              {bulkStatus.running ? 'Research-profile job running…' : 'Research-profile job complete'}
            </p>
            <p className="text-xs">
              Updated <strong>{bulkStatus.updated}</strong> · Skipped <strong>{bulkStatus.skipped}</strong> · Failed <strong>{bulkStatus.failed}</strong> · Total <strong>{bulkStatus.total}</strong>
              {bulkStatus.last_slug && <> · Latest: <code>{bulkStatus.last_slug}</code></>}
            </p>
          </div>
        </div>
      )}

      <div className="mb-4">
        <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name or slug…" className="max-w-md" />
      </div>

      {loading ? (
        <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>
      ) : (
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-slate-50 text-slate-600 uppercase text-xs">
              <tr>
                <th className="p-3 text-left">Image</th>
                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-left">Category</th>
                <th className="p-3 text-left">Price</th>
                <th className="p-3 text-left">Stock</th>
                <th className="p-3 text-left">Visible</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="p-2">
                    {p.image ? (
                      <img src={resolveImage(p.image)} alt={p.name} className="h-12 w-12 object-contain bg-slate-50 rounded border" />
                    ) : (
                      <div className="h-12 w-12 bg-slate-100 rounded border" />
                    )}
                  </td>
                  <td className="p-3">
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-xs text-slate-500 font-mono">{p.slug}</p>
                  </td>
                  <td className="p-3 text-xs">{p.category}</td>
                  <td className="p-3 font-bold">{p.price > 0 ? `£${Number(p.price).toFixed(2)}` : <span className="text-slate-400 text-xs italic">{p.price_label || 'POA'}</span>}</td>
                  <td className="p-3">
                    <StockCell product={p} onUpdated={handleStockUpdated} />
                  </td>
                  <td className="p-3">{p.visible ? <Eye className="h-4 w-4 text-emerald-600" /> : <EyeOff className="h-4 w-4 text-slate-400" />}</td>
                  <td className="p-3 text-right">
                    <div className="flex gap-1 justify-end">
                      <Link to={`/admin/products/${p.id}`}><Button size="sm" variant="outline" className="h-8 px-2"><Pencil className="h-3.5 w-3.5" /></Button></Link>
                      <Button size="sm" variant="outline" onClick={() => onDelete(p)} className="h-8 px-2 text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-slate-500">No products found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminProducts;
