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
  /** Base pairs IDT predicts, as "i-j" keys (see `pairKeys`), or null
   * when the response carries no structure to read them from. */
  pairs: Set<string> | null;
}

/** Pair keys comparable between IDT and Strider. Hairpin: "i-j" with
 * i < j over the one strand. Dimer: "i-j" with i on strand 1 and j on
 * strand 2 (0-based, 5' to 3'); for a self-dimer the two strands are the
 * same sequence, so (i, j) and (j, i) are one pair and the key is sorted. */
function key(i: number, j: number, selfDimer: boolean): string {
  return selfDimer && j < i ? `${j}-${i}` : `${i}-${j}`;
}

/** Pairs in a dot-bracket. With `nick` (dimer, structure over seq1 +
 * seq2), only pairs between the two strands are kept. */
export function pairKeys(dotBracket: string, nick?: number, selfDimer = false): Set<string> {
  const out = new Set<string>();
  const stack: number[] = [];
  for (let k = 0; k < dotBracket.length; k++) {
    if (dotBracket[k] === '(') stack.push(k);
    else if (dotBracket[k] === ')') {
      const a = stack.pop();
      if (a === undefined) continue;
      if (nick === undefined) out.add(`${a}-${k}`);
      else if (a < nick && k >= nick) out.add(key(a, k - nick, selfDimer));
    }
  }
  return out;
}

/** Pairs from IDT's dimer layout: column c of the bond line pairs top
 * strand base c - TopLinePadding with the bottom strand (seq2 written
 * 3' to 5') base c - BottomLinePadding. */
function dimerPairs(o: Obj, len1: number, len2: number, selfDimer: boolean): Set<string> | null {
  const bonds = field(o, ['Bonds']);
  if (!Array.isArray(bonds) || bonds.length === 0) return null;
  const pad = (k: string) => Math.max(0, Number(field(o, [k])) || 0);
  const [top, bottom, bond] = [pad('TopLinePadding'), pad('BottomLinePadding'), pad('BondLinePadding')];
  const out = new Set<string>();
  bonds.forEach((b, k) => {
    if (!(Number(b) > 0)) return;
    const c = bond + k;
    const i = c - top;
    const j = len2 - 1 - (c - bottom);
    if (i >= 0 && i < len1 && j >= 0 && j < len2) out.add(key(i, j, selfDimer));
  });
  return out.size > 0 ? out : null;
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
  const selfDimer = partner === sequence;
  return structureItems(raw)
    .map((o) => {
      const dotBracket = dimer ? null : dotBracketOf(o, sequence.length);
      return {
        dg: num(o, DG, -200, 50),
        tm: num(o, TM, -100, 200),
        dotBracket,
        duplex: dimer ? duplexOf(o, sequence, partner) : null,
        pairs: dimer ? dimerPairs(o, sequence.length, partner.length, selfDimer) : dotBracket ? pairKeys(dotBracket) : null,
      };
    })
    .filter((s) => s.dg !== null || s.tm !== null || s.duplex || s.dotBracket)
    .sort((a, b) => (a.dg ?? Infinity) - (b.dg ?? Infinity));
}

export interface IdtMatch {
  /** Index of the Strider candidate IDT's structure is shown on. */
  index: number;
  /** How it was placed: same fold (shared base pairs), a fold Strider's
   * list doesn't contain (no shared pairs, shown on #1), or IDT gave no
   * structure to compare (shown on #1). */
  basis: 'pairs' | 'no-overlap' | 'no-structure';
}

/** Which of Strider's structures IDT's one structure corresponds to:
 * the candidate sharing the most base pairs with it (Jaccard overlap). */
export function matchIdt(idt: IdtStructure, striderStructures: string[], nick?: number, selfDimer = false): IdtMatch {
  if (!idt.pairs || striderStructures.length === 0) return { index: 0, basis: 'no-structure' };
  let best = { index: 0, score: 0 };
  striderStructures.forEach((db, index) => {
    const mine = pairKeys(db, nick, selfDimer);
    let shared = 0;
    for (const k of idt.pairs!) if (mine.has(k)) shared++;
    const score = shared / (mine.size + idt.pairs!.size - shared || 1);
    if (score > best.score) best = { index, score };
  });
  return best.score > 0 ? { index: best.index, basis: 'pairs' } : { index: 0, basis: 'no-overlap' };
}
