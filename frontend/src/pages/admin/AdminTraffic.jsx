import React, { useEffect, useState } from 'react';
import { Analytics } from '../../lib/api';
import { Loader2, Users, Eye, TrendingUp, TrendingDown, Monitor, Smartphone, Tablet } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const RANGES = [{ days: 7, label: '7 days' }, { days: 30, label: '30 days' }, { days: 90, label: '90 days' }];
const DEVICE_ICON = { desktop: Monitor, mobile: Smartphone, tablet: Tablet };

const pct = (cur, prev) => {
  if (!prev) return cur ? null : 0;
  return Math.round(((cur - prev) / prev) * 100);
};

const Delta = ({ value, testId }) => {
  if (value === null || value === undefined) return <span className="text-xs text-slate-400" data-testid={testId}>new</span>;
  const up = value >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`text-xs font-semibold flex items-center gap-1 ${up ? 'text-emerald-600' : 'text-red-600'}`} data-testid={testId}>
      <Icon className="h-3.5 w-3.5" /> {up ? '+' : ''}{value}% vs previous period
    </span>
  );
};

const Stat = ({ icon: Icon, label, value, delta, testId }) => (
  <div className="bg-white rounded-lg border p-5 flex items-center gap-4">
    <div className="h-12 w-12 rounded-full bg-sky-50 grid place-items-center text-sky-600"><Icon className="h-6 w-6" /></div>
    <div>
      <p className="text-xs uppercase tracking-widest text-slate-500">{label}</p>
      <p className="text-2xl font-black mt-0.5" data-testid={testId}>{value.toLocaleString()}</p>
      <Delta value={delta} testId={`${testId}-delta`} />
    </div>
  </div>
);

const RankTable = ({ title, rows, total, labelFor = (k) => k, testId }) => (
  <div className="bg-white rounded-lg border p-5" data-testid={testId}>
    <h2 className="font-bold uppercase text-sm tracking-wide mb-3">{title}</h2>
    {rows.length === 0 ? <p className="text-sm text-slate-500">No data yet.</p> : (
      <ul className="space-y-2">
        {rows.map(r => {
          const share = total ? Math.round((r.views / total) * 100) : 0;
          return (
            <li key={r.key} className="text-sm">
              <div className="flex justify-between gap-3">
                <span className="truncate font-medium">{labelFor(r.key)}</span>
                <span className="text-slate-500 shrink-0">{r.views.toLocaleString()} · {share}%</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded mt-1"><div className="h-1.5 bg-sky-400 rounded" style={{ width: `${share}%` }} /></div>
            </li>
          );
        })}
      </ul>
    )}
  </div>
);

const AdminTraffic = () => {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Analytics.summary(days).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [days]);

  const fmtDay = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  return (
    <div data-testid="admin-traffic-page">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-black uppercase">Traffic</h1>
          <p className="text-sm text-slate-500">Cookie-free, first-party. Unique visitors are counted per day; admin pages are excluded.</p>
        </div>
        <div className="flex border rounded-lg overflow-hidden bg-white" data-testid="traffic-range">
          {RANGES.map(r => (
            <button key={r.days} type="button" onClick={() => setDays(r.days)} data-testid={`traffic-range-${r.days}`}
              className={`px-4 py-2 text-sm font-semibold transition-colors ${days === r.days ? 'bg-sky-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading || !data ? (
        <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>
      ) : (
        <div className="space-y-6">
          <div className="grid sm:grid-cols-2 gap-4">
            <Stat icon={Users} label="Unique visitors" value={data.totals.visitors} delta={pct(data.totals.visitors, data.previous.visitors)} testId="traffic-visitors" />
            <Stat icon={Eye} label="Page views" value={data.totals.views} delta={pct(data.totals.views, data.previous.views)} testId="traffic-views" />
          </div>

          <div className="bg-white rounded-lg border p-5" data-testid="traffic-chart">
            <h2 className="font-bold uppercase text-sm tracking-wide mb-4">Daily visitors &amp; page views · {fmtDay(data.range.start)} – {fmtDay(data.range.end)}</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.daily} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gViews" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.25} /><stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} /></linearGradient>
                    <linearGradient id="gVisitors" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0f172a" stopOpacity={0.2} /><stop offset="95%" stopColor="#0f172a" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 11 }} minTickGap={24} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip labelFormatter={fmtDay} />
                  <Area type="monotone" dataKey="views" name="Page views" stroke="#0ea5e9" fill="url(#gViews)" strokeWidth={2} />
                  <Area type="monotone" dataKey="visitors" name="Visitors" stroke="#0f172a" fill="url(#gVisitors)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <RankTable title="Top pages" rows={data.top_pages} total={data.totals.views} testId="traffic-top-pages" />
            <RankTable title="Where visitors come from" rows={data.sources} total={data.totals.views} testId="traffic-sources" />
            <div className="bg-white rounded-lg border p-5" data-testid="traffic-devices">
              <h2 className="font-bold uppercase text-sm tracking-wide mb-3">Devices</h2>
              {data.devices.length === 0 ? <p className="text-sm text-slate-500">No data yet.</p> : (
                <ul className="space-y-3">
                  {data.devices.map(d => {
                    const Icon = DEVICE_ICON[d.key] || Monitor;
                    const share = data.totals.views ? Math.round((d.views / data.totals.views) * 100) : 0;
                    return (
                      <li key={d.key} className="flex items-center gap-3 text-sm">
                        <Icon className="h-5 w-5 text-slate-500" />
                        <span className="capitalize font-medium flex-1">{d.key}</span>
                        <span className="text-slate-500">{share}%</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTraffic;
