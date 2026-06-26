import React, { useEffect, useState } from 'react';
import { Admin } from '../../lib/api';
import { Loader2 } from 'lucide-react';
import { Input } from '../../components/ui/input';

const AdminCustomers = () => {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    Admin.customers().then(setList).catch(() => setList([])).finally(() => setLoading(false));
  }, []);

  const filtered = list.filter(u => !q || u.email.toLowerCase().includes(q.toLowerCase()) || `${u.first_name} ${u.last_name}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-black uppercase mb-6">Customers</h1>
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search email or name…" className="max-w-md mb-4" />
      {loading ? (
        <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>
      ) : (
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead className="bg-slate-50 text-slate-600 uppercase text-xs">
              <tr><th className="p-3 text-left">Name</th><th className="p-3 text-left">Email</th><th className="p-3 text-left">Registered</th></tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(u => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="p-3 font-semibold">{(u.first_name || u.last_name) ? `${u.first_name} ${u.last_name}`.trim() : <span className="text-slate-400 italic">—</span>}</td>
                  <td className="p-3">{u.email}</td>
                  <td className="p-3 text-xs">{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={3} className="p-8 text-center text-slate-500">No customers yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminCustomers;
