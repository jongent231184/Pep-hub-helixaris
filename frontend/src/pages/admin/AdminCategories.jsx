import React, { useEffect, useState } from 'react';
import { Categories, Uploads, resolveImage } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Plus, Pencil, Trash2, Loader2, Upload, X } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import { useStore } from '../../context/StoreContext';

const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const empty = { slug: '', name: '', image: '', sort_order: 0, visible: true };

const AdminCategories = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { refresh } = useStore();

  const load = () => {
    setLoading(true);
    Categories.listAll().then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (c) => { setEditing(c); setForm({ ...c }); setOpen(true); };

  const onUpload = async (file) => {
    setUploading(true);
    try {
      const { url } = await Uploads.upload(file);
      setForm(f => ({ ...f, image: url }));
    } catch (e) {
      toast({ title: 'Upload failed', description: String(e.response?.data?.detail || e.message), variant: 'destructive' });
    } finally { setUploading(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form, sort_order: Number(form.sort_order) || 0 };
      if (editing) await Categories.update(editing.id, payload);
      else await Categories.create(payload);
      toast({ title: editing ? 'Category updated' : 'Category created' });
      setOpen(false);
      load();
      refresh();
    } catch (e) {
      toast({ title: 'Save failed', description: String(e.response?.data?.detail || e.message), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete “${c.name}”?`)) return;
    try {
      await Categories.remove(c.id);
      toast({ title: 'Category deleted' });
      load(); refresh();
    } catch (e) {
      toast({ title: 'Delete failed', description: String(e.response?.data?.detail || e.message), variant: 'destructive' });
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight">Categories</h1>
        <Button onClick={openNew} className="bg-sky-500 hover:bg-sky-600 text-white gap-2"><Plus className="h-4 w-4" /> New</Button>
      </div>

      {loading ? (
        <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>
      ) : (
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="bg-slate-50 text-slate-600 uppercase text-xs">
              <tr>
                <th className="p-3 text-left">Image</th>
                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-left">Slug</th>
                <th className="p-3 text-left">Order</th>
                <th className="p-3 text-left">Visible</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map(c => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="p-2">{c.image ? <img src={resolveImage(c.image)} alt={c.name} className="h-12 w-12 object-cover rounded border" /> : <div className="h-12 w-12 bg-slate-100 rounded border" />}</td>
                  <td className="p-3 font-semibold">{c.name}</td>
                  <td className="p-3 font-mono text-xs">{c.slug}</td>
                  <td className="p-3">{c.sort_order}</td>
                  <td className="p-3">{c.visible ? <span className="text-emerald-600">✓</span> : <span className="text-slate-300">—</span>}</td>
                  <td className="p-3 text-right">
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="outline" onClick={() => openEdit(c)} className="h-8 px-2"><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="outline" onClick={() => remove(c)} className="h-8 px-2 text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-500">No categories.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit category' : 'New category'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value, slug: editing ? f.slug : slugify(e.target.value) }))} className="mt-1" />
            </div>
            <div>
              <Label>Slug</Label>
              <Input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: slugify(e.target.value) }))} className="mt-1 font-mono text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-4 items-end">
              <div>
                <Label>Sort order</Label>
                <Input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))} className="mt-1" />
              </div>
              <div className="flex items-center justify-between border rounded p-3">
                <Label className="cursor-pointer">Visible</Label>
                <Switch checked={form.visible} onCheckedChange={v => setForm(f => ({ ...f, visible: v }))} />
              </div>
            </div>
            <div>
              <Label>Image</Label>
              <div className="mt-2 flex items-start gap-3">
                {form.image && (
                  <div className="relative">
                    <img src={resolveImage(form.image)} alt="" className="w-24 h-24 object-cover border rounded" />
                    <button type="button" onClick={() => setForm(f => ({ ...f, image: '' }))} className="absolute -top-2 -right-2 bg-white border rounded-full h-6 w-6 grid place-items-center text-red-600"><X className="h-3 w-3" /></button>
                  </div>
                )}
                <label className="flex-1 border-2 border-dashed rounded p-4 text-center cursor-pointer hover:border-sky-400">
                  <input type="file" accept="image/*" hidden onChange={e => e.target.files?.[0] && onUpload(e.target.files[0])} />
                  {uploading ? <Loader2 className="h-5 w-5 mx-auto animate-spin" /> : <><Upload className="h-5 w-5 mx-auto mb-1" /><p className="text-xs">Upload image</p></>}
                </label>
              </div>
              <Input value={form.image} onChange={e => setForm(f => ({ ...f, image: e.target.value }))} placeholder="Or paste URL" className="mt-2 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-sky-500 hover:bg-sky-600 text-white">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminCategories;
