/** Reads the fields Thermool shows out of IDT OligoAnalyzer's raw JSON.
 *
 * IDT's API spec types every OligoAnalyzer response as a bare "object",
 * so the reader is deliberately shape-tolerant: arrays are unwrapped,
 * structure lists are found wherever they are nested, and field names are
 * matched case- and punctuation-insensitively ("DeltaG", "deltaG",
 * "delta_g" all match). Anything still unreadable shows up in the
 * raw-response view. */

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

function field(o: Obj, aliases: string[]): unknown {
  const wanted = aliases.map(norm);
  for (const w of wanted) {
    for (const [k, v] of Object.entries(o)) if (norm(k) === w) return v;
  }
  return undefined;
}

function num(o: Obj, aliases: string[], lo = -Infinity, hi = Infinity): number | null {
  const v = field(o, aliases);
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  // IDT uses out-of-range placeholders (e.g. +997.97 kcal/mol, 146888 °C)
  // when a sequence cannot fold: treat them as "none".
  return Number.isFinite(n) && n > lo && n < hi ? n : null;
}

const DG = ['DeltaG', 'dG', 'Energy', 'FreeEnergy', 'DeltaGKcal'];
const TM = ['Tm', 'MeltTemp', 'MeltingTemperature', 'MeltingTemp', 'MeltTemperature'];

/** The first object in `raw`, unwrapping arrays (Analyze may answer with one). */
function firstObj(raw: unknown): Obj | null {
  if (Array.isArray(raw)) return raw.map(firstObj).find((o) => o !== null) ?? null;
  return isObj(raw) ? raw : null;
}

export interface IdtProps {
  tm: number | null;
  gc: number | null;
  length: number | null;
}

export function readAnalyze(raw: unknown): IdtProps {
  const o = firstObj(raw) ?? {};
  return {
    tm: num(o, TM, -100, 200),
    gc: num(o, ['GCContent', 'GC', 'GCPercent', 'GCPercentage']),
    length: num(o, ['Length', 'SequenceLength']),
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

const hasValues = (o: Obj) => num(o, DG, -200, 50) !== null || num(o, TM, -100, 200) !== null || Array.isArray(field(o, ['Bonds']));

/** Every object in `raw` that looks like one structure, depth-first. */
function structureItems(raw: unknown, depth = 0): Obj[] {
  if (depth > 4) return [];
  if (Array.isArray(raw)) return raw.flatMap((v) => structureItems(v, depth + 1));
  if (!isObj(raw)) return [];
  if (hasValues(raw)) return [raw];
  return Object.values(raw).flatMap((v) => (Array.isArray(v) || isObj(v) ? structureItems(v, depth + 1) : []));
}

function dotBracketOf(o: Obj, length: number): string | null {
  for (const k of ['DotBracket', 'Structure', 'StructureDotBracket', 'AsciiStructure', 'VisualPrint']) {
    const v = field(o, [k]);
    if (typeof v === 'string' && v.length === length && /^[.()]+$/.test(v) && v.includes('(')) return v;
  }
  return null;
}

function duplexOf(o: Obj, top: string, bottom: string): string[] | null {
  const bonds = field(o, ['Bonds']);
  if (!Array.isArray(bonds) || bonds.length === 0) return null;
  const pad = (k: string) => ' '.repeat(Math.max(0, Number(field(o, [k])) || 0));
  const bondLine = bonds.map((b) => (b === 2 ? '|' : b === 1 ? ':' : ' ')).join('');
  return [`5' ${pad('TopLinePadding')}${top} 3'`, `   ${pad('BondLinePadding')}${bondLine}`, `3' ${pad('BottomLinePadding')}${[...bottom].reverse().join('')} 5'`];
}

/** Structures from a Hairpin / SelfDimer / HeteroDimer response, most
 * stable first. `partner` is the second strand for a dimer. */
export function readStructures(raw: unknown, sequence: string, partner?: string): IdtStructure[] {
  const dimer = partner !== undefined;
  return structureItems(raw)
    .map((o) => ({
      dg: num(o, DG, -200, 50),
      tm: num(o, TM, -100, 200),
      dotBracket: dimer ? null : dotBracketOf(o, sequence.length),
      duplex: dimer ? duplexOf(o, sequence, partner) : null,
    }))
    .filter((s) => s.dg !== null || s.tm !== null || s.duplex || s.dotBracket)
    .sort((a, b) => (a.dg ?? Infinity) - (b.dg ?? Infinity));
}
