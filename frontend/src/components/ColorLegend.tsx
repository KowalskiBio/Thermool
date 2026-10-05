import { useState } from 'react';
import { DEFAULT_PALETTE, ELEMENT_LABELS, type Base, type Element, type Palette } from '../lib/elements';
import type { ColorBy } from './StriderStructure';

const STORAGE_KEY = 'thermool-palette';

function loadPalette(): Palette {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Palette> | null;
    if (saved) return { elements: { ...DEFAULT_PALETTE.elements, ...saved.elements }, bases: { ...DEFAULT_PALETTE.bases, ...saved.bases } };
  } catch {
    /* fall back to defaults */
  }
  return DEFAULT_PALETTE;
}

function savePalette(p: Palette | null) {
  try {
    if (p) localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* not remembered */
  }
}

/** The structure palette, remembered per browser: `[palette, set, reset, customised]`. */
export function usePalette(): [Palette, (p: Palette) => void, () => void, boolean] {
  const [palette, setState] = useState<Palette>(loadPalette);
  const set = (p: Palette) => {
    setState(p);
    savePalette(p);
  };
  const reset = () => {
    setState(DEFAULT_PALETTE);
    savePalette(null);
  };
  const customised = JSON.stringify(palette) !== JSON.stringify(DEFAULT_PALETTE);
  return [palette, set, reset, customised];
}

const BASE_LABELS: [Base, string][] = [
  ['A', 'A'],
  ['C', 'C'],
  ['G', 'G'],
  ['T', 'T'],
];

/** One legend dot; clicking it opens the system colour picker. */
function Swatch({ color, label, onPick }: { color: string; label: string; onPick: (c: string) => void }) {
  return (
    <label className="group inline-flex cursor-pointer items-center gap-1.5" title={`${label}: click to change the colour`}>
      <span className="relative size-3 rounded-full ring-1 ring-black/10 transition-transform group-hover:scale-125 dark:ring-white/15" style={{ background: color }}>
        <input type="color" value={color} onChange={(e) => onPick(e.target.value)} aria-label={`Colour for ${label}`} className="absolute inset-0 size-full cursor-pointer opacity-0" />
      </span>
      <span className="group-hover:text-ink">{label}</span>
    </label>
  );
}

interface Props {
  colorBy: ColorBy;
  /** Dimer tabs have no hairpin loops or multiloops. */
  dimer: boolean;
  palette: Palette;
  onChange: (p: Palette) => void;
  /** Present when the palette differs from the defaults. */
  onReset?: () => void;
}

/** What each colour means, with every colour editable in place. */
export default function ColorLegend({ colorBy, dimer, palette, onChange, onReset }: Props) {
  const setElement = (el: Element, c: string) => onChange({ ...palette, elements: { ...palette.elements, [el]: c } });
  const setBase = (b: Base, c: string) => onChange({ ...palette, bases: { ...palette.bases, [b]: c } });

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-3 text-[12px] text-ink-muted">
      {colorBy === 'structure'
        ? ELEMENT_LABELS.filter(([el]) => !dimer || (el !== 'hairpin' && el !== 'multiloop')).map(([el, label]) => (
            <Swatch key={el} color={palette.elements[el]} label={label} onPick={(c) => setElement(el, c)} />
          ))
        : BASE_LABELS.map(([b, label]) => <Swatch key={b} color={palette.bases[b]} label={label} onPick={(c) => setBase(b, c)} />)}
      <span className="text-ink-faint">Click a dot to change its colour.</span>
      {onReset && (
        <button type="button" onClick={onReset} className="text-ink-faint underline decoration-line-strong underline-offset-2 hover:text-ink">
          Reset colours
        </button>
      )}
    </div>
  );
}
