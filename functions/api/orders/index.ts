import { SO_STATUSES, SO_TYPES, normalizeOrder } from '../../../shared/schema';
import { ORDER_SELECT, fetchOrder, getSql, query } from '../../_lib/db';
import { HttpError, json, readJson, readObject, type Env } from '../../_lib/http';
import { buildInsert } from '../../_lib/orders';

// GET /api/orders?type=normal|project&status=Pending,On Hold&issue=true&q=search
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const where: string[] = [];
  const params: unknown[] = [];

  const type = url.searchParams.get('type');
  if (type && type !== 'all') {
    if (!(SO_TYPES as readonly string[]).includes(type)) throw new HttpError(400, `Invalid type "${type}"`);
    params.push(type);
    where.push(`so.type = $${params.length}::so_type`);
  }
  const status = url.searchParams.get('status');
  if (status) {
    const list = status.split(',').map((s) => s.trim()).filter(Boolean);
    const invalid = list.find((s) => !(SO_STATUSES as readonly string[]).includes(s));
    if (invalid) throw new HttpError(400, `Invalid status "${invalid}"`);
    params.push(list);
    where.push(`so.status::text = ANY($${params.length}::text[])`);
  }
  const issue = url.searchParams.get('issue');
  if (issue === 'true' || issue === 'false') where.push(issue === 'true' ? 'so.is_issue' : 'NOT so.is_issue');
  const q = url.searchParams.get('q')?.trim();
  if (q) {
    params.push(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    const p = `$${params.length}`;
    where.push(`(so.so_number ILIKE ${p} OR so.customer ILIKE ${p} OR so.product_service ILIKE ${p} OR so.internal_notes ILIKE ${p})`);
  }

  const rows = await query(
    getSql(env),
    `SELECT ${ORDER_SELECT} FROM sales_orders so
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY so.so_date DESC NULLS LAST, so.id DESC`,
    params,
  );
  return json(rows);
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = readObject(await readJson(request));
  const { value, errors } = normalizeOrder(body);
  if (Object.keys(errors).length) throw new HttpError(422, 'Validation failed', errors);
  const sql = getSql(env);
  const { text, params } = buildInsert(value);
  const [row] = await query(sql, text, params);
  return json(await fetchOrder(sql, row.id), { status: 201 });
};
