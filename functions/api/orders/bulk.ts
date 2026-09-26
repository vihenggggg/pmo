import { ORDER_FIELDS, normalizeOrder, type BulkRowResult, type CleanOrder, type OrderFieldKey } from '../../../shared/schema';
import { getSql, query } from '../../_lib/db';
import { HttpError, json, readJson, type Env } from '../../_lib/http';
import { COLUMN_TYPES, WRITABLE_COLUMNS } from '../../_lib/orders';

const MAX_ROWS = 1000;
const FIELD_KEYS = new Set<string>(ORDER_FIELDS.map((f) => f.key));

/**
 * POST /api/orders/bulk
 * Body: an array of row objects, or `{ rows: [...], on_conflict: 'skip' | 'update' }`.
 * `skip` (default) reports rows whose SO# already exists as errors; `update` overwrites the
 * columns present in the import on those existing orders. Returns one result per input row.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJson<unknown>(request);
  const rows = Array.isArray(body) ? body : (body as { rows?: unknown })?.rows;
  const onConflict = Array.isArray(body) ? 'skip' : ((body as { on_conflict?: unknown }).on_conflict ?? 'skip');
  if (!Array.isArray(rows)) throw new HttpError(400, 'Expected an array of rows');
  if (onConflict !== 'skip' && onConflict !== 'update') throw new HttpError(400, 'on_conflict must be "skip" or "update"');
  if (rows.length === 0) return json({ results: [], created: 0, updated: 0, failed: 0 });
  if (rows.length > MAX_ROWS) throw new HttpError(413, `At most ${MAX_ROWS} rows per request; split the import into batches`);

  const results: BulkRowResult[] = rows.map((_, index) => ({ index, ok: false }));
  const valid: (CleanOrder & { idx: number })[] = [];
  const indexBySo = new Map<string, number>();
  const presentKeys = new Set<OrderFieldKey>();

  rows.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      results[index].errors = { row: 'Row must be an object' };
      return;
    }
    for (const k of Object.keys(raw)) if (FIELD_KEYS.has(k)) presentKeys.add(k as OrderFieldKey);
    const { value, errors } = normalizeOrder(raw as Record<string, unknown>);
    results[index].so_number = value.so_number ?? undefined;
    if (Object.keys(errors).length) {
      results[index].errors = errors;
      return;
    }
    const so = value.so_number as string;
    if (indexBySo.has(so)) {
      results[index].errors = { so_number: `Duplicate SO# ${so} (also on row ${indexBySo.get(so)! + 1})` };
      return;
    }
    indexBySo.set(so, index);
    valid.push({ ...value, idx: index });
  });

  if (valid.length) {
    const cols = WRITABLE_COLUMNS;
    const recordDef = ['idx int', ...cols.map((c) => `${c} ${COLUMN_TYPES[c]}`)].join(', ');
    let conflict = 'DO NOTHING';
    if (onConflict === 'update') {
      const updCols = cols.filter((c) => c !== 'so_number' && presentKeys.has(c));
      const sets = updCols.map((c) => `${c} = EXCLUDED.${c}`);
      if (presentKeys.has('is_issue')) {
        sets.push(`issue_flagged_at = CASE WHEN NOT EXCLUDED.is_issue THEN NULL
                   WHEN sales_orders.is_issue THEN sales_orders.issue_flagged_at ELSE now() END`);
      }
      sets.push('updated_at = now()');
      conflict = `DO UPDATE SET ${sets.join(', ')}`;
    }
    const written = await query(
      getSql(env),
      `INSERT INTO sales_orders (${cols.join(', ')}, issue_flagged_at)
       SELECT ${cols.map((c) => `x.${c}`).join(', ')}, CASE WHEN x.is_issue THEN now() END
       FROM jsonb_to_recordset($1::jsonb) AS x(${recordDef})
       ORDER BY x.idx
       ON CONFLICT (so_number) ${conflict}
       RETURNING id, so_number, (xmax = 0) AS inserted`,
      [JSON.stringify(valid)],
    );
    for (const w of written) {
      const r = results[indexBySo.get(w.so_number)!];
      Object.assign(r, { ok: true, id: w.id, action: w.inserted ? 'created' : 'updated' });
    }
    for (const v of valid) {
      const r = results[v.idx];
      if (!r.ok) r.errors = { so_number: `SO# ${v.so_number} already exists` };
    }
  }

  return json({
    results,
    created: results.filter((r) => r.action === 'created').length,
    updated: results.filter((r) => r.action === 'updated').length,
    failed: results.filter((r) => !r.ok).length,
  });
};
