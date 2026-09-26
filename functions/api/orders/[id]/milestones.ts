import { normalizeMilestone } from '../../../../shared/schema';
import { MILESTONE_SELECT, getSql, query } from '../../../_lib/db';
import { HttpError, json, parseId, readJson, readObject, type Env } from '../../../_lib/http';

export const onRequestGet: PagesFunction<Env, 'id'> = async ({ params, env }) => {
  const soId = parseId(params.id);
  const sql = getSql(env);
  const [exists, rows] = await Promise.all([
    query(sql, 'SELECT 1 FROM sales_orders WHERE id = $1', [soId]),
    query(sql, `SELECT ${MILESTONE_SELECT} FROM milestones WHERE so_id = $1 ORDER BY sort_order, due_date NULLS LAST, id`, [soId]),
  ]);
  if (!exists[0]) throw new HttpError(404, 'Sales order not found');
  return json(rows);
};

export const onRequestPost: PagesFunction<Env, 'id'> = async ({ params, request, env }) => {
  const soId = parseId(params.id);
  const { value, errors } = normalizeMilestone(readObject(await readJson(request)));
  if (Object.keys(errors).length) throw new HttpError(422, 'Validation failed', errors);
  const rows = await query(
    getSql(env),
    `INSERT INTO milestones (so_id, name, due_date, done, sort_order)
     SELECT so.id, $2, $3::date, $4::boolean,
            COALESCE($5::int, (SELECT COALESCE(max(sort_order), -1) + 1 FROM milestones WHERE so_id = so.id))
     FROM sales_orders so WHERE so.id = $1
     RETURNING ${MILESTONE_SELECT}`,
    [soId, value.name, value.due_date ?? null, value.done ?? false, value.sort_order ?? null],
  );
  if (!rows[0]) throw new HttpError(404, 'Sales order not found');
  return json(rows[0], { status: 201 });
};
