import { sessionCookie } from '../_lib/auth';
import { json } from '../_lib/http';

export const onRequestPost: PagesFunction = async () =>
  json({ ok: true }, { headers: { 'Set-Cookie': sessionCookie('', 0) } });
