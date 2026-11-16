import type { IdtKind } from './api';
import { conditionsKey, type Conditions } from './conditions';
import { runIdt, type IdtCredentials } from './idt';

/** IDT OligoAnalyzer responses, remembered in this browser so the same
 * question (kind, sequence with LNA, partner, conditions) is asked of IDT
 * once: the app's IDT buttons and the report both read from here first.
 * Only successful answers are kept; storage that is blocked or full just
 * means fewer hits. */

const KEY = 'thermool-idt-cache';
/** Oldest entries go first beyond this many (a hairpin answer is a few kB). */
const MAX_ENTRIES = 300;
/** IDT can change its models; re-ask after a month. */
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;

interface Entry {
  raw: unknown;
  at: number;
}

let memory: Map<string, Entry> | null = null;

function cache(): Map<string, Entry> {
  if (memory) return memory;
  memory = new Map();
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    if (Array.isArray(stored)) {
      const now = Date.now();
      for (const item of stored) {
        if (Array.isArray(item) && typeof item[0] === 'string' && item[1] && typeof item[1].at === 'number' && now - item[1].at < MAX_AGE_MS) memory.set(item[0], item[1]);
      }
    }
  } catch {
    /* unreadable: start empty */
  }
  return memory;
}

function persist() {
  const m = cache();
  for (let tries = 0; tries < 3; tries++) {
    try {
      localStorage.setItem(KEY, JSON.stringify([...m]));
      return;
    } catch {
      // Full: drop the older half and try again.
      [...m.keys()].slice(0, Math.ceil(m.size / 2)).forEach((k) => m.delete(k));
    }
  }
}

/** One key per IDT question. The app's IDT state uses the same keys. */
export const idtKey = (kind: IdtKind, c: Conditions, seq: string, partner?: string) => `${kind}|${conditionsKey(c)}|${seq}|${partner ?? ''}`;

/** IDT's remembered answer, or `undefined` if it was never asked (or expired). */
export function cachedIdt(kind: IdtKind, c: Conditions, seq: string, partner?: string): unknown {
  const e = cache().get(idtKey(kind, c, seq, partner));
  return e && Date.now() - e.at < MAX_AGE_MS ? e.raw : undefined;
}

function remember(key: string, raw: unknown) {
  const m = cache();
  m.delete(key); // re-insert as newest
  m.set(key, { raw, at: Date.now() });
  while (m.size > MAX_ENTRIES) m.delete(m.keys().next().value!);
  persist();
}

/** `runIdt`, answered from the cache when IDT was already asked. */
export async function runIdtCached(creds: IdtCredentials, kind: IdtKind, seq: string, c: Conditions, partner?: string): Promise<unknown> {
  const hit = cachedIdt(kind, c, seq, partner);
  if (hit !== undefined) return hit;
  const raw = await runIdt(creds, kind, seq, c, partner);
  remember(idtKey(kind, c, seq, partner), raw);
  return raw;
}
