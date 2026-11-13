import { parseOligo } from './format';

/** An oligo the user kept, exactly as typed (case carries LNA). With a
 * partner it is a primer pair: `name` names the pair, `sequenceName` and
 * `partnerName` the two primers (older entries may lack those two). */
export interface SavedOligo {
  id: string;
  name: string;
  sequence: string;
  sequenceName?: string;
  partner?: string;
  partnerName?: string;
  savedAt: number;
}

const KEY = 'thermool-saved-oligos';

/** Saved oligos live in this browser only; a blocked or full storage just
 * means nothing is remembered. */
export function loadSavedOligos(): SavedOligo[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((o): o is SavedOligo => !!o && typeof o.id === 'string' && typeof o.name === 'string' && typeof o.sequence === 'string') : [];
  } catch {
    return [];
  }
}

export function storeSavedOligos(list: SavedOligo[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* not remembered */
  }
}

/** Two entries are the same oligo when they read the same (bases and LNA
 * positions), whatever the spacing, case style or FASTA header. */
export const oligoKey = (sequence: string, partner?: string) => `${parseOligo(sequence).notation}|${partner ? parseOligo(partner).notation : ''}`;

/** The FASTA header line, without ">", if the text has one. */
export function fastaHeader(sequence: string): string | undefined {
  return (
    sequence
      .split('\n')
      .find((l) => l.trimStart().startsWith('>'))
      ?.trim()
      .slice(1)
      .trim() || undefined
  );
}

function nextFree(prefix: string, existing: SavedOligo[]): string {
  const used = new Set(existing.map((o) => o.name));
  let n = existing.filter((o) => (prefix === 'Pair') === !!o.partner).length + 1;
  while (used.has(`${prefix} ${n}`)) n++;
  return `${prefix} ${n}`;
}

/** A name to start from: the FASTA header if there is one, else "Oligo N". */
export function suggestName(sequence: string, existing: SavedOligo[]): string {
  return fastaHeader(sequence) ?? nextFree('Oligo', existing);
}

/** Drops a primer-direction suffix: "GAPDH-F", "GAPDH_fwd", "GAPDH rev" read as "GAPDH". */
const stripDirection = (name: string) => name.replace(/[\s_-]+(f|r|fw|fwd|rv|rev|forward|reverse|left|right)$/i, '').trim();

/** Names to start a primer pair from. The pair is the primers' shared
 * name ("GAPDH" from "GAPDH-F" and "GAPDH-R"), else "Pair N"; a primer
 * without a FASTA header becomes "<pair>-F" or "<pair>-R". */
export function suggestPairNames(sequence: string, partner: string, existing: SavedOligo[]): { pair: string; sequenceName?: string; partnerName?: string } {
  const a = fastaHeader(sequence);
  const b = fastaHeader(partner);
  const stem = a && stripDirection(a);
  const pair = stem && (!b || stripDirection(b) === stem) ? stem : nextFree('Pair', existing);
  return { pair, sequenceName: a, partnerName: b };
}

export const forwardName = (pair: string) => `${pair}-F`;
export const reverseName = (pair: string) => `${pair}-R`;

export function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}
