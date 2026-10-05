import { useEffect, useState, type ClipboardEvent } from 'react';
import type { Engine } from '../lib/api';
import { PRESETS, parseConditions, presetOf, type Conditions } from '../lib/conditions';
import { Segmented } from './ui';

interface Props {
  value: Conditions;
  onChange: (c: Conditions) => void;
  engine: Engine;
  onEngineChange: (e: Engine) => void;
}

const FIELDS: { key: keyof Conditions; label: string; unit: string; title: string }[] = [
  { key: 'oligo_um', label: 'Oligo', unit: 'µM', title: 'Oligo (strand) concentration' },
  { key: 'na_mm', label: 'Na⁺', unit: 'mM', title: 'Monovalent cation (Na⁺/K⁺) concentration' },
  { key: 'mg_mm', label: 'Mg²⁺', unit: 'mM', title: 'Mg²⁺ concentration' },
  { key: 'dntp_mm', label: 'dNTPs', unit: 'mM', title: 'Total dNTP concentration (chelates Mg²⁺)' },
];

/** One number field that keeps the typed text (so "0." or "" survive
 * while typing) and commits only valid, non-negative numbers. */
function NumField({ label, unit, title, value, onCommit, onPaste }: { label: string; unit: string; title: string; value: number; onCommit: (v: number) => void; onPaste: (e: ClipboardEvent<HTMLInputElement>) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft((d) => (Number(d) === value ? d : String(value)));
  }, [value]);
  const n = Number(draft.replace(',', '.'));
  const invalid = draft.trim() === '' || !Number.isFinite(n) || n < 0;
  return (
    <label className="flex flex-col gap-1" title={title}>
      <span className="text-[12px] text-ink-muted">{label}</span>
      <span className={`flex h-7 items-center rounded-md border bg-surface pr-2 focus-within:border-accent ${invalid ? 'border-danger' : 'border-line-strong'}`}>
        <input
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            const v = Number(e.target.value.replace(',', '.'));
            if (e.target.value.trim() !== '' && Number.isFinite(v) && v >= 0) onCommit(v);
          }}
          onPaste={onPaste}
          className="w-[3.75rem] bg-transparent px-2 font-mono text-[13px] tabular-nums text-ink focus:outline-none"
        />
        <span className="font-mono text-[12px] text-ink-faint">{unit}</span>
      </span>
    </label>
  );
}

export default function ConditionsBar({ value, onChange, engine, onEngineChange }: Props) {
  const [note, setNote] = useState<string | null>(null);
  const preset = presetOf(value);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 3500);
    return () => clearTimeout(t);
  }, [note]);

  const applyText = (text: string): boolean => {
    const found = parseConditions(text);
    const n = Object.keys(found).length;
    if (n === 0) return false;
    onChange({ ...value, ...found });
    setNote(`Read ${n} value${n > 1 ? 's' : ''} from pasted text`);
    return true;
  };

  // Pasting labelled text (e.g. IDT's parameter summary) into any field
  // fills every condition it names; a bare number pastes normally.
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (/[a-z]/i.test(text) && applyText(text)) e.preventDefault();
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!applyText(text)) setNote('No conditions found in the clipboard');
    } catch {
      setNote('Clipboard not readable here; paste into any field instead');
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
      {FIELDS.map((f) => (
        <NumField key={f.key} label={f.label} unit={f.unit} title={f.title} value={value[f.key]} onCommit={(v) => onChange({ ...value, [f.key]: v })} onPaste={onPaste} />
      ))}
      <div className="flex flex-col gap-1">
        <span className="text-[12px] text-ink-muted">Preset</span>
        <Segmented
          label="Preset"
          value={preset ?? 'custom'}
          onChange={(id) => {
            const p = PRESETS.find((x) => x.id === id);
            if (p) onChange(p.conditions);
          }}
          options={[...PRESETS.map((p) => ({ value: p.id, label: p.label })), { value: 'custom', label: 'Custom', disabled: preset !== null }]}
        />
      </div>
      <div className="flex flex-col gap-1" title="Nearest-neighbour parameters for hairpins and dimers. Duplex Tm always uses SantaLucia & Hicks 2004.">
        <span className="text-[12px] text-ink-muted">Structure engine</span>
        <Segmented
          label="Structure engine"
          value={engine}
          onChange={onEngineChange}
          options={[
            { value: 'mathews', label: 'Mathews', title: 'Mathews 2004 (closest to IDT)' },
            { value: 'santalucia', label: 'SantaLucia', title: 'SantaLucia 2004 (Strider native)' },
          ]}
        />
      </div>
      <div className="flex h-8 items-center gap-2 pb-0.5">
        <button type="button" onClick={pasteFromClipboard} className="text-[12px] text-ink-muted underline decoration-line-strong underline-offset-2 hover:text-ink" title="Reads labelled values, e.g. IDT's 'Oligo Conc 0.25 µM, Na+ Conc 50 mM, Mg++ Conc 0 mM, dNTPs Conc 0 mM'">
          Paste IDT parameters
        </button>
        {note && <span className="text-[12px] text-accent">{note}</span>}
      </div>
    </div>
  );
}
