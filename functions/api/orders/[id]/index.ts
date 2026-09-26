import { normalizeOrder } from '../../../../shared/schema';
import { fetchOrder, getSql, query } from '../../../_lib/db';
import { HttpError, json, parseId, readJson, readObject, type Env } from '../../../_lib/http';
import { buildUpdate } from '../../../_lib/orders';

export const onRequestGet: PagesFunction<Env, 'id'> = async ({ params, env }) =>
  json(await fetchOrder(getSql(env), parseId(params.id)));

export const onRequestPatch: PagesFunction<Env, 'id'> = async ({ params, request, env }) => {
  const id = parseId(params.id);
  const body = readObject(await readJson(request));
  const { value, errors } = normalizeOrder(body, { partial: true });
  if (Object.keys(errors).length) throw new HttpError(422, 'Validation failed', errors);
  if (!Object.keys(value).length) throw new HttpError(400, 'No updatable fields in request');
  const sql = getSql(env);
  const { text, params: values } = buildUpdate(id, value);
  const rows = await query(sql, text, values);
  if (!rows[0]) throw new HttpError(404, 'Sales order not found');
  return json(await fetchOrder(sql, id));
};

export const onRequestDelete: PagesFunction<Env, 'id'> = async ({ params, env }) => {
  const id = parseId(params.id);
  const rows = await query(getSql(env), 'DELETE FROM sales_orders WHERE id = $1 RETURNING id', [id]);
  if (!rows[0]) throw new HttpError(404, 'Sales order not found');
  return json({ ok: true, id });
};
