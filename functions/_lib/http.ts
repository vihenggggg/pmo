export interface Env {
  DATABASE_URL: string;
  APP_PASSPHRASE: string;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export async function readJson<T = unknown>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON');
  }
}

export function readObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Request body must be a JSON object');
  return body as Record<string, unknown>;
}

export function parseId(param: string | string[] | undefined): number {
  const raw = Array.isArray(param) ? param[0] : param;
  const id = Number(raw);
  if (!raw || !Number.isInteger(id) || id <= 0 || id > 2147483647) throw new HttpError(404, 'Not found');
  return id;
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return json({ error: err.message, ...(err.details ? { details: err.details } : {}) }, { status: err.status });
  }
  const code = (err as { code?: string } | null)?.code;
  if (code === '23505') return json({ error: 'That SO# already exists' }, { status: 409 });
  if (code === '22P02' || code === '22007' || code === '22008') return json({ error: 'Invalid value in request' }, { status: 400 });
  console.error(err);
  return json({ error: 'Internal server error' }, { status: 500 });
}
