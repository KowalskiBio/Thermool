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

/** Client-side mirror of the server's cleaning, for live length / GC. */
export function cleanSequence(raw: string): string {
  return raw
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('>'))
    .join('')
    .replace(/[\s\d]/g, '')
    .toUpperCase()
    .replace(/U/g, 'T');
}
