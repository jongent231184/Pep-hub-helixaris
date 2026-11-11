import React, { useEffect, useState } from 'react';
import { Coaches } from '../../lib/api';
import { toast } from 'sonner';
import { Camera, Trash2, Loader2, Award, Download } from 'lucide-react';

// Authenticated <img>: photos are private, so fetch as blob with the bearer token.
export const PrivatePhoto = ({ id, alt, className }) => {
  const [src, setSrc] = useState(null);
  useEffect(() => { let url; Coaches.photoBlob(id).then(u => { url = u; setSrc(u); }).catch(() => {}); return () => url && URL.revokeObjectURL(url); }, [id]);
  return src ? <img src={src} alt={alt} className={className} /> : <div className={`${className} bg-slate-100 animate-pulse`} />;
};

export const PhotosPanel = ({ readOnly = false, fetchPhotos, selectable = false, selected = [], onToggle }) => {
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(false);
  const [caption, setCaption] = useState('');
  const load = () => (fetchPhotos ? fetchPhotos() : Coaches.myPhotos()).then(setList).catch(() => {});
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try { await Coaches.uploadMyPhoto(file, caption, new Date().toISOString().slice(0, 10)); setCaption(''); toast.success('Photo added'); load(); }
    catch (err) { toast.error(err.response?.data?.detail || 'Upload failed'); }
    finally { setBusy(false); e.target.value = ''; }
  };
  const del = async (id) => { if (!window.confirm('Delete this photo?')) return; await Coaches.deleteMyPhoto(id); load(); };

  return (
    <div data-testid="photos-panel">
      {!readOnly && (
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <input value={caption} onChange={e => setCaption(e.target.value)} placeholder="Caption (e.g. Week 4, front)" className="flex-1 border rounded-lg px-3 py-2 text-sm" data-testid="photo-caption" />
          <label className={`inline-flex items-center justify-center gap-2 font-bold uppercase tracking-wider text-xs px-4 py-2.5 rounded-lg bg-slate-900 text-white cursor-pointer ${busy ? 'opacity-60 pointer-events-none' : ''}`} data-testid="photo-upload-label">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} Add photo
            <input type="file" accept="image/*" className="hidden" onChange={upload} data-testid="photo-upload-input" />
          </label>
        </div>
      )}
      <p className="text-[11px] text-slate-500 mb-3">Private — only you and your coach can see these. JPG, PNG, HEIC up to 10MB.</p>
      {list.length === 0 ? <p className="text-sm text-slate-500">No progress photos yet.</p> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {list.map(p => {
            const isSel = selected.includes(p.id);
            return (
              <div key={p.id} className={`relative rounded-xl overflow-hidden border ${isSel ? 'ring-2 ring-amber-500' : ''}`} data-testid={`photo-${p.id}`} onClick={() => selectable && onToggle?.(p.id)} role={selectable ? 'button' : undefined}>
                <PrivatePhoto id={p.id} alt={p.caption || 'Progress photo'} className="w-full aspect-[3/4] object-cover" />
                <div className="p-2 text-[11px] text-slate-600 flex items-center justify-between gap-2">
                  <span className="truncate">{p.caption || new Date(p.created_at).toLocaleDateString('en-GB')}</span>
                  {!readOnly && <button onClick={(e) => { e.stopPropagation(); del(p.id); }} className="text-red-600" data-testid={`photo-delete-${p.id}`}><Trash2 className="h-3.5 w-3.5" /></button>}
                  {selectable && <input type="checkbox" readOnly checked={isSel} className="accent-amber-500" />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const CertificateList = ({ fetchCerts, onDelete }) => {
  const [list, setList] = useState([]);
  useEffect(() => { fetchCerts().then(setList).catch(() => {}); }, [fetchCerts]);
  const open = async (id) => { const url = await Coaches.certificateBlob(id); window.open(url, '_blank'); };
  if (list.length === 0) return null;
  return (
    <ul className="space-y-2" data-testid="certificate-list">
      {list.map(c => (
        <li key={c.id} className="flex items-center justify-between gap-3 border rounded-xl p-3 bg-white" data-testid={`certificate-${c.id}`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-amber-100 text-amber-800 grid place-items-center shrink-0"><Award className="h-4 w-4" /></div>
            <div className="min-w-0"><p className="text-sm font-bold text-slate-900 truncate">{c.options?.headline || 'Certificate of Completion'} · {c.plan_name}</p><p className="text-xs text-slate-500">{c.name_shown} · issued {new Date(c.created_at).toLocaleDateString('en-GB')}</p></div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => open(c.id)} className="inline-flex items-center gap-1 text-xs font-bold bg-slate-900 text-white px-3 py-1.5 rounded-lg" data-testid={`certificate-open-${c.id}`}><Download className="h-3.5 w-3.5" /> Open PDF</button>
            {onDelete && <button onClick={() => onDelete(c.id).then(() => setList(l => l.filter(x => x.id !== c.id)))} className="text-red-600" data-testid={`certificate-delete-${c.id}`}><Trash2 className="h-4 w-4" /></button>}
          </div>
        </li>
      ))}
    </ul>
  );
};
