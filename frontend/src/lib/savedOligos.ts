import { parseOligo } from './format';

/** An oligo the user kept, exactly as typed (case carries LNA). */
export interface SavedOligo {
  id: string;
  name: string;
  sequence: string;
  partner?: string;
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

/** A name to start from: the FASTA header if there is one, else "Oligo N". */
export function suggestName(sequence: string, existing: SavedOligo[]): string {
  const header = sequence
    .split('\n')
    .find((l) => l.trimStart().startsWith('>'))
    ?.trim()
    .slice(1)
    .trim();
  if (header) return header;
  const used = new Set(existing.map((o) => o.name));
  let n = existing.length + 1;
  while (used.has(`Oligo ${n}`)) n++;
  return `Oligo ${n}`;
}

export function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}
