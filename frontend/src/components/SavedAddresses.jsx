import React, { useEffect, useState } from 'react';
import { Addresses } from '../lib/api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { useToast } from '../hooks/use-toast';
import { Loader2, Plus, Pencil, Trash2, Star } from 'lucide-react';

const empty = {
  label: '', first_name: '', last_name: '', phone: '',
  address1: '', address2: '', city: '', postcode: '',
  country: 'United Kingdom', is_default: false,
};

const AddressForm = ({ value, onChange }) => {
  const upd = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <div className="sm:col-span-2">
        <Label>Label (e.g. Home, Office)</Label>
        <Input value={value.label} onChange={upd('label')} className="mt-1" placeholder="Home" data-testid="address-label" />
      </div>
      <div><Label>First Name</Label><Input required value={value.first_name} onChange={upd('first_name')} className="mt-1" /></div>
      <div><Label>Last Name</Label><Input required value={value.last_name} onChange={upd('last_name')} className="mt-1" /></div>
      <div className="sm:col-span-2"><Label>Address Line 1</Label><Input required value={value.address1} onChange={upd('address1')} className="mt-1" /></div>
      <div className="sm:col-span-2"><Label>Address Line 2 (Optional)</Label><Input value={value.address2 || ''} onChange={upd('address2')} className="mt-1" /></div>
      <div><Label>City</Label><Input required value={value.city} onChange={upd('city')} className="mt-1" /></div>
      <div><Label>Postcode</Label><Input required value={value.postcode} onChange={upd('postcode')} className="mt-1" /></div>
      <div>
        <Label>Country</Label>
        <Select value={value.country} onValueChange={(v) => onChange({ ...value, country: v })}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="United Kingdom">United Kingdom</SelectItem>
            <SelectItem value="Ireland">Ireland</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div><Label>Phone (Optional)</Label><Input value={value.phone || ''} onChange={upd('phone')} className="mt-1" /></div>
    </div>
  );
};

const SavedAddresses = () => {
  const { toast } = useToast();
  const [addrs, setAddrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null); // address object or 'new'
  const [form, setForm] = useState(empty);

  const load = () => {
    setLoading(true);
    Addresses.mine().then(setAddrs).catch(() => setAddrs([])).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const startNew = () => { setEditing('new'); setForm(empty); };
  const startEdit = (a) => { setEditing(a); setForm({ ...empty, ...a }); };
  const closeEditor = () => { setEditing(null); setForm(empty); };

  const save = async () => {
    const required = ['first_name', 'last_name', 'address1', 'city', 'postcode', 'country'];
    for (const k of required) {
      if (!String(form[k] || '').trim()) {
        toast({ title: 'Missing field', description: `Please fill in ${k.replace('_', ' ')}`, variant: 'destructive' });
        return;
      }
    }
    setSaving(true);
    try {
      if (editing === 'new') await Addresses.create(form);
      else await Addresses.update(editing.id, form);
      toast({ title: 'Address saved' });
      closeEditor();
      load();
    } catch (e) {
      toast({ title: 'Save failed', description: String(e.response?.data?.detail || e.message), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const remove = async (a) => {
    if (!window.confirm(`Delete address "${a.label || a.address1}"?`)) return;
    try {
      await Addresses.remove(a.id);
      toast({ title: 'Address removed' });
      load();
    } catch (e) {
      toast({ title: 'Delete failed', description: String(e.response?.data?.detail || e.message), variant: 'destructive' });
    }
  };

  const setDefault = async (a) => {
    try {
      await Addresses.update(a.id, { is_default: true });
      load();
    } catch (e) {
      toast({ title: 'Update failed', description: String(e.response?.data?.detail || e.message), variant: 'destructive' });
    }
  };

  return (
    <div data-testid="saved-addresses-section">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold uppercase">Saved Addresses</h2>
        <Button onClick={startNew} className="bg-sky-500 hover:bg-sky-600 text-white gap-2" data-testid="add-address-btn">
          <Plus className="h-4 w-4" /> Add address
        </Button>
      </div>

      {loading ? (
        <div className="py-8 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-sky-500" /></div>
      ) : addrs.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-slate-500">
          No saved addresses yet. Add one to speed up your next checkout.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {addrs.map((a) => (
            <div key={a.id} className="border rounded-lg p-4 bg-white" data-testid={`address-card-${a.id}`}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold uppercase text-sm">{a.label || 'Address'}</p>
                  {a.is_default && (
                    <span className="text-[10px] font-bold uppercase bg-sky-500 text-white px-2 py-0.5 rounded flex items-center gap-1">
                      <Star className="h-3 w-3" /> Default
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => startEdit(a)} className="p-1 text-slate-500 hover:text-sky-600" title="Edit" data-testid={`edit-address-${a.id}`}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => remove(a)} className="p-1 text-slate-500 hover:text-red-600" title="Delete" data-testid={`delete-address-${a.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p className="font-semibold text-sm">{a.first_name} {a.last_name}</p>
              <p className="text-sm text-slate-600">{a.address1}</p>
              {a.address2 && <p className="text-sm text-slate-600">{a.address2}</p>}
              <p className="text-sm text-slate-600">{a.city}, {a.postcode}</p>
              <p className="text-sm text-slate-600">{a.country}</p>
              {a.phone && <p className="text-xs text-slate-500 mt-1">{a.phone}</p>}
              {!a.is_default && (
                <button onClick={() => setDefault(a)} className="mt-3 text-xs text-sky-600 hover:underline" data-testid={`set-default-${a.id}`}>
                  Set as default
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) closeEditor(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? 'Add address' : 'Edit address'}</DialogTitle>
          </DialogHeader>
          <AddressForm value={form} onChange={setForm} />
          <label className="flex items-center gap-2 text-sm mt-2 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={!!form.is_default}
              onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
              data-testid="set-default-checkbox"
            />
            Use as my default address
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={closeEditor}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-sky-500 hover:bg-sky-600 text-white" data-testid="save-address-btn">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save address'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SavedAddresses;
