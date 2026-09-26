import { SO_STATUSES, SO_TYPES, type DashboardData } from '../../shared/schema';
import { getSql, query } from '../_lib/db';
import { HttpError, json, type Env } from '../_lib/http';

// GET /api/dashboard?type=all|normal|project
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const type = new URL(request.url).searchParams.get('type') ?? 'all';
  if (type !== 'all' && !(SO_TYPES as readonly string[]).includes(type)) throw new HttpError(400, `Invalid type "${type}"`);
  const params = type === 'all' ? [] : [type];
  const filter = type === 'all' ? 'TRUE' : 'so.type = $1::so_type';
  const sql = getSql(env);

  const [totalsRows, statusRows, issues, collection] = await Promise.all([
    query(sql, `SELECT count(*)::int AS count,
                       COALESCE(sum(contract_value), 0)::float8 AS contract_value,
                       COALESCE(sum(invoiced_amt), 0)::float8 AS invoiced
                FROM sales_orders so WHERE ${filter}`, params),
    query(sql, `SELECT status::text AS status, count(*)::int AS count
                FROM sales_orders so WHERE ${filter} GROUP BY status`, params),
    query(sql, `SELECT id, so_number, customer, issue_note, issue_flagged_at, type::text AS type, status::text AS status
                FROM sales_orders so WHERE ${filter} AND is_issue
                ORDER BY issue_flagged_at DESC NULLS LAST, updated_at DESC`, params),
    query(sql, `SELECT id, so_number, customer, type::text AS type,
                       contract_value::float8 AS contract_value, invoiced_amt::float8 AS invoiced_amt
                FROM sales_orders so
                WHERE ${filter} AND status <> 'Cancelled' AND contract_value > 0
                ORDER BY (contract_value - invoiced_amt) DESC, so_number`, params),
  ]);

  const t = totalsRows[0];
  const count = t.count as number;
  const counts = new Map(statusRows.map((r) => [r.status, r.count as number]));
  const data: DashboardData = {
    totals: {
      count,
      contract_value: t.contract_value,
      invoiced: t.invoiced,
      remaining: t.contract_value - t.invoiced,
      collection_rate: t.contract_value > 0 ? (t.invoiced / t.contract_value) * 100 : 0,
    },
    status_breakdown: SO_STATUSES.map((status) => {
      const c = counts.get(status) ?? 0;
      return { status, count: c, pct: count ? (c / count) * 100 : 0 };
    }),
    issues: issues as DashboardData['issues'],
    collection: collection.map((r) => ({
      ...(r as Omit<DashboardData['collection'][number], 'pct'>),
      pct: r.contract_value > 0 ? (r.invoiced_amt / r.contract_value) * 100 : 0,
    })),
  };
  return json(data);
};
