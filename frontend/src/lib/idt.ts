import { idtRun, idtToken, ApiError, type IdtKind, type IdtRegion } from './api';
import type { Conditions } from './conditions';
import { loadSecret, saveSecret } from './secretStore';

/** IDT OligoAnalyzer API credentials (same fields as Oligool/Primerool).
 * Stored encrypted in this browser (see `secretStore`) and only ever sent
 * to our server's `/api/idt/token`, which forwards them to IDT. */
export interface IdtCredentials {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  region: IdtRegion;
}

export const EMPTY_CREDENTIALS: IdtCredentials = { clientId: '', clientSecret: '', username: '', password: '', region: 'eu' };

const SECRET_NAME = 'idt_credentials';

export function hasCredentials(c: IdtCredentials): boolean {
  return Boolean(c.clientId && c.clientSecret && c.username && c.password);
}

export async function loadCredentials(): Promise<IdtCredentials> {
  const stored = await loadSecret(SECRET_NAME);
  if (!stored) return EMPTY_CREDENTIALS;
  try {
    return { ...EMPTY_CREDENTIALS, ...(JSON.parse(stored) as Partial<IdtCredentials>) };
  } catch {
    return EMPTY_CREDENTIALS;
  }
}

export async function saveCredentials(c: IdtCredentials | null): Promise<void> {
  cachedToken = null;
  await saveSecret(SECRET_NAME, c && hasCredentials(c) ? JSON.stringify(c) : '');
}

/** Last token, in memory only, so each IDT click doesn't resend the password. */
let cachedToken: { key: string; token: string; expiresAt: number } | null = null;

async function token(c: IdtCredentials, fresh = false): Promise<string> {
  const key = JSON.stringify(c);
  if (!fresh && cachedToken?.key === key && Date.now() < cachedToken.expiresAt) return cachedToken.token;
  const res = await idtToken({ client_id: c.clientId, client_secret: c.clientSecret, username: c.username, password: c.password, region: c.region });
  const lifetime = typeof res.expires_in === 'number' ? res.expires_in : 3600;
  cachedToken = { key, token: res.access_token, expiresAt: Date.now() + (lifetime - 60) * 1000 };
  return res.access_token;
}

/** Signs in once to check the credentials. */
export async function testCredentials(c: IdtCredentials): Promise<void> {
  await token(c, true);
}

/** One OligoAnalyzer call; retries once with a fresh token if IDT says the
 * cached one has expired. */
export async function runIdt(c: IdtCredentials, kind: IdtKind, sequence: string, conditions: Conditions, partner?: string): Promise<unknown> {
  const call = async (fresh: boolean) => idtRun({ kind, sequence, partner, conditions, token: await token(c, fresh), region: c.region });
  try {
    return await call(false);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && cachedToken) {
      cachedToken = null;
      return call(true);
    }
    throw e;
  }
}
