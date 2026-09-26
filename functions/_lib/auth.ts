import type { Env } from './http';

export const SESSION_COOKIE = 'so_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer): string {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> | null {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

// The signing key is derived from the passphrase, so changing APP_PASSPHRASE logs out every session.
function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(`so-session:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function createSessionToken(secret: string, now = Date.now()): Promise<string> {
  const exp = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  const payload = `v1.${exp}`;
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(payload));
  return `${payload}.${b64url(sig)}`;
}

export async function verifySessionToken(secret: string, token: string, now = Date.now()): Promise<boolean> {
  const [version, expRaw, sigRaw] = token.split('.');
  if (version !== 'v1' || !expRaw || !sigRaw) return false;
  const exp = Number(expRaw);
  if (!Number.isInteger(exp) || exp * 1000 < now) return false;
  const sig = fromB64url(sigRaw);
  if (!sig) return false;
  return crypto.subtle.verify('HMAC', await hmacKey(secret), sig, enc.encode(`${version}.${expRaw}`));
}

export async function passphraseMatches(expected: string, given: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
    crypto.subtle.digest('SHA-256', enc.encode(given)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

export function sessionCookie(token: string, maxAge = SESSION_TTL_SECONDS): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export async function isAuthenticated(request: Request, env: Env): Promise<boolean> {
  const token = readCookie(request, SESSION_COOKIE);
  return !!token && !!env.APP_PASSPHRASE && verifySessionToken(env.APP_PASSPHRASE, token);
}
