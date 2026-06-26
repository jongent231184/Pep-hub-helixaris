import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Products, resolveImage } from '../../lib/api';
import { Plus, Pencil, Trash2, Loader2, Eye, EyeOff } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { useToast } from '../../hooks/use-toast';
import { useStore } from '../../context/StoreContext';

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
    if (!window.confirm(`Delete “${p.name}”? This cannot be undone.`)) return;
    try {
      await Products.remove(p.id);
      toast({ title: 'Product deleted' });
      load();
      refresh();
    } catch (e) {
      toast({ title: 'Delete failed', description: String(e.response?.data?.detail || e.message), variant: 'destructive' });
    }
  };

  const filtered = items.filter(p =>
    !query || p.name.toLowerCase().includes(query.toLowerCase()) || p.slug.includes(query.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight">Products</h1>
        <Link to="/admin/products/new">
          <Button className="bg-sky-500 hover:bg-sky-600 text-white gap-2"><Plus className="h-4 w-4" /> New Product</Button>
        </Link>
      </div>

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
                <th className="p-3 text-left">Featured</th>
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
                  <td className="p-3">{p.featured ? <span className="text-emerald-600">✓</span> : <span className="text-slate-300">—</span>}</td>
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
