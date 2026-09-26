import { isAuthenticated } from '../_lib/auth';
import { errorResponse, json, type Env } from '../_lib/http';

const PUBLIC_PATHS = new Set(['/api/login', '/api/logout', '/api/session']);

export const onRequest: PagesFunction<Env> = async (ctx) => {
  try {
    const { pathname } = new URL(ctx.request.url);
    if (!PUBLIC_PATHS.has(pathname)) {
      if (!ctx.env.APP_PASSPHRASE) return json({ error: 'APP_PASSPHRASE is not configured' }, { status: 500 });
      if (!(await isAuthenticated(ctx.request, ctx.env))) return json({ error: 'Unauthorized' }, { status: 401 });
    }
    return await ctx.next();
  } catch (err) {
    return errorResponse(err);
  }
};
