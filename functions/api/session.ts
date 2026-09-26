import { isAuthenticated } from '../_lib/auth';
import { json, type Env } from '../_lib/http';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) =>
  json({ authenticated: await isAuthenticated(request, env) });
