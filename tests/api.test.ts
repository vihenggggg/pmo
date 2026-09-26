// Integration tests for the Pages Functions against a real Postgres.
// Run with: TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1/so_test npm test
// The Neon HTTP driver is swapped for node-postgres so the same SQL runs locally.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import pg from 'pg';

const DB_URL = process.env.TEST_DATABASE_URL;
const pool = DB_URL ? new pg.Pool({ connectionString: DB_URL }) : null;

vi.mock('@neondatabase/serverless', () => ({
  neon: () => ({ query: async (text: string, params: unknown[]) => (await pool!.query(text, params)).rows }),
}));

const { onRequest: middleware } = await import('../functions/api/_middleware');
const login = await import('../functions/api/login');
const orders = await import('../functions/api/orders/index');
const bulk = await import('../functions/api/orders/bulk');
const order = await import('../functions/api/orders/[id]/index');
const soMilestones = await import('../functions/api/orders/[id]/milestones');
const milestone = await import('../functions/api/milestones/[id]');
const dashboard = await import('../functions/api/dashboard');

const env = { DATABASE_URL: 'postgres://mock', APP_PASSPHRASE: 'secret' };

type Handler = (ctx: any) => Promise<Response>;
async function call(handler: Handler | undefined, method: string, path: string, body?: unknown, params: Record<string, string> = {}, cookie = '') {
  const request = new Request(`http://localhost${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // Route through the auth middleware exactly as Pages would.
  const res = await (middleware as Handler)({ request, env, params, next: () => handler!({ request, env, params }) });
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
}

let cookie = '';

describe.skipIf(!DB_URL)('API', () => {
  beforeEach(async () => {
    await pool!.query('TRUNCATE sales_orders RESTART IDENTITY CASCADE');
    if (!cookie) {
      const res = await call(login.onRequestPost as Handler, 'POST', '/api/login', { passphrase: 'secret' });
      cookie = res.headers.get('Set-Cookie')!.split(';')[0];
    }
  });
  afterAll(() => pool?.end());

  it('rejects unauthenticated requests and bad passphrases', async () => {
    expect((await call(orders.onRequestGet as Handler, 'GET', '/api/orders')).status).toBe(401);
    expect((await call(orders.onRequestGet as Handler, 'GET', '/api/orders', undefined, {}, 'so_session=v1.9999999999.forged')).status).toBe(401);
    expect((await call(login.onRequestPost as Handler, 'POST', '/api/login', { passphrase: 'nope' })).status).toBe(401);
  });

  it('creates, lists, filters, patches and deletes orders', async () => {
    const created = await call(orders.onRequestPost as Handler, 'POST', '/api/orders', {
      customer: 'Acme', so_number: 'SO-1', so_date: '05-Mar-2025', contract_value: '$1,500.50', invoiced_amt: 500, status: 'in progress',
    }, {}, cookie);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ so_number: 'SO-1', so_date: '2025-03-05', contract_value: 1500.5, remaining_balance: 1000.5, status: 'In Progress', type: 'normal' });

    const dupe = await call(orders.onRequestPost as Handler, 'POST', '/api/orders', { customer: 'Acme', so_number: 'SO-1' }, {}, cookie);
    expect(dupe.status).toBe(409);
    const invalid = await call(orders.onRequestPost as Handler, 'POST', '/api/orders', { so_number: 'X', status: 'weird' }, {}, cookie);
    expect(invalid.status).toBe(422);
    expect(Object.keys(invalid.body.details).sort()).toEqual(['customer', 'status']);

    await call(orders.onRequestPost as Handler, 'POST', '/api/orders', { customer: 'Beta', so_number: 'SO-2', type: 'Project', service_type: 'Install' }, {}, cookie);
    expect((await call(orders.onRequestGet as Handler, 'GET', '/api/orders?type=project', undefined, {}, cookie)).body).toHaveLength(1);
    expect((await call(orders.onRequestGet as Handler, 'GET', '/api/orders?status=In%20Progress,Pending', undefined, {}, cookie)).body).toHaveLength(2);
    expect((await call(orders.onRequestGet as Handler, 'GET', '/api/orders?q=bet', undefined, {}, cookie)).body[0].so_number).toBe('SO-2');

    const id = String(created.body.id);
    const flagged = await call(order.onRequestPatch as Handler, 'PATCH', `/api/orders/${id}`, { is_issue: true, issue_note: 'Late payment' }, { id }, cookie);
    expect(flagged.status).toBe(200);
    expect(flagged.body.is_issue).toBe(true);
    expect(flagged.body.issue_flagged_at).toBeTruthy();
    expect(flagged.body.customer).toBe('Acme');
    expect((await call(orders.onRequestGet as Handler, 'GET', '/api/orders?issue=true', undefined, {}, cookie)).body).toHaveLength(1);
    const unflagged = await call(order.onRequestPatch as Handler, 'PATCH', `/api/orders/${id}`, { is_issue: false }, { id }, cookie);
    expect(unflagged.body.issue_flagged_at).toBeNull();

    expect((await call(order.onRequestPatch as Handler, 'PATCH', `/api/orders/${id}`, { customer: '' }, { id }, cookie)).status).toBe(422);
    expect((await call(order.onRequestPatch as Handler, 'PATCH', '/api/orders/999', { customer: 'x' }, { id: '999' }, cookie)).status).toBe(404);
    expect((await call(order.onRequestDelete as Handler, 'DELETE', `/api/orders/${id}`, undefined, { id }, cookie)).status).toBe(200);
    expect((await call(order.onRequestDelete as Handler, 'DELETE', `/api/orders/${id}`, undefined, { id }, cookie)).status).toBe(404);
  });

  it('bulk imports with per-row results and conflict handling', async () => {
    await call(orders.onRequestPost as Handler, 'POST', '/api/orders', { customer: 'Old', so_number: 'SO-EXIST', internal_notes: 'keep me' }, {}, cookie);
    const rows = [
      { customer: 'A', so_number: 'SO-10', contract_value: '1,000', deadline: '45658' },
      { customer: 'B', so_number: 'SO-11', status: 'Delivered', type: 'project', is_issue: 'yes', issue_note: 'x' },
      { customer: '', so_number: 'SO-12' },
      { customer: 'C', so_number: 'SO-10' },
      { customer: 'D', so_number: 'SO-EXIST' },
      'garbage',
    ];
    const res = await call(bulk.onRequestPost as Handler, 'POST', '/api/orders/bulk', rows, {}, cookie);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 2, updated: 0, failed: 4 });
    expect(res.body.results.map((r: any) => r.ok)).toEqual([true, true, false, false, false, false]);
    expect(res.body.results[4].errors.so_number).toMatch(/already exists/);

    const upd = await call(bulk.onRequestPost as Handler, 'POST', '/api/orders/bulk', { rows: [{ customer: 'D', so_number: 'SO-EXIST', status: 'Closed' }], on_conflict: 'update' }, {}, cookie);
    expect(upd.body).toMatchObject({ created: 0, updated: 1, failed: 0 });
    const list = (await call(orders.onRequestGet as Handler, 'GET', '/api/orders', undefined, {}, cookie)).body;
    const existing = list.find((o: any) => o.so_number === 'SO-EXIST');
    expect(existing).toMatchObject({ customer: 'D', status: 'Closed', internal_notes: 'keep me' });
    expect(list.find((o: any) => o.so_number === 'SO-10').deadline).toBe('2025-01-01');
    expect(list.find((o: any) => o.so_number === 'SO-11').issue_flagged_at).toBeTruthy();
  });

  it('manages milestones', async () => {
    const so = await call(orders.onRequestPost as Handler, 'POST', '/api/orders', { customer: 'P', so_number: 'PRJ-1', type: 'project' }, {}, cookie);
    const id = String(so.body.id);
    const m1 = await call(soMilestones.onRequestPost as Handler, 'POST', `/api/orders/${id}/milestones`, { name: 'Site Survey', due_date: '2025-04-01' }, { id }, cookie);
    const m2 = await call(soMilestones.onRequestPost as Handler, 'POST', `/api/orders/${id}/milestones`, { name: 'Install' }, { id }, cookie);
    expect(m1.status).toBe(201);
    expect([m1.body.sort_order, m2.body.sort_order]).toEqual([0, 1]);
    expect((await call(soMilestones.onRequestPost as Handler, 'POST', '/api/orders/999/milestones', { name: 'x' }, { id: '999' }, cookie)).status).toBe(404);
    expect((await call(soMilestones.onRequestPost as Handler, 'POST', `/api/orders/${id}/milestones`, { name: ' ' }, { id }, cookie)).status).toBe(422);

    const mid = String(m1.body.id);
    const toggled = await call(milestone.onRequestPatch as Handler, 'PATCH', `/api/milestones/${mid}`, { done: true }, { id: mid }, cookie);
    expect(toggled.body).toMatchObject({ done: true, name: 'Site Survey', due_date: '2025-04-01' });
    const list = await call(soMilestones.onRequestGet as Handler, 'GET', `/api/orders/${id}/milestones`, undefined, { id }, cookie);
    expect(list.body.map((m: any) => m.name)).toEqual(['Site Survey', 'Install']);
    const soAfter = await call(order.onRequestGet as Handler, 'GET', `/api/orders/${id}`, undefined, { id }, cookie);
    expect(soAfter.body).toMatchObject({ milestone_count: 2, milestones_done: 1 });

    expect((await call(milestone.onRequestDelete as Handler, 'DELETE', `/api/milestones/${mid}`, undefined, { id: mid }, cookie)).status).toBe(200);
    await call(order.onRequestDelete as Handler, 'DELETE', `/api/orders/${id}`, undefined, { id }, cookie);
    expect((await pool!.query('SELECT count(*)::int AS n FROM milestones')).rows[0].n).toBe(0);
  });

  it('aggregates the dashboard', async () => {
    await call(bulk.onRequestPost as Handler, 'POST', '/api/orders/bulk', [
      { customer: 'A', so_number: '1', contract_value: 1000, invoiced_amt: 250, status: 'Pending' },
      { customer: 'B', so_number: '2', contract_value: 3000, invoiced_amt: 3000, status: 'Closed', type: 'project' },
      { customer: 'C', so_number: '3', contract_value: 0, status: 'Cancelled', is_issue: true, issue_note: 'Customer walked' },
    ], {}, cookie);
    const all = (await call(dashboard.onRequestGet as Handler, 'GET', '/api/dashboard', undefined, {}, cookie)).body;
    expect(all.totals).toEqual({ count: 3, contract_value: 4000, invoiced: 3250, remaining: 750, collection_rate: 81.25 });
    expect(all.status_breakdown.find((s: any) => s.status === 'Pending')).toMatchObject({ count: 1 });
    expect(all.status_breakdown).toHaveLength(6);
    expect(all.issues).toHaveLength(1);
    expect(all.collection.map((c: any) => c.so_number)).toEqual(['1', '2']);
    expect(all.collection[0].pct).toBe(25);
    const proj = (await call(dashboard.onRequestGet as Handler, 'GET', '/api/dashboard?type=project', undefined, {}, cookie)).body;
    expect(proj.totals.count).toBe(1);
    expect((await call(dashboard.onRequestGet as Handler, 'GET', '/api/dashboard?type=bogus', undefined, {}, cookie)).status).toBe(400);
  });
});
