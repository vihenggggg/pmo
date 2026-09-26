import { normalizeMilestone } from '../../../shared/schema';
import { MILESTONE_SELECT, getSql, query } from '../../_lib/db';
import { HttpError, json, parseId, readJson, readObject, type Env } from '../../_lib/http';

const TYPES: Record<string, string> = { name: 'text', due_date: 'date', done: 'boolean', sort_order: 'int' };

export const onRequestPatch: PagesFunction<Env, 'id'> = async ({ params, request, env }) => {
  const id = parseId(params.id);
  const { value, errors } = normalizeMilestone(readObject(await readJson(request)), { partial: true });
  if (Object.keys(errors).length) throw new HttpError(422, 'Validation failed', errors);
  const cols = Object.keys(value) as (keyof typeof value)[];
  if (!cols.length) throw new HttpError(400, 'No updatable fields in request');
  const values: unknown[] = cols.map((c) => value[c]);
  const sets = cols.map((c, i) => `${c} = $${i + 1}::${TYPES[c]}`);
  values.push(id);
  const rows = await query(
    getSql(env),
    `UPDATE milestones SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING ${MILESTONE_SELECT}`,
    values,
  );
  if (!rows[0]) throw new HttpError(404, 'Milestone not found');
  return json(rows[0]);
};

export const onRequestDelete: PagesFunction<Env, 'id'> = async ({ params, env }) => {
  const id = parseId(params.id);
  const rows = await query(getSql(env), 'DELETE FROM milestones WHERE id = $1 RETURNING id', [id]);
  if (!rows[0]) throw new HttpError(404, 'Milestone not found');
  return json({ ok: true, id });
};
