export const fmt = (v: number | null | undefined, digits: number) => (v === null || v === undefined || !Number.isFinite(v) ? null : v.toFixed(digits));

/** Structure Tm; far-below-zero values are extrapolations for barely
 * bound structures, not temperatures anyone will see. */
export const fmtTm = (v: number | null | undefined) => (v !== null && v !== undefined && Number.isFinite(v) && v < 0 ? '< 0' : fmt(v, 1));

/** Hairpin ΔG at 25 °C, dimer ΔG at 37 °C: common rules of thumb for
 * when a structure is likely to interfere (IDT's guidance for dimers is
 * about -9 kcal/mol). */
export function dgLevel(dg: number | null, kind: 'hairpin' | 'dimer'): 'ok' | 'warn' | 'bad' {
  if (dg === null) return 'ok';
  const [warn, bad] = kind === 'hairpin' ? [-2, -3] : [-6, -9];
  return dg <= bad ? 'bad' : dg <= warn ? 'warn' : 'ok';
}

export const LEVEL_TEXT = { ok: 'text-ink', warn: 'text-warning', bad: 'text-danger' } as const;

export interface ParsedOligo {
  /** Uppercase DNA bases (LNA read as its base). */
  dna: string;
  /** `lna[i]`: base `i` is a locked nucleic acid. */
  lna: boolean[];
  /** IDT-style notation, "+" before each LNA base; what the server gets. */
  notation: string;
  lnaCount: number;
}

/** Client-side mirror of the server's `parse_oligo`, for live length, GC
 * and LNA count: drops FASTA headers, whitespace and digits, reads U as T.
 * LNA is a leading "+" ("+A"), or lowercase in a sequence that mixes cases
 * ("agGCtG"); an all-lowercase sequence is plain DNA. Invalid characters
 * are kept so the server can name them. */
export function parseOligo(raw: string): ParsedOligo {
  const chars = [...raw.split('\n').filter((l) => !l.trimStart().startsWith('>')).join('').replace(/[\s\d]/g, '')];
  const lowerIsLna = chars.some((c) => /[A-Z]/.test(c)) && chars.some((c) => /[a-z]/.test(c));
  let dna = '';
  let notation = '';
  const lna: boolean[] = [];
  let plus = false;
  for (const c of chars) {
    if (c === '+') {
      if (plus) notation += '+';
      plus = true;
      continue;
    }
    const base = c.toUpperCase() === 'U' ? 'T' : c.toUpperCase();
    const isLna = plus || (lowerIsLna && /[a-z]/.test(c));
    dna += base;
    notation += (isLna ? '+' : '') + base;
    lna.push(isLna);
    plus = false;
  }
  if (plus) notation += '+';
  return { dna, lna, notation, lnaCount: lna.filter(Boolean).length };
}

/** Client-side mirror of the server's cleaning: DNA bases only. */
export function cleanSequence(raw: string): string {
  return parseOligo(raw).dna;
}
