import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Products, Categories, Uploads, resolveImage } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { ArrowLeft, Loader2, Upload, X, Plus } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import { useStore } from '../../context/StoreContext';

const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const empty = {
  slug: '', name: '', category: '', price: 0, was_price: null, price_label: '',
  image: '', images: [], description: '', tagline: '', badge: '',
  options: [], variants: [], stock: 999, visible: true, featured: false,
};

const AdminProductForm = () => {
  const { productId } = useParams();
  const isEdit = Boolean(productId);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { refresh } = useStore();

  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(empty);
  const [variants, setVariants] = useState([]); // [{label, price}]
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    Categories.listAll().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    Products.getById(productId).then((p) => {
      setForm({ ...empty, ...p });
      // Prefer new variants; migrate legacy options → variants at product.price
      if (p.variants && p.variants.length > 0) {
        setVariants(p.variants.map(v => ({
          label: v.label,
          price: Number(v.price ?? 0),
          stock: v.stock === null || v.stock === undefined ? '' : String(v.stock),
          vial_strength_mg: v.vial_strength_mg == null ? '' : String(v.vial_strength_mg),
        })));
      } else if (p.options && p.options.length > 0) {
        setVariants(p.options.map(o => ({ label: o, price: Number(p.price || 0), stock: '', vial_strength_mg: '' })));
      } else {
        setVariants([]);
      }
    }).catch(() => {
      toast({ title: 'Product not found', variant: 'destructive' });
      navigate('/admin/products');
    }).finally(() => setLoading(false));
  }, [productId, isEdit, navigate, toast]);

  const addVariant = () => setVariants(v => [...v, { label: '', price: Number(form.price) || 0, stock: '', vial_strength_mg: '' }]);
  const updateVariant = (idx, patch) => setVariants(v => v.map((row, i) => i === idx ? { ...row, ...patch } : row));
  const removeVariant = (idx) => setVariants(v => v.filter((_, i) => i !== idx));

  const onField = (k) => (e) => {
    const v = e.target?.value ?? e;
    setForm(f => ({ ...f, [k]: v }));
  };

  const onNumField = (k) => (e) => {
    const v = e.target.value;
    setForm(f => ({ ...f, [k]: v === '' ? null : Number(v) }));
  };

  const handleNameChange = (e) => {
    const name = e.target.value;
    setForm(f => ({ ...f, name, slug: f.slug && isEdit ? f.slug : slugify(name) }));
  };

  const upload = async (file) => {
    setUploading(true);
    try {
      const { url } = await Uploads.upload(file);
      setForm(f => ({ ...f, image: url }));
      toast({ title: 'Image uploaded' });
    } catch (e) {
      toast({ title: 'Upload failed', description: String(e.response?.data?.detail || e.message), variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const cleanVariants = variants
      .map(v => ({
        label: (v.label || '').trim(),
        price: Number(v.price) || 0,
        stock: v.stock === '' || v.stock === null || v.stock === undefined ? null : Math.max(0, parseInt(v.stock, 10) || 0),
        vial_strength_mg: v.vial_strength_mg === '' || v.vial_strength_mg == null ? null : Number(v.vial_strength_mg),
      }))
      .filter(v => v.label);
    const payload = {
      ...form,
      variants: cleanVariants,
      // Keep legacy options in sync so older clients still see labels
      options: cleanVariants.map(v => v.label),
      price: Number(form.price) || 0,
      was_price: form.was_price === null || form.was_price === '' ? null : Number(form.was_price),
    };
    try {
      if (isEdit) {
        await Products.update(productId, payload);
      } else {
        await Products.create(payload);
      }
      toast({ title: isEdit ? 'Product updated' : 'Product created' });
      refresh();
      navigate('/admin/products');
    } catch (err) {
      toast({ title: 'Save failed', description: String(err.response?.data?.detail || err.message), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>;
  }

  return (
    <div className="max-w-3xl">
      <Link to="/admin/products" className="text-sm text-sky-600 hover:underline flex items-center gap-1 mb-3"><ArrowLeft className="h-3.5 w-3.5" /> Back to products</Link>
      <h1 className="text-2xl md:text-3xl font-black uppercase mb-6">{isEdit ? 'Edit Product' : 'New Product'}</h1>

      <form onSubmit={submit} className="space-y-6 bg-white border rounded-lg p-6">
        <div>
          <Label>Name</Label>
          <Input required value={form.name} onChange={handleNameChange} className="mt-1" />
        </div>
        <div>
          <Label>Slug</Label>
          <Input required value={form.slug} onChange={e => setForm(f => ({ ...f, slug: slugify(e.target.value) }))} className="mt-1 font-mono text-sm" />
          <p className="text-xs text-slate-500 mt-1">URL: /{form.category}/{form.slug}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Category</Label>
            <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {categories.map(c => <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tagline (optional)</Label>
            <Input value={form.tagline || ''} onChange={onField('tagline')} className="mt-1" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label>Price (£)</Label>
            <Input type="number" step="0.01" min="0" value={form.price ?? 0} onChange={onNumField('price')} className="mt-1" />
          </div>
          <div>
            <Label>Was Price (£)</Label>
            <Input type="number" step="0.01" min="0" value={form.was_price ?? ''} onChange={onNumField('was_price')} className="mt-1" />
          </div>
          <div>
            <Label>Stock</Label>
            <Input type="number" min="0" value={form.stock ?? 0} onChange={onNumField('stock')} className="mt-1" />
          </div>
        </div>

        <div>
          <Label>Price label (shown if price = 0)</Label>
          <Input value={form.price_label || ''} onChange={onField('price_label')} placeholder="e.g. Email for wholesale pricing" className="mt-1" />
        </div>

        <div>
          <Label>Badge (optional)</Label>
          <Input value={form.badge || ''} onChange={onField('badge')} placeholder="Popular, Great Value, Special Offer…" className="mt-1" />
        </div>

        <div>
          <Label>Description</Label>
          <Textarea value={form.description || ''} onChange={onField('description')} rows={5} className="mt-1" />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Variants (optional)</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addVariant}
              data-testid="add-variant-btn"
              className="gap-1"
            >
              <Plus className="h-3.5 w-3.5" /> Add variant
            </Button>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Each variant has its own price. Stock is optional per variant — leave blank to use the product base stock ({form.stock ?? 0}). Vial (mg) is used by the coach vial-calculator for peptides.
          </p>
          {variants.length === 0 ? (
            <div className="text-xs text-slate-400 italic border border-dashed rounded p-4 text-center">
              No variants — customers will pay the base price of £{Number(form.price || 0).toFixed(2)}.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr,110px,90px,110px,40px] gap-2 text-xs uppercase tracking-wide text-slate-500 px-1">
                <div>Label</div>
                <div>Price (£)</div>
                <div>Stock</div>
                <div>Vial mg <span className="normal-case font-normal text-slate-400">(peptides only)</span></div>
                <div></div>
              </div>
              {variants.map((v, i) => (
                <div key={i} className="grid grid-cols-[1fr,110px,90px,110px,40px] gap-2 items-center">
                  <Input
                    value={v.label}
                    onChange={e => updateVariant(i, { label: e.target.value })}
                    placeholder="e.g. 5mg"
                    className="font-mono text-sm"
                    data-testid={`variant-label-${i}`}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={v.price}
                    onChange={e => updateVariant(i, { price: e.target.value })}
                    placeholder="0.00"
                    data-testid={`variant-price-${i}`}
                  />
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    value={v.stock ?? ''}
                    onChange={e => updateVariant(i, { stock: e.target.value })}
                    placeholder="—"
                    data-testid={`variant-stock-${i}`}
                  />
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={v.vial_strength_mg ?? ''}
                    onChange={e => updateVariant(i, { vial_strength_mg: e.target.value })}
                    placeholder="—"
                    title="mg per vial — used by the coach vial calculator (leave blank for pens & non-peptide products)"
                    data-testid={`variant-vial-${i}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeVariant(i)}
                    className="text-red-600 hover:bg-red-50 h-9 w-9"
                    data-testid={`remove-variant-${i}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <Label>Product Image</Label>
          <div className="mt-2 flex items-start gap-4">
            {form.image && (
              <div className="relative">
                <img src={resolveImage(form.image)} alt="preview" className="w-32 h-32 object-contain border rounded bg-slate-50" />
                <button type="button" onClick={() => setForm(f => ({ ...f, image: '' }))} className="absolute -top-2 -right-2 bg-white border rounded-full h-6 w-6 grid place-items-center text-red-600 hover:bg-red-50"><X className="h-3 w-3" /></button>
              </div>
            )}
            <label className="flex-1 border-2 border-dashed border-slate-300 rounded-lg p-6 text-center cursor-pointer hover:border-sky-400 hover:bg-sky-50 transition-colors">
              <input type="file" accept="image/*" hidden onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
              {uploading ? (
                <div className="flex items-center justify-center gap-2 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</div>
              ) : (
                <div className="text-slate-600">
                  <Upload className="h-6 w-6 mx-auto mb-2" />
                  <p className="text-sm font-medium">Click to upload image</p>
                  <p className="text-xs">PNG / JPG / WEBP, max 8MB</p>
                </div>
              )}
            </label>
          </div>
          <p className="text-xs text-slate-500 mt-2">Or paste a URL:</p>
          <Input value={form.image || ''} onChange={onField('image')} placeholder="https://..." className="mt-1" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center justify-between border rounded p-4">
            <div>
              <Label className="cursor-pointer">Visible on storefront</Label>
              <p className="text-xs text-slate-500">Hide to keep as draft</p>
            </div>
            <Switch checked={form.visible} onCheckedChange={v => setForm(f => ({ ...f, visible: v }))} />
          </div>
          <div className="flex items-center justify-between border rounded p-4">
            <div>
              <Label className="cursor-pointer">Featured on home</Label>
              <p className="text-xs text-slate-500">Show in Latest Products</p>
            </div>
            <Switch checked={form.featured} onCheckedChange={v => setForm(f => ({ ...f, featured: v }))} />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Link to="/admin/products"><Button variant="outline" type="button">Cancel</Button></Link>
          <Button type="submit" disabled={saving} className="bg-sky-500 hover:bg-sky-600 text-white">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (isEdit ? 'Save changes' : 'Create product')}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default AdminProductForm;
