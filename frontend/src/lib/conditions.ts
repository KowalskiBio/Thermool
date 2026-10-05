/** Reaction conditions in IDT OligoAnalyzer's units, sent unchanged to
 * both Strider (our server) and IDT. */
export interface Conditions {
  /** Na+, mM */
  na_mm: number;
  /** Mg2+, mM */
  mg_mm: number;
  /** dNTPs, mM */
  dntp_mm: number;
  /** Oligo, µM */
  oligo_um: number;
}

export const PRESETS: { id: string; label: string; conditions: Conditions }[] = [
  { id: 'qpcr', label: 'qPCR', conditions: { na_mm: 50, mg_mm: 3, dntp_mm: 0.8, oligo_um: 0.2 } },
];

export const DEFAULT_CONDITIONS = PRESETS[0].conditions;

export function presetOf(c: Conditions): string | null {
  return PRESETS.find((p) => (Object.keys(c) as (keyof Conditions)[]).every((k) => p.conditions[k] === c[k]))?.id ?? null;
}

export function conditionsKey(c: Conditions): string {
  return `${c.na_mm}/${c.mg_mm}/${c.dntp_mm}/${c.oligo_um}`;
}

const STORAGE_KEY = 'thermool-conditions';

export function loadConditions(): Conditions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const c = { ...DEFAULT_CONDITIONS, ...(JSON.parse(raw) as Partial<Conditions>) };
      if (Object.values(c).every((v) => typeof v === 'number' && Number.isFinite(v))) return c;
    }
  } catch {
    /* storage unavailable: use defaults */
  }
  return DEFAULT_CONDITIONS;
}

export function saveConditions(c: Conditions) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch {
    /* storage unavailable: not remembered */
  }
}

// Label, then up to ~40 non-digit characters (": ", " Concentration ", "="),
// then the number and an optional unit.
const NUM = String.raw`[^\d\n]{0,40}?(\d*[.,]?\d+)\s*(µM|μM|uM|nM|mM|M)?`;
// Labels must start a word, so "na" inside "Analysis" never counts.
const WORD = String.raw`(?<![A-Za-z])`;
const FIELDS: { key: keyof Conditions; re: RegExp; baseUnit: 'mM' | 'µM' }[] = [
  { key: 'dntp_mm', re: new RegExp(WORD + String.raw`dNTPs?` + NUM, 'i'), baseUnit: 'mM' },
  { key: 'mg_mm', re: new RegExp(WORD + String.raw`(?:Mg2?\s*\+*|magnesium|divalent)` + NUM, 'i'), baseUnit: 'mM' },
  { key: 'na_mm', re: new RegExp(WORD + String.raw`(?:Na\s*\+*|K\s*\+|sodium|monovalent)` + NUM, 'i'), baseUnit: 'mM' },
  { key: 'oligo_um', re: new RegExp(WORD + String.raw`(?:oligo|primer|strand)` + NUM, 'i'), baseUnit: 'µM' },
];

const TO_MOLAR: Record<string, number> = { M: 1, mM: 1e-3, uM: 1e-6, µM: 1e-6, μM: 1e-6, nM: 1e-9 };

/** Reads conditions out of free text such as IDT OligoAnalyzer's parameter
 * summary ("Oligo Conc 0.25 µM, Na+ Conc 50 mM, Mg++ Conc 0 mM, dNTPs Conc
 * 0 mM") or one value per line. Returns only the fields it found. */
export function parseConditions(text: string): Partial<Conditions> {
  const out: Partial<Conditions> = {};
  let rest = text;
  for (const { key, re, baseUnit } of FIELDS) {
    const m = rest.match(re);
    if (!m) continue;
    let value = parseFloat(m[1].replace(',', '.'));
    const unit = m[2];
    if (unit && unit !== baseUnit && !(baseUnit === 'µM' && (unit === 'uM' || unit === 'μM'))) {
      value = (value * TO_MOLAR[unit]) / TO_MOLAR[baseUnit];
    }
    if (Number.isFinite(value)) out[key] = +value.toPrecision(6);
    // Blank the match so "Mg++" text can't be re-read as another field.
    rest = rest.replace(m[0], ' ');
  }
  return out;
}
