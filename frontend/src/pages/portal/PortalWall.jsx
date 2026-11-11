import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Coaches } from '../../lib/api';
import { PortalHeader, Card } from './PortalDashboard';
import { TierBadge } from '../../components/coaching/TierCards';
import { Trophy, Loader2 } from 'lucide-react';

const WallImage = ({ id, alt }) => {
  const [src, setSrc] = useState(null);
  useEffect(() => { let u; Coaches.wallImageBlob(id).then(x => { u = x; setSrc(x); }).catch(() => {}); return () => u && URL.revokeObjectURL(u); }, [id]);
  return src ? <img src={src} alt={alt} className="w-full aspect-square object-cover" /> : <div className="w-full aspect-square bg-slate-100 animate-pulse" />;
};

const PortalWall = () => {
  const [list, setList] = useState(null);
  useEffect(() => { Coaches.wall().then(setList).catch(() => setList([])); }, []);
  return (
    <div data-testid="portal-wall">
      <PortalHeader title="Wall of Wins" sub="Results shared by fellow members. Only people inside the portal can see this page." />
      {list === null ? <Loader2 className="h-6 w-6 animate-spin text-slate-400" /> : list.length === 0 ? (
        <Card testId="wall-empty">
          <div className="text-center py-8">
            <Trophy className="h-10 w-10 mx-auto text-slate-300" />
            <p className="font-bold text-slate-900 mt-3">No wins shared yet</p>
            <p className="text-sm text-slate-600 mt-1">When you complete a plan, you can share your certificate here from your <Link to=".." relative="path" className="underline">dashboard</Link>.</p>
          </div>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5" data-testid="wall-grid">
          {list.map(w => (
            <div key={w.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm" data-testid={`wall-${w.id}`}>
              <WallImage id={w.id} alt={`${w.name_shown} · ${w.plan_name}`} />
              <div className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-black text-slate-900 truncate">{w.name_shown}</p>
                  {w.tier && <TierBadge tier={w.tier} />}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{w.plan_name} plan · {new Date(w.shared_at || w.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</p>
                {w.results?.weight_change_kg != null && <p className="text-sm text-slate-700 mt-2"><strong>{w.results.weight_change_kg > 0 ? '+' : ''}{w.results.weight_change_kg} kg</strong> · {w.results.checkins} check-ins</p>}
                {w.review_text && <p className="text-sm italic text-slate-600 mt-2">“{w.review_text}”</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PortalWall;
