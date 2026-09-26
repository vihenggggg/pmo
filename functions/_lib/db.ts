import { neon } from '@neondatabase/serverless';
import { HttpError, type Env } from './http';

export type Sql = ReturnType<typeof neon>;
export type Row = Record<string, any>;

export function getSql(env: Env): Sql {
  if (!env.DATABASE_URL) throw new HttpError(500, 'DATABASE_URL is not configured');
  return neon(env.DATABASE_URL);
}

export async function query(sql: Sql, text: string, params: unknown[] = []): Promise<Row[]> {
  return (await sql.query(text, params)) as Row[];
}

/** SELECT list for sales_orders (alias `so`), with dates as YYYY-MM-DD strings and money as numbers. */
export const ORDER_SELECT = `
  so.id, so.so_number, so.type::text AS type, so.customer, so.product_service, so.lead_time,
  so.so_date::text AS so_date, so.start_date::text AS start_date, so.deadline::text AS deadline,
  so.contract_value::float8 AS contract_value, so.invoiced_amt::float8 AS invoiced_amt,
  (COALESCE(so.contract_value, 0) - COALESCE(so.invoiced_amt, 0))::float8 AS remaining_balance,
  so.invoice_plan, so.status::text AS status, so.last_update::text AS last_update,
  so.customer_feedback, so.internal_notes, so.budget_code,
  so.service_type, so.pic, so.site_location,
  so.is_issue, so.issue_note, so.issue_flagged_at, so.created_at, so.updated_at,
  (SELECT count(*)::int FROM milestones m WHERE m.so_id = so.id) AS milestone_count,
  (SELECT count(*)::int FROM milestones m WHERE m.so_id = so.id AND m.done) AS milestones_done`;

export const MILESTONE_SELECT = `id, so_id, name, due_date::text AS due_date, done, sort_order`;

export async function fetchOrder(sql: Sql, id: number): Promise<Row> {
  const rows = await query(sql, `SELECT ${ORDER_SELECT} FROM sales_orders so WHERE so.id = $1`, [id]);
  if (!rows[0]) throw new HttpError(404, 'Sales order not found');
  return rows[0];
}
