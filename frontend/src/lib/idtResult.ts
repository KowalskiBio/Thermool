/** Reads the fields Thermool shows out of IDT OligoAnalyzer's raw JSON.
 * Key spellings follow what Oligool/Primerool have seen IDT return, with
 * alternates tried in order; anything unrecognised stays visible in the
 * raw-data view. */

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function num(o: Obj, keys: string[], lo = -Infinity, hi = Infinity): number | null {
  for (const k of keys) {
    const v = o[k];
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    // IDT uses out-of-range placeholders (e.g. +997.97 kcal/mol,
    // 146888 °C) when a sequence cannot fold: treat them as "none".
    if (Number.isFinite(n)) return n > lo && n < hi ? n : null;
  }
  return null;
}

const DG_KEYS = ['DeltaG', 'deltaG', 'dG', 'delta_g', 'Energy', 'energy'];
const TM_KEYS = ['Tm', 'MeltTemp', 'MeltingTemperature', 'MeltingTemp', 'tm', 'meltTemp', 'thermo'];

export interface IdtProps {
  tm: number | null;
  gc: number | null;
  mw: number | null;
  ext: number | null;
  length: number | null;
}

export function readAnalyze(raw: unknown): IdtProps {
  const o = isObj(raw) ? raw : {};
  return {
    tm: num(o, TM_KEYS, -100, 200),
    gc: num(o, ['GCContent', 'GcContent', 'GC', 'gcContent']),
    mw: num(o, ['MolecularWeight', 'MolWeight', 'molecularWeight']),
    ext: num(o, ['ExtinctionCoefficient', 'Extinction', 'extinctionCoefficient']),
    length: num(o, ['Length', 'SequenceLength', 'length']),
  };
}

export interface IdtStructure {
  dg: number | null;
  tm: number | null;
  /** Hairpin dot-bracket, when IDT returns one matching the sequence length. */
  dotBracket: string | null;
  /** Dimer: IDT's own three-line duplex (top strand, bonds, bottom strand). */
  duplex: string[] | null;
}

/** IDT answers with an array of structures, or an object wrapping one. */
function items(raw: unknown): Obj[] {
  if (Array.isArray(raw)) return raw.filter(isObj);
  if (isObj(raw)) {
    const nested = Object.values(raw).find((v) => Array.isArray(v) && v.length > 0 && v.every(isObj));
    return nested ? (nested as Obj[]) : [raw];
  }
  return [];
}

function dotBracketOf(o: Obj, length: number): string | null {
  for (const k of ['DotBracket', 'Structure', 'StructureDotBracket', 'dotBracket', 'AsciiStructure']) {
    const v = o[k];
    if (typeof v === 'string' && v.length === length && /^[.()]+$/.test(v) && v.includes('(')) return v;
  }
  return null;
}

function duplexOf(o: Obj, top: string, bottom: string): string[] | null {
  const bonds = o.Bonds;
  if (!Array.isArray(bonds) || bonds.length === 0) return null;
  const pad = (k: string) => ' '.repeat(Math.max(0, Number(o[k]) || 0));
  const bondLine = bonds.map((b) => (b === 2 ? '|' : b === 1 ? ':' : ' ')).join('');
  return [`5' ${pad('TopLinePadding')}${top} 3'`, `   ${pad('BondLinePadding')}${bondLine}`, `3' ${pad('BottomLinePadding')}${[...bottom].reverse().join('')} 5'`];
}

/** Structures from a Hairpin / SelfDimer / HeteroDimer response, most
 * stable first. `partner` is the second strand for a dimer. */
export function readStructures(raw: unknown, sequence: string, partner?: string): IdtStructure[] {
  const dimer = partner !== undefined;
  const out = items(raw).map((o) => ({
    dg: num(o, DG_KEYS, -200, 50),
    tm: num(o, TM_KEYS, -100, 200),
    dotBracket: dimer ? null : dotBracketOf(o, sequence.length),
    duplex: dimer ? duplexOf(o, sequence, partner) : null,
  }));
  return out.filter((s) => s.dg !== null || s.tm !== null || s.duplex || s.dotBracket).sort((a, b) => (a.dg ?? Infinity) - (b.dg ?? Infinity));
}
