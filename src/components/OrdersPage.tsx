import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FIELD_BY_KEY, SO_STATUSES, type FieldKind, type OrderFieldKey, type SalesOrder, type SoStatus } from '../../shared/schema';
import { api } from '../lib/api';
import { downloadCsv, ordersToCsv } from '../lib/csv';
import { daysUntil, fmtDate, fmtMoney, todayIso } from '../lib/format';
import { EditableCell } from './EditableCell';
import { ImportModal, type ImportSource } from './ImportModal';
import { Milestones } from './Milestones';
import { btn, Segmented } from './Modal';
import { NewOrderModal } from './NewOrderModal';
import { StatusBadge } from './StatusBadge';
import { useToast } from './Toast';

type TypeFilter = 'all' | 'normal' | 'project';
type SortKey = OrderFieldKey | 'remaining_balance';

interface Column {
  key: SortKey;
  label: string;
  kind: FieldKind;
  width: string;
  projectOnly?: boolean;
  multiline?: boolean;
  readOnly?: boolean;
}

const col = (key: OrderFieldKey, width: string, extra: Partial<Column> = {}): Column => ({
  key, label: FIELD_BY_KEY[key].label, kind: FIELD_BY_KEY[key].kind, width, projectOnly: FIELD_BY_KEY[key].projectOnly, ...extra,
});

// SO# is rendered separately as a sticky column.
const COLUMNS: Column[] = [
  col('customer', 'min-w-[11rem]'),
  col('type', 'min-w-[6rem]'),
  col('status', 'min-w-[8rem]'),
  col('product_service', 'min-w-[14rem]', { multiline: true }),
  col('lead_time', 'min-w-[6rem]'),
  col('so_date', 'min-w-[7.5rem]'),
  col('start_date', 'min-w-[7.5rem]'),
  col('deadline', 'min-w-[7.5rem]'),
  col('contract_value', 'min-w-[8rem]'),
  col('invoiced_amt', 'min-w-[8rem]'),
  { key: 'remaining_balance', label: 'Remaining', kind: 'money', width: 'min-w-[8rem]', readOnly: true },
  col('invoice_plan', 'min-w-[10rem]', { multiline: true }),
  col('last_update', 'min-w-[7.5rem]'),
  col('customer_feedback', 'min-w-[14rem]', { multiline: true }),
  col('internal_notes', 'min-w-[14rem]', { multiline: true }),
  col('budget_code', 'min-w-[7rem]'),
  col('service_type', 'min-w-[8rem]'),
  col('pic', 'min-w-[8rem]'),
  col('site_location', 'min-w-[9rem]'),
  col('issue_note', 'min-w-[14rem]', { multiline: true }),
];

const OPEN_STATUSES: SoStatus[] = ['Pending', 'In Progress', 'On Hold'];

const isBlank = (v: unknown) => v === null || v === undefined || v === '';

/** Sorts by value in `dir`, keeping blanks last either way. */
function compare(a: unknown, b: unknown, dir: 1 | -1): number {
  if (isBlank(a) || isBlank(b)) return isBlank(a) === isBlank(b) ? 0 : isBlank(a) ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * dir;
  if (typeof a === 'boolean' || typeof b === 'boolean') return (Number(a) - Number(b)) * dir;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }) * dir;
}

function isEditableTarget(el: EventTarget | null) {
  return el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

export function OrdersPage({ focusId }: { focusId?: number }) {
  const toast = useToast();
  const [orders, setOrders] = useState<SalesOrder[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [type, setType] = useState<TypeFilter>('all');
  const [status, setStatus] = useState<SoStatus | 'open' | ''>('');
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'so_date', dir: -1 });
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [highlight, setHighlight] = useState<number | null>(null);
  const [importSource, setImportSource] = useState<ImportSource | null>(null);
  const [showNew, setShowNew] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setOrders(await api.listOrders());
      setLoadError('');
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Ctrl+V anywhere on the page (outside inputs) opens the paste importer.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (importSource || showNew || isEditableTarget(e.target)) return;
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (/[\t\n]/.test(text.trim())) {
        e.preventDefault();
        setImportSource({ kind: 'paste', text });
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [importSource, showNew]);

  // Deep link from the dashboard: clear filters, scroll to and flash the row.
  useEffect(() => {
    if (!focusId || !orders) return;
    const target = orders.find((o) => o.id === focusId);
    if (!target) return;
    setType('all');
    setStatus('');
    setIssuesOnly(false);
    setSearch('');
    if (target.type === 'project') setExpanded((s) => new Set(s).add(focusId));
    setHighlight(focusId);
    requestAnimationFrame(() => document.getElementById(`so-row-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    const t = setTimeout(() => setHighlight(null), 2500);
    return () => clearTimeout(t);
  }, [focusId, orders !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    if (!orders) return [];
    const q = search.trim().toLowerCase();
    return orders
      .filter((o) => type === 'all' || o.type === type)
      .filter((o) => !status || (status === 'open' ? OPEN_STATUSES.includes(o.status) : o.status === status))
      .filter((o) => !issuesOnly || o.is_issue)
      .filter((o) => !q || [o.so_number, o.customer, o.product_service, o.internal_notes, o.customer_feedback, o.pic, o.site_location, o.budget_code, o.issue_note]
        .some((v) => v?.toLowerCase().includes(q)))
      .sort((a, b) => compare(a[sort.key], b[sort.key], sort.dir) || b.id - a.id);
  }, [orders, type, status, issuesOnly, search, sort]);

  const columns = COLUMNS.filter((c) => !(type === 'normal' && c.projectOnly));
  const totals = useMemo(() => visible.reduce((t, o) => ({ c: t.c + o.contract_value, i: t.i + o.invoiced_amt }), { c: 0, i: 0 }), [visible]);

  function replace(o: SalesOrder) {
    setOrders((list) => list?.map((x) => (x.id === o.id ? o : x)) ?? null);
  }

  async function save(o: SalesOrder, patch: Partial<Record<OrderFieldKey, string | boolean | null>>) {
    try {
      replace(await api.updateOrder(o.id, patch));
    } catch (e) {
      toast((e as Error).message, 'error');
      throw e;
    }
  }

  async function toggleIssue(o: SalesOrder) {
    if (o.is_issue) {
      if (confirm(`Clear the issue flag on ${o.so_number}?`)) save(o, { is_issue: false }).catch(() => {});
      return;
    }
    const note = prompt(`Flag ${o.so_number} as an issue.\nWhat's the issue? (optional)`, o.issue_note ?? '');
    if (note === null) return;
    save(o, { is_issue: true, issue_note: note }).catch(() => {});
  }

  async function remove(o: SalesOrder) {
    if (!confirm(`Delete ${o.so_number} (${o.customer})? This also deletes its milestones and can't be undone.`)) return;
    try {
      await api.deleteOrder(o.id);
      setOrders((list) => list?.filter((x) => x.id !== o.id) ?? null);
      toast(`Deleted ${o.so_number}`, 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  }

  function renderCell(o: SalesOrder, c: Column) {
    if (c.projectOnly && o.type !== 'project') {
      return <span className="block px-1.5 py-1 text-slate-300" title="Project SOs only">—</span>;
    }
    if (c.readOnly) {
      return <span className={`tabular block px-1.5 py-1 text-right ${o.remaining_balance > 0 ? '' : 'text-slate-400'}`}>{fmtMoney(o.remaining_balance)}</span>;
    }
    const key = c.key as OrderFieldKey;
    const value = o[key] as string | number | null;
    let display: React.ReactNode;
    let className = '';
    if (c.kind === 'money') {
      display = fmtMoney(value as number);
      className = 'tabular text-right';
    } else if (c.kind === 'date' && value) {
      display = fmtDate(value as string);
      if (key === 'deadline' && OPEN_STATUSES.includes(o.status)) {
        const d = daysUntil(value as string);
        if (d < 0) {
          display = <span className="font-medium text-red-700" title={`${-d} days overdue`}>{fmtDate(value as string)} ⏰</span>;
        } else if (d <= 7) {
          display = <span className="font-medium text-amber-700" title={`Due in ${d} day${d === 1 ? '' : 's'}`}>{fmtDate(value as string)}</span>;
        }
      }
    } else if (c.kind === 'status') {
      display = <StatusBadge status={o.status} />;
    } else if (c.kind === 'type') {
      display = o.type === 'project'
        ? <span className="rounded bg-violet-50 px-1.5 py-0.5 text-xs font-medium text-violet-800 ring-1 ring-violet-200">Project</span>
        : <span className="text-xs text-slate-500">Normal</span>;
    } else if (c.multiline && value) {
      display = <span className="line-clamp-2 whitespace-pre-line">{value}</span>;
    }
    return (
      <EditableCell
        kind={c.kind}
        value={value}
        display={display}
        multiline={c.multiline}
        className={className}
        onSave={(v) => {
          const patch: Partial<Record<OrderFieldKey, string | null>> = { [key]: v };
          if (key !== 'last_update' && key !== 'issue_note') patch.last_update = todayIso();
          return save(o, patch);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-semibold">Sales Orders</h1>
        <button className={btn.secondary} onClick={() => orders && downloadCsv(`so-tracker-${todayIso()}.csv`, ordersToCsv(visible))} disabled={!visible.length}>
          ⭳ Export CSV
        </button>
        <button className={btn.secondary} onClick={() => fileRef.current?.click()}>⭱ Import file</button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.xlsm,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setImportSource({ kind: 'file', file });
            e.target.value = '';
          }}
        />
        <button className={btn.primary} onClick={() => setShowNew(true)}>+ New SO</button>
      </div>

      <label className="block cursor-text rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-500 focus-within:border-accent hover:border-slate-400">
        <span className="font-medium text-slate-700">Paste rows from Excel</span> — copy rows in your tracker, click here and press Ctrl+V (⌘V).
        Columns: Customer, SO#, Lead Time, SO Date, Start Date, Deadline, Product/Service, Contract Value, Invoiced Amt, Invoice Plan, Status, Last Update, Customer Feedback, Internal Notes, Budget Code, Type, Service Type, PIC, Site Location.
        <textarea
          aria-label="Paste rows from Excel"
          rows={1}
          value=""
          onChange={() => {}}
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            if (text.trim()) setImportSource({ kind: 'paste', text });
          }}
          className="mt-1 block h-6 w-full resize-none bg-transparent outline-none"
          placeholder="Click and paste…"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Segmented<TypeFilter>
          label="SO type"
          value={type}
          onChange={setType}
          options={[{ value: 'all', label: 'All' }, { value: 'normal', label: 'Normal' }, { value: 'project', label: 'Project' }]}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value as SoStatus | 'open' | '')} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm" aria-label="Status filter">
          <option value="">All statuses</option>
          <option value="open">Open (Pending / In Progress / On Hold)</option>
          {SO_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={issuesOnly} onChange={(e) => setIssuesOnly(e.target.checked)} className="h-4 w-4 accent-red-600" /> Issues only
        </label>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search SO#, customer, notes…"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm sm:w-72"
        />
        <span className="tabular ml-auto text-sm text-slate-500">
          {visible.length}{orders && visible.length !== orders.length ? ` of ${orders.length}` : ''} SO · {fmtMoney(totals.i)} / {fmtMoney(totals.c)} invoiced
        </span>
      </div>

      {loadError && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
          {loadError} <button className="ml-2 underline" onClick={load}>Retry</button>
        </div>
      )}

      <div className="max-h-[calc(100vh-17rem)] min-h-[20rem] overflow-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-20 bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="sticky left-0 z-10 w-[4.5rem] border-b border-slate-200 bg-slate-50 px-2 py-2" aria-label="Row controls" />
              <th className="sticky left-[4.5rem] z-10 min-w-[8rem] border-b border-r border-slate-200 bg-slate-50 px-2 py-2 text-left">
                <SortButton label="SO#" active={sort.key === 'so_number'} dir={sort.dir} onClick={() => toggleSort('so_number')} />
              </th>
              {columns.map((c) => (
                <th key={c.key} className={`${c.width} border-b border-slate-200 px-2 py-2 text-left ${c.kind === 'money' ? 'text-right' : ''}`}>
                  <SortButton label={c.label} active={sort.key === c.key} dir={sort.dir} onClick={() => toggleSort(c.key)} />
                </th>
              ))}
              <th className="border-b border-slate-200 px-2 py-2" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {orders === null && !loadError && (
              <tr><td colSpan={columns.length + 3} className="p-6 text-center text-slate-500">Loading…</td></tr>
            )}
            {orders && visible.length === 0 && (
              <tr>
                <td colSpan={columns.length + 3} className="p-8 text-center text-slate-500">
                  {orders.length === 0 ? 'No sales orders yet. Paste rows from Excel, import a file, or click “New SO”.' : 'No SOs match these filters.'}
                </td>
              </tr>
            )}
            {visible.map((o) => {
              const isOpen = expanded.has(o.id);
              const rowBg = highlight === o.id ? 'bg-yellow-100' : o.is_issue ? 'bg-red-50/70' : 'bg-white';
              return [
                <tr key={o.id} id={`so-row-${o.id}`} className={`group align-top transition-colors ${rowBg}`}>
                  <td className={`sticky left-0 z-10 border-b border-slate-100 px-1 py-1 ${rowBg}`}>
                    <div className="flex items-center gap-0.5">
                      {o.type === 'project' ? (
                        <button
                          className="rounded px-1 py-0.5 text-slate-500 hover:bg-slate-100"
                          onClick={() => setExpanded((s) => { const n = new Set(s); if (n.has(o.id)) n.delete(o.id); else n.add(o.id); return n; })}
                          aria-expanded={isOpen}
                          aria-label={`${isOpen ? 'Hide' : 'Show'} milestones for ${o.so_number}`}
                          title={`Milestones ${o.milestones_done ?? 0}/${o.milestone_count ?? 0}`}
                        >
                          <span className={`inline-block transition-transform ${isOpen ? 'rotate-90' : ''}`}>▸</span>
                        </button>
                      ) : <span className="inline-block w-6" />}
                      <button
                        onClick={() => toggleIssue(o)}
                        className={`rounded px-1 py-0.5 ${o.is_issue ? 'text-red-600 hover:bg-red-100' : 'text-slate-300 hover:bg-slate-100 hover:text-slate-600'}`}
                        aria-pressed={o.is_issue}
                        aria-label={o.is_issue ? `Clear issue flag on ${o.so_number}` : `Flag ${o.so_number} as issue`}
                        title={o.is_issue ? `Issue: ${o.issue_note ?? ''}` : 'Flag as issue'}
                      >
                        ⚑
                      </button>
                    </div>
                  </td>
                  <td className={`sticky left-[4.5rem] z-10 border-b border-r border-slate-100 py-0.5 font-medium ${rowBg}`}>
                    <EditableCell kind="text" value={o.so_number} onSave={(v) => save(o, { so_number: v })} />
                    {o.type === 'project' && (o.milestone_count ?? 0) > 0 && (
                      <span className="block px-1.5 text-[11px] font-normal text-slate-500">{o.milestones_done}/{o.milestone_count} milestones</span>
                    )}
                  </td>
                  {columns.map((c) => (
                    <td key={c.key} className="max-w-[22rem] border-b border-slate-100 py-0.5">{renderCell(o, c)}</td>
                  ))}
                  <td className="border-b border-slate-100 px-1 py-1 text-right">
                    <button onClick={() => remove(o)} className="rounded px-1.5 py-0.5 text-slate-300 opacity-0 hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100" aria-label={`Delete ${o.so_number}`} title="Delete SO">
                      🗑
                    </button>
                  </td>
                </tr>,
                isOpen && (
                  <tr key={`${o.id}-ms`} className="bg-slate-50/80">
                    <td className="border-b border-slate-200" />
                    <td colSpan={columns.length + 2} className="border-b border-slate-200">
                      <Milestones
                        soId={o.id}
                        onCountsChange={(total, done) => setOrders((list) => list?.map((x) => (x.id === o.id ? { ...x, milestone_count: total, milestones_done: done } : x)) ?? null)}
                      />
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>

      {importSource && (
        <ImportModal source={importSource} onClose={() => setImportSource(null)} onImported={load} />
      )}
      {showNew && (
        <NewOrderModal
          onClose={() => setShowNew(false)}
          onCreated={(o) => {
            setShowNew(false);
            setOrders((list) => [o, ...(list ?? [])]);
            toast(`Created ${o.so_number}`, 'success');
          }}
        />
      )}
    </div>
  );
}

function SortButton({ label, active, dir, onClick }: { label: string; active: boolean; dir: 1 | -1; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1 whitespace-nowrap font-semibold hover:text-slate-900 ${active ? 'text-slate-900' : ''}`}>
      {label}
      <span className={active ? '' : 'invisible'} aria-hidden>{dir === 1 ? '▲' : '▼'}</span>
    </button>
  );
}
