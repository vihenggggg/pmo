import { useEffect, useMemo, useState } from 'react';
import { FIELD_BY_KEY, ORDER_FIELDS, PASTE_COLUMNS, type OrderFieldKey } from '../../shared/schema';
import { api } from '../lib/api';
import {
  autoMap, chunk, detectHeaderRow, displayClean, parseTsv, positionalMapping, prepareRows, readFile, toPayload,
  type Mapping, type Sheet,
} from '../lib/importer';
import { btn, Modal } from './Modal';

export type ImportSource = { kind: 'paste'; text: string } | { kind: 'file'; file: File };

const PAGE_SIZE = 50;
const BATCH_SIZE = 200;
const colLetter = (i: number): string => (i >= 26 ? colLetter(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26));

interface Failure { row: number; so: string; message: string }

export function ImportModal({ source, onClose, onImported }: { source: ImportSource; onClose: () => void; onImported: () => void }) {
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [sheetIdx, setSheetIdx] = useState(0);
  const [headerRow, setHeaderRow] = useState(-1);
  const [mapping, setMapping] = useState<Mapping>([]);
  const [page, setPage] = useState(0);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [onConflict, setOnConflict] = useState<'skip' | 'update'>('skip');
  const [phase, setPhase] = useState<'review' | 'importing' | 'done'>('review');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [summary, setSummary] = useState({ created: 0, updated: 0, failures: [] as Failure[] });

  // Load the source into one or more sheets of raw cells.
  useEffect(() => {
    (async () => {
      try {
        const loaded = source.kind === 'paste' ? [{ name: 'Clipboard', rows: parseTsv(source.text) }] : await readFile(source.file);
        if (!loaded.length || !loaded.some((s) => s.rows.length)) throw new Error('No rows found.');
        setSheets(loaded);
        selectSheet(loaded, 0);
      } catch (e) {
        setLoadError((e as Error).message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const grid = sheets?.[sheetIdx]?.rows ?? [];
  const width = useMemo(() => grid.reduce((w, r) => Math.max(w, r.length), 0), [grid]);

  function applyHeader(rows: Sheet['rows'], idx: number) {
    const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
    setHeaderRow(idx);
    setMapping(idx >= 0 ? [...autoMap(rows[idx]), ...Array(w).fill(null)].slice(0, w) : positionalMapping(w));
    setPage(0);
  }

  function selectSheet(all: Sheet[], idx: number) {
    setSheetIdx(idx);
    applyHeader(all[idx].rows, detectHeaderRow(all[idx].rows).index);
  }

  const dataRows = useMemo(() => grid.slice(headerRow + 1), [grid, headerRow]);
  const prepared = useMemo(() => prepareRows(dataRows, mapping), [dataRows, mapping]);
  const bad = prepared.filter((r) => Object.keys(r.errors).length > 0);
  const good = prepared.filter((r) => Object.keys(r.errors).length === 0);
  const warned = good.filter((r) => r.warnings.length > 0);
  const visible = onlyProblems ? prepared.filter((r) => Object.keys(r.errors).length || r.warnings.length) : prepared;
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pageRows = visible.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const usedKeys = new Set(mapping.filter(Boolean));
  const unmappedRequired = (['customer', 'so_number'] as const).filter((k) => !usedKeys.has(k));

  function setColumn(col: number, key: OrderFieldKey | null) {
    setMapping((m) => m.map((k, i) => (i === col ? key : key && k === key ? null : k)));
  }

  async function runImport() {
    const batches = chunk(good, BATCH_SIZE);
    setPhase('importing');
    setProgress({ done: 0, total: good.length });
    const result = { created: 0, updated: 0, failures: [] as Failure[] };
    for (const batch of batches) {
      try {
        const res = await api.bulkCreate(batch.map((r) => toPayload(r, mapping)), onConflict);
        result.created += res.created;
        result.updated += res.updated;
        for (const r of res.results) {
          if (!r.ok) result.failures.push({ row: batch[r.index].index + 1, so: r.so_number ?? '', message: Object.values(r.errors ?? {}).join('; ') });
        }
      } catch (e) {
        for (const r of batch) result.failures.push({ row: r.index + 1, so: r.clean.so_number ?? '', message: (e as Error).message });
      }
      setProgress((p) => ({ ...p, done: Math.min(p.total, p.done + batch.length) }));
    }
    setSummary(result);
    setPhase('done');
    if (result.created || result.updated) onImported();
  }

  const title = source.kind === 'paste' ? 'Import pasted rows' : `Import ${source.file.name}`;

  if (loadError) {
    return (
      <Modal title={title} onClose={onClose} footer={<button className={btn.secondary} onClick={onClose}>Close</button>}>
        <p className="text-sm text-red-600">Couldn't read the data: {loadError}</p>
      </Modal>
    );
  }
  if (!sheets) {
    return <Modal title={title} onClose={onClose}><p className="text-sm text-slate-500">Reading…</p></Modal>;
  }

  if (phase !== 'review') {
    return (
      <Modal title={title} onClose={phase === 'done' ? onClose : () => {}} footer={phase === 'done' && <button className={btn.primary} onClick={onClose}>Done</button>}>
        {phase === 'importing' ? (
          <div className="space-y-2">
            <p className="text-sm">Importing {progress.done} / {progress.total} rows…</p>
            <div className="h-2 overflow-hidden rounded-full bg-accent-soft">
              <div className="h-full bg-accent transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <p>
              <strong className="text-emerald-700">{summary.created} created</strong>
              {summary.updated > 0 && <>, <strong className="text-blue-700">{summary.updated} updated</strong></>}
              {summary.failures.length > 0 && <>, <strong className="text-red-700">{summary.failures.length} failed</strong></>}
              {bad.length > 0 && <span className="text-slate-500"> · {bad.length} invalid rows were skipped before import</span>}
            </p>
            {summary.failures.length > 0 && (
              <table className="w-full text-left">
                <thead className="text-xs text-slate-500"><tr><th className="py-1">Row</th><th>SO#</th><th>Error</th></tr></thead>
                <tbody>
                  {summary.failures.map((f) => (
                    <tr key={f.row} className="border-t border-slate-100"><td className="py-1 pr-3">{f.row}</td><td className="pr-3">{f.so}</td><td className="text-red-700">{f.message}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Modal>
    );
  }

  return (
    <Modal
      wide
      title={title}
      onClose={onClose}
      footer={
        <>
          <label className="mr-auto flex items-center gap-2 text-sm text-slate-600">
            If SO# already exists:
            <select value={onConflict} onChange={(e) => setOnConflict(e.target.value as 'skip' | 'update')} className="rounded-md border border-slate-300 px-2 py-1 text-sm">
              <option value="skip">Skip the row (report as error)</option>
              <option value="update">Update the existing SO with mapped columns</option>
            </select>
          </label>
          <button className={btn.secondary} onClick={onClose}>Cancel</button>
          <button className={btn.primary} disabled={!good.length} onClick={runImport}>
            Confirm &amp; import {good.length} row{good.length === 1 ? '' : 's'}
          </button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        {sheets.length > 1 && (
          <label className="flex items-center gap-2">
            Sheet
            <select value={sheetIdx} onChange={(e) => selectSheet(sheets, Number(e.target.value))} className="rounded-md border border-slate-300 px-2 py-1">
              {sheets.map((s, i) => <option key={s.name} value={i}>{s.name} ({s.rows.length} rows)</option>)}
            </select>
          </label>
        )}
        <label className="flex items-center gap-2">
          Header row
          <select value={headerRow} onChange={(e) => applyHeader(grid, Number(e.target.value))} className="rounded-md border border-slate-300 px-2 py-1">
            <option value={-1}>None – map by position</option>
            {grid.slice(0, 10).map((r, i) => (
              <option key={i} value={i}>Row {i + 1}: {r.filter((c) => c != null && String(c).trim()).slice(0, 3).join(', ').slice(0, 40)}</option>
            ))}
          </select>
        </label>
        <button className={btn.ghost} onClick={() => setMapping(positionalMapping(width))}>Reset to standard column order</button>
        <span className="text-slate-600">
          <strong>{prepared.length}</strong> rows · <span className="text-emerald-700">{good.length} ready</span>
          {warned.length > 0 && <> · <span className="text-amber-700">{warned.length} with warnings</span></>}
          {bad.length > 0 && <> · <span className="text-red-700">{bad.length} with errors (will be skipped)</span></>}
        </span>
        {(bad.length > 0 || warned.length > 0) && (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={onlyProblems} onChange={(e) => { setOnlyProblems(e.target.checked); setPage(0); }} /> Show only rows with problems
          </label>
        )}
      </div>

      {unmappedRequired.length > 0 && (
        <div className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
          Map a column to {unmappedRequired.map((k) => FIELD_BY_KEY[k].label).join(' and ')} using the dropdowns in the table header.
        </div>
      )}
      {headerRow < 0 && (
        <p className="mb-2 text-xs text-slate-500">
          No header row detected, so columns are mapped in the standard order: {PASTE_COLUMNS.map((k) => FIELD_BY_KEY[k].label).join(', ')}. Fix any column with its dropdown.
        </p>
      )}

      <div className="overflow-auto rounded-lg ring-1 ring-slate-200">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>
              <th className="border-b border-slate-200 px-2 py-1.5 text-left font-medium text-slate-500">#</th>
              {Array.from({ length: width }, (_, col) => (
                <th key={col} className="min-w-[8rem] border-b border-l border-slate-200 px-1.5 py-1.5 text-left align-top font-normal">
                  <div className="mb-1 truncate text-slate-500" title={headerRow >= 0 ? String(grid[headerRow][col] ?? '') : undefined}>
                    {colLetter(col)}{headerRow >= 0 && grid[headerRow][col] != null ? ` · ${grid[headerRow][col]}` : ''}
                  </div>
                  <select
                    aria-label={`Map column ${colLetter(col)}`}
                    value={mapping[col] ?? ''}
                    onChange={(e) => setColumn(col, (e.target.value || null) as OrderFieldKey | null)}
                    className={`w-full rounded border px-1 py-0.5 text-xs font-medium ${mapping[col] ? 'border-accent/50 bg-accent-soft/50 text-slate-900' : 'border-slate-300 bg-white text-slate-400'}`}
                  >
                    <option value="">— Ignore —</option>
                    {ORDER_FIELDS.map((f) => (
                      <option key={f.key} value={f.key}>{f.label}{f.projectOnly ? ' (project)' : ''}</option>
                    ))}
                  </select>
                </th>
              ))}
              <th className="min-w-[14rem] border-b border-l border-slate-200 px-2 py-1.5 text-left font-medium text-slate-500">Problems</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => {
              const hasErr = Object.keys(r.errors).length > 0;
              return (
                <tr key={r.index} className={hasErr ? 'bg-red-50/60' : r.warnings.length ? 'bg-amber-50/50' : ''}>
                  <td className="border-b border-slate-100 px-2 py-1 text-slate-400">{r.index + 1}</td>
                  {Array.from({ length: width }, (_, col) => {
                    const key = mapping[col];
                    const err = key ? r.errors[key] : undefined;
                    const text = key ? displayClean(key, r.clean[key]) : String(r.raw[col] ?? '');
                    return (
                      <td
                        key={col}
                        title={err ?? (key ? `Source: ${String(r.raw[col] ?? '')}` : 'Ignored')}
                        className={`max-w-[16rem] truncate border-b border-l border-slate-100 px-2 py-1 ${!key ? 'text-slate-300' : ''} ${err ? 'bg-red-100 font-medium text-red-800' : ''}`}
                      >
                        {err ? String(r.raw[col] ?? '') || '(blank)' : text}
                      </td>
                    );
                  })}
                  <td className="border-b border-l border-slate-100 px-2 py-1">
                    {Object.values(r.errors).map((e) => <div key={e} className="text-red-700">✕ {e}</div>)}
                    {r.warnings.map((w) => <div key={w} className="text-amber-700">⚠ {w}</div>)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="mt-2 flex items-center justify-end gap-2 text-sm">
          <button className={btn.ghost} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Prev</button>
          <span className="text-slate-600">Page {page + 1} of {pages}</span>
          <button className={btn.ghost} disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      )}
    </Modal>
  );
}
