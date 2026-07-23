import React, { useEffect, useState } from 'react';
import { Coas, Uploads, resolveImage } from '../../lib/api';
import { Loader2, Plus, Trash2, Upload, FileText, Image as ImageIcon, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Button } from '../../components/ui/button';
import { Switch } from '../../components/ui/switch';
import { useToast } from '../../hooks/use-toast';

const EMPTY_FORM = {
  title: '',
  product_name: '',
  batch_number: '',
  test_date: '',
  notes: '',
  file_url: '',
  file_type: 'pdf',
  visible: true,
  sort_order: 0,
};

const AdminCoas = () => {
  const { toast } = useToast();
  const [coas, setCoas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  const load = () => {
    setLoading(true);
    Coas.listAll().then(setCoas).catch(() => setCoas([])).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await Uploads.uploadDocument(file);
      setForm(f => ({ ...f, file_url: res.url, file_type: res.file_type }));
      toast({ title: 'File uploaded', description: file.name });
    } catch (err) {
      toast({ title: 'Upload failed', description: String(err.response?.data?.detail || err.message), variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast({ title: 'Title is required', variant: 'destructive' });
      return;
    }
    if (!form.file_url) {
      toast({ title: 'Please upload a file first', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      await Coas.create({
        ...form,
        title: form.title.trim(),
        sort_order: Number(form.sort_order) || 0,
      });
      setForm(EMPTY_FORM);
      toast({ title: 'COA added' });
      load();
    } catch (err) {
      toast({ title: 'Create failed', description: String(err.response?.data?.detail || err.message), variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (c) => {
    if (!window.confirm(`Delete "${c.title}"? This cannot be undone.`)) return;
    setDeletingId(c.id);
    try {
      await Coas.remove(c.id);
      setCoas(prev => prev.filter(x => x.id !== c.id));
      toast({ title: 'COA deleted' });
    } catch (err) {
      toast({ title: 'Delete failed', description: String(err.response?.data?.detail || err.message), variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleVisible = async (c) => {
    setTogglingId(c.id);
    try {
      const updated = await Coas.update(c.id, { visible: !c.visible });
      setCoas(prev => prev.map(x => x.id === c.id ? updated : x));
    } catch (err) {
      toast({ title: 'Update failed', description: String(err.response?.data?.detail || err.message), variant: 'destructive' });
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <h1 className="text-2xl md:text-3xl font-black uppercase">Certificates of Analysis</h1>
        <a href="/coa" target="_blank" rel="noreferrer" className="text-xs uppercase tracking-widest text-sky-600 hover:underline inline-flex items-center gap-1">
          <ExternalLink className="h-3.5 w-3.5" /> View public gallery
        </a>
      </div>

      {/* Create form */}
      <div className="bg-white border rounded-lg p-6 mb-8">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600 mb-4">Add a new COA</h2>
        <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-6">
          <div className="md:col-span-3">
            <Label>Title *</Label>
            <Input
              required
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Retatrutide 10mg — Batch A231"
              className="mt-1"
              data-testid="coa-title-input"
            />
          </div>
          <div className="md:col-span-3">
            <Label>Product name (optional)</Label>
            <Input
              value={form.product_name}
              onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))}
              placeholder="e.g. Retatrutide 10mg"
              className="mt-1"
            />
          </div>
          <div className="md:col-span-2">
            <Label>Batch number (optional)</Label>
            <Input
              value={form.batch_number}
              onChange={e => setForm(f => ({ ...f, batch_number: e.target.value }))}
              placeholder="e.g. A231"
              className="mt-1 font-mono"
            />
          </div>
          <div className="md:col-span-2">
            <Label>Test date (optional)</Label>
            <Input
              type="date"
              value={form.test_date}
              onChange={e => setForm(f => ({ ...f, test_date: e.target.value }))}
              className="mt-1"
            />
          </div>
          <div className="md:col-span-2">
            <Label>Sort order (optional)</Label>
            <Input
              type="number"
              value={form.sort_order}
              onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))}
              placeholder="0"
              className="mt-1"
            />
          </div>
          <div className="md:col-span-6">
            <Label>Notes (optional)</Label>
            <Textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Purity, testing lab, additional context…"
              rows={2}
              className="mt-1"
            />
          </div>

          {/* File upload */}
          <div className="md:col-span-6">
            <Label>File (PDF or image, max 20 MB) *</Label>
            <div className="mt-1 border-2 border-dashed border-slate-300 rounded-lg p-4 flex items-center gap-4">
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={e => handleFile(e.target.files?.[0])}
                className="hidden"
                id="coa-file-input"
                data-testid="coa-file-input"
              />
              <label htmlFor="coa-file-input" className="cursor-pointer">
                <Button type="button" variant="outline" className="gap-2" disabled={uploading} asChild>
                  <span>
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    Choose file
                  </span>
                </Button>
              </label>
              {form.file_url ? (
                <div className="flex items-center gap-3 text-sm">
                  {form.file_type === 'pdf' ? (
                    <FileText className="h-6 w-6 text-red-500" />
                  ) : (
                    <img src={resolveImage(form.file_url)} alt="preview" className="h-10 w-10 object-cover rounded border" />
                  )}
                  <a href={resolveImage(form.file_url)} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline inline-flex items-center gap-1">
                    Preview <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              ) : (
                <p className="text-xs text-slate-500">No file chosen</p>
              )}
            </div>
          </div>

          <div className="md:col-span-3 flex items-center gap-2 pt-1">
            <Switch checked={form.visible} onCheckedChange={v => setForm(f => ({ ...f, visible: v }))} id="coa-visible" />
            <Label htmlFor="coa-visible">Visible on public gallery</Label>
          </div>
          <div className="md:col-span-3">
            <Button
              type="submit"
              disabled={creating || !form.file_url}
              className="w-full bg-sky-500 hover:bg-sky-600 text-white h-11 gap-2"
              data-testid="create-coa-btn"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add COA
            </Button>
          </div>
        </form>
      </div>

      {/* List */}
      {loading ? (
        <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>
      ) : (
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-slate-50 text-slate-600 uppercase text-xs">
              <tr>
                <th className="p-3 text-left">Type</th>
                <th className="p-3 text-left">Title</th>
                <th className="p-3 text-left">Product</th>
                <th className="p-3 text-left">Batch</th>
                <th className="p-3 text-left">Date</th>
                <th className="p-3 text-center">Visible</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {coas.map(c => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="p-3">
                    {c.file_type === 'pdf' ? (
                      <FileText className="h-5 w-5 text-red-500" />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-blue-500" />
                    )}
                  </td>
                  <td className="p-3 font-semibold">{c.title}</td>
                  <td className="p-3 text-xs text-slate-600">{c.product_name || '—'}</td>
                  <td className="p-3 font-mono text-xs">{c.batch_number || '—'}</td>
                  <td className="p-3 text-xs">{c.test_date || '—'}</td>
                  <td className="p-3 text-center">
                    <Switch
                      checked={c.visible}
                      disabled={togglingId === c.id}
                      onCheckedChange={() => handleToggleVisible(c)}
                    />
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex gap-1 justify-end">
                      <a href={resolveImage(c.file_url)} target="_blank" rel="noreferrer">
                        <Button type="button" size="sm" variant="outline" className="h-8 px-2" title="View file">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(c)}
                        disabled={deletingId === c.id}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 w-8"
                        data-testid={`delete-coa-${c.id}`}
                      >
                        {deletingId === c.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {coas.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-slate-500">
                  No COAs yet. Add your first one above.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminCoas;
