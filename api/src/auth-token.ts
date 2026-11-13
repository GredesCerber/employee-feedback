import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** Signing key: SESSION_SECRET from the environment, otherwise random per process (restart signs everybody out). */
const secret = process.env.SESSION_SECRET?.trim() || randomBytes(32).toString('hex');
const TOKEN_TTL_MS = 12 * 3_600_000;
export const DEFAULT_DEMO_PASSWORD = 'demo1234';

const sign = (payload: string) => createHmac('sha256', secret).update(payload).digest('base64url');

export function issueToken(userId: string, now = Date.now()): string {
  const payload = `${userId}.${now + TOKEN_TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

/** The user id from a valid, unexpired token, otherwise null. */
export function verifyToken(token: string, now = Date.now()): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, expires, signature] = parts as [string, string, string];
  const expected = sign(`${userId}.${expires}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return Number(expires) > now ? userId : null;
}

/** scrypt hash in the form scrypt$salt$hash (base64url). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64url')}$${scryptSync(password, salt, 32).toString('base64url')}`;
}
export function checkPassword(password: string, stored: string): boolean {
  const [kind, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = scryptSync(password, Buffer.from(salt, 'base64url'), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
