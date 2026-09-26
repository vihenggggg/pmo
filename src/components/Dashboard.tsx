import { useEffect, useState } from 'react';
import type { DashboardData } from '../../shared/schema';
import { api } from '../lib/api';
import { fmtMoney, fmtMoneyCompact, fmtPct } from '../lib/format';
import { hrefFor } from '../lib/route';
import { Segmented } from './Modal';
import { StatusBadge } from './StatusBadge';

type TypeFilter = 'all' | 'normal' | 'project';

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function Bar({ pct, label }: { pct: number; label: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-accent-soft" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label}>
      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

export function Dashboard() {
  const [type, setType] = useState<TypeFilter>('all');
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const [showAllCollection, setShowAllCollection] = useState(false);

  useEffect(() => {
    let live = true;
    setError('');
    api.dashboard(type).then((d) => live && setData(d)).catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [type]);

  const t = data?.totals;
  const collection = data ? (showAllCollection ? data.collection : data.collection.slice(0, 12)) : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <Segmented<TypeFilter>
          label="SO type"
          value={type}
          onChange={setType}
          options={[{ value: 'all', label: 'All' }, { value: 'normal', label: 'Normal' }, { value: 'project', label: 'Project' }]}
        />
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">{error}</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile label="Total SO" value={t ? t.count.toLocaleString() : '–'} />
        <StatTile label="Contract value" value={t ? fmtMoneyCompact(t.contract_value) : '–'} sub={t ? fmtMoney(t.contract_value) : undefined} />
        <StatTile label="Invoiced" value={t ? fmtMoneyCompact(t.invoiced) : '–'} sub={t ? fmtMoney(t.invoiced) : undefined} />
        <StatTile label="Remaining" value={t ? fmtMoneyCompact(t.remaining) : '–'} sub={t ? fmtMoney(t.remaining) : undefined} />
        <div className="col-span-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:col-span-1">
          <div className="text-sm text-slate-500">Collection rate</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight">{t ? fmtPct(t.collection_rate) : '–'}</div>
          <div className="mt-2"><Bar pct={t?.collection_rate ?? 0} label="Collection rate" /></div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-3 font-semibold">Status breakdown</h2>
          <table className="w-full text-sm">
            <thead className="sr-only">
              <tr><th>Status</th><th>Share</th><th>Count</th><th>Percent</th></tr>
            </thead>
            <tbody>
              {data?.status_breakdown.map((s) => (
                <tr key={s.status} className="group" title={`${s.status}: ${s.count} SO (${fmtPct(s.pct)})`}>
                  <td className="w-32 py-1.5 pr-3"><StatusBadge status={s.status} /></td>
                  <td className="py-1.5"><Bar pct={s.pct} label={`${s.status} share`} /></td>
                  <td className="tabular w-12 py-1.5 pl-3 text-right font-medium">{s.count}</td>
                  <td className="tabular w-14 py-1.5 pl-2 text-right text-slate-500">{fmtPct(s.pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Issues</h2>
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-200">
              ⚑ {data?.issues.length ?? 0} flagged
            </span>
          </div>
          {data && data.issues.length === 0 && <p className="text-sm text-slate-500">No SOs are flagged. Use the ⚑ button in the Sales Orders table to flag one.</p>}
          <ul className="max-h-80 divide-y divide-slate-100 overflow-auto">
            {data?.issues.map((i) => (
              <li key={i.id}>
                <a href={hrefFor({ page: 'orders', focus: i.id })} className="block rounded-md px-2 py-2 hover:bg-slate-50">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{i.so_number}</span>
                    <span className="truncate text-slate-600">{i.customer}</span>
                    <span className="ml-auto shrink-0 text-xs text-slate-400">
                      {i.issue_flagged_at ? new Date(i.issue_flagged_at).toLocaleDateString() : ''}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-700">{i.issue_note || <em className="text-slate-400">No note</em>}</p>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Collection progress</h2>
          <span className="text-xs text-slate-500">Largest remaining balance first · excludes Cancelled</span>
        </div>
        {data && data.collection.length === 0 && <p className="text-sm text-slate-500">No SOs with a contract value yet.</p>}
        <ul className="grid gap-x-8 gap-y-3 md:grid-cols-2">
          {collection.map((c) => (
            <li key={c.id}>
              <a href={hrefFor({ page: 'orders', focus: c.id })} className="block rounded-md p-1 hover:bg-slate-50" title={`${fmtPct(c.pct)} collected`}>
                <div className="mb-1 flex items-baseline gap-2 text-sm">
                  <span className="font-medium">{c.so_number}</span>
                  <span className="truncate text-slate-500">{c.customer}</span>
                  <span className="tabular ml-auto shrink-0 text-slate-700">
                    {fmtMoney(c.invoiced_amt)} <span className="text-slate-400">/ {fmtMoney(c.contract_value)}</span>
                  </span>
                </div>
                <Bar pct={c.pct} label={`${c.so_number} collected`} />
              </a>
            </li>
          ))}
        </ul>
        {data && data.collection.length > 12 && (
          <button className="mt-3 text-sm font-medium text-accent hover:underline" onClick={() => setShowAllCollection((v) => !v)}>
            {showAllCollection ? 'Show fewer' : `Show all ${data.collection.length}`}
          </button>
        )}
      </section>
    </div>
  );
}
