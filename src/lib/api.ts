import type { BulkRowResult, DashboardData, Milestone, OrderInput, SalesOrder } from '../../shared/schema';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: Record<string, string>,
  ) {
    super(message);
  }
}

export const UNAUTHORIZED_EVENT = 'so:unauthorized';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/login') window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    const details = data?.details as Record<string, string> | undefined;
    const msg = details ? `${data.error}: ${Object.values(details).join('; ')}` : (data?.error ?? `Request failed (${res.status})`);
    throw new ApiError(res.status, msg, details);
  }
  return data as T;
}

export interface BulkResponse {
  results: BulkRowResult[];
  created: number;
  updated: number;
  failed: number;
}

export const api = {
  session: () => request<{ authenticated: boolean }>('GET', '/api/session'),
  login: (passphrase: string) => request<{ ok: true }>('POST', '/api/login', { passphrase }),
  logout: () => request<{ ok: true }>('POST', '/api/logout'),

  listOrders: () => request<SalesOrder[]>('GET', '/api/orders'),
  createOrder: (input: OrderInput) => request<SalesOrder>('POST', '/api/orders', input),
  updateOrder: (id: number, patch: OrderInput) => request<SalesOrder>('PATCH', `/api/orders/${id}`, patch),
  deleteOrder: (id: number) => request<{ ok: true }>('DELETE', `/api/orders/${id}`),
  bulkCreate: (rows: OrderInput[], onConflict: 'skip' | 'update') =>
    request<BulkResponse>('POST', '/api/orders/bulk', { rows, on_conflict: onConflict }),

  listMilestones: (soId: number) => request<Milestone[]>('GET', `/api/orders/${soId}/milestones`),
  createMilestone: (soId: number, input: Partial<Omit<Milestone, 'id' | 'so_id'>>) =>
    request<Milestone>('POST', `/api/orders/${soId}/milestones`, input),
  updateMilestone: (id: number, patch: Partial<Omit<Milestone, 'id' | 'so_id'>>) =>
    request<Milestone>('PATCH', `/api/milestones/${id}`, patch),
  deleteMilestone: (id: number) => request<{ ok: true }>('DELETE', `/api/milestones/${id}`),

  dashboard: (type: 'all' | 'normal' | 'project') => request<DashboardData>('GET', `/api/dashboard?type=${type}`),
};
