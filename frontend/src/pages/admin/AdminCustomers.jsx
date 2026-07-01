import React, { useEffect, useState } from 'react';
import { Admin, Auth } from '../../lib/api';
import { Loader2, KeyRound } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { useToast } from '../../hooks/use-toast';

const AdminCustomers = () => {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [target, setTarget] = useState(null);
  const [newPw, setNewPw] = useState('');
  const [generated, setGenerated] = useState('');
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    Admin.customers().then(setList).catch(() => setList([])).finally(() => setLoading(false));
  }, []);

  const filtered = list.filter(u => !q || u.email.toLowerCase().includes(q.toLowerCase()) || `${u.first_name} ${u.last_name}`.toLowerCase().includes(q.toLowerCase()));

  const openReset = (u) => { setTarget(u); setNewPw(''); setGenerated(''); };

  const doReset = async () => {
    setBusy(true);
    try {
      const payload = { user_id: target.id };
      if (newPw) payload.new_password = newPw;
      const res = await Auth.adminResetPassword(payload);
      if (res.temp_password) {
        setGenerated(res.temp_password);
      } else {
        toast({ title: 'Password reset', description: `${target.email}: password updated.` });
        setTarget(null);
      }
    } catch (e) {
      toast({ title: 'Reset failed', description: String(e.response?.data?.detail || e.message), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-black uppercase mb-6">Customers</h1>
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search email or name…" className="max-w-md mb-4" />
      {loading ? (
        <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>
      ) : (
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="bg-slate-50 text-slate-600 uppercase text-xs">
              <tr><th className="p-3 text-left">Name</th><th className="p-3 text-left">Email</th><th className="p-3 text-left">Registered</th><th className="p-3 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(u => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="p-3 font-semibold">{(u.first_name || u.last_name) ? `${u.first_name} ${u.last_name}`.trim() : <span className="text-slate-400 italic">—</span>}</td>
                  <td className="p-3">{u.email}</td>
                  <td className="p-3 text-xs">{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                  <td className="p-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => openReset(u)} className="h-8 gap-1"><KeyRound className="h-3.5 w-3.5" /> Reset password</Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-500">No customers yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!target} onOpenChange={(v) => !v && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password for {target?.email}</DialogTitle>
          </DialogHeader>
          {generated ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-700">Temporary password generated. Share it with the customer securely — it will not be shown again:</p>
              <div className="bg-slate-100 rounded p-3 font-mono text-lg text-center break-all select-all">{generated}</div>
              <p className="text-xs text-slate-500">Ask the customer to change this password on next login via their Account page.</p>
              <Button className="w-full" onClick={() => setTarget(null)}>Done</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label>Set new password (or leave blank to auto-generate)</Label>
                <Input type="text" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Leave blank to auto-generate" className="mt-1" />
                <p className="text-xs text-slate-500 mt-1">Min 8 characters if provided.</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button>
                <Button onClick={doReset} disabled={busy} className="bg-sky-500 hover:bg-sky-600 text-white">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reset password'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminCustomers;
