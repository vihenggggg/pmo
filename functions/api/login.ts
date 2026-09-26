import { createSessionToken, passphraseMatches, sessionCookie } from '../_lib/auth';
import { json, readJson, readObject, type Env } from '../_lib/http';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.APP_PASSPHRASE) return json({ error: 'APP_PASSPHRASE is not configured on the server' }, { status: 500 });
  const body = readObject(await readJson(request));
  const given = typeof body.passphrase === 'string' ? body.passphrase : '';
  if (!(await passphraseMatches(env.APP_PASSPHRASE, given))) {
    await new Promise((r) => setTimeout(r, 500)); // slow down guessing
    return json({ error: 'Incorrect passphrase' }, { status: 401 });
  }
  const token = await createSessionToken(env.APP_PASSPHRASE);
  return json({ ok: true }, { headers: { 'Set-Cookie': sessionCookie(token) } });
};
