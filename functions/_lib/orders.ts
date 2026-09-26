import { ORDER_FIELDS, type CleanOrder, type OrderFieldKey } from '../../shared/schema';

/** Postgres type of each writable column, used for jsonb_to_recordset and casts. */
export const COLUMN_TYPES: Record<OrderFieldKey, string> = Object.fromEntries(
  ORDER_FIELDS.map((f) => [
    f.key,
    f.kind === 'date' ? 'date'
      : f.kind === 'money' ? 'numeric'
      : f.kind === 'bool' ? 'boolean'
      : f.kind === 'status' ? 'so_status'
      : f.kind === 'type' ? 'so_type'
      : 'text',
  ]),
) as Record<OrderFieldKey, string>;

export const WRITABLE_COLUMNS = ORDER_FIELDS.map((f) => f.key);

/** Builds `INSERT ... RETURNING id` for a fully-normalized order. */
export function buildInsert(order: CleanOrder): { text: string; params: unknown[] } {
  const cols = WRITABLE_COLUMNS.filter((c) => order[c] !== undefined);
  const params = cols.map((c) => order[c]);
  const values = cols.map((c, i) => `$${i + 1}::${COLUMN_TYPES[c]}`);
  const issueIdx = cols.indexOf('is_issue');
  const flaggedAt = issueIdx >= 0 ? `CASE WHEN $${issueIdx + 1}::boolean THEN now() END` : 'NULL';
  return {
    text: `INSERT INTO sales_orders (${cols.join(', ')}, issue_flagged_at)
           VALUES (${values.join(', ')}, ${flaggedAt})
           RETURNING id`,
    params,
  };
}

/** Builds a partial `UPDATE ... RETURNING id`; keeps issue_flagged_at in step with is_issue. */
export function buildUpdate(id: number, patch: CleanOrder): { text: string; params: unknown[] } {
  const cols = WRITABLE_COLUMNS.filter((c) => patch[c] !== undefined);
  const params: unknown[] = cols.map((c) => patch[c]);
  const sets = cols.map((c, i) => `${c} = $${i + 1}::${COLUMN_TYPES[c]}`);
  const issueIdx = cols.indexOf('is_issue');
  if (issueIdx >= 0) {
    const p = `$${issueIdx + 1}::boolean`;
    sets.push(`issue_flagged_at = CASE WHEN NOT ${p} THEN NULL WHEN is_issue THEN issue_flagged_at ELSE now() END`);
  }
  sets.push('updated_at = now()');
  params.push(id);
  return {
    text: `UPDATE sales_orders SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id`,
    params,
  };
}
