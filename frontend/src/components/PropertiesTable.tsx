import type { Properties } from '../lib/api';
import { fmt } from '../lib/format';
import { readAnalyze, type IdtProps } from '../lib/idtResult';
import IdtButton, { IdtErrors, combine, type IdtEntry } from './IdtButton';
import { Val } from './ui';

interface Strand {
  label: string;
  props: Properties;
  idt: IdtEntry | undefined;
}

interface Props {
  strands: Strand[];
  onIdt: () => void;
  idtConnected: boolean;
}

type Row = { label: string; unit: string; strider: (p: Properties) => string | null; idt: ((i: IdtProps) => string | null) | null; hint?: string };

const ROWS: Row[] = [
  { label: 'Length', unit: 'nt', strider: (p) => String(p.length), idt: (i) => fmt(i.length, 0) },
  { label: 'GC content', unit: '%', strider: (p) => fmt(p.gc_percent, 1), idt: (i) => fmt(i.gc, 1) },
  { label: 'Melting temperature', unit: '°C', strider: (p) => fmt(p.tm, 1), idt: (i) => fmt(i.tm, 1), hint: 'Duplex with the perfect complement at the set conditions' },
  { label: 'Molecular weight', unit: 'g/mol', strider: (p) => fmt(p.mw, 1), idt: (i) => fmt(i.mw, 1), hint: 'Anhydrous, unmodified, 5′-OH' },
  { label: 'Extinction coefficient', unit: 'L/(mol·cm)', strider: () => null, idt: (i) => fmt(i.ext, 0), hint: 'At 260 nm; IDT only' },
  { label: 'Duplex ΔG (37 °C)', unit: 'kcal/mol', strider: (p) => fmt(p.dg37, 2), idt: null, hint: 'Salt-corrected, with free Mg²⁺' },
  { label: 'Duplex ΔH', unit: 'kcal/mol', strider: (p) => fmt(p.dh, 1), idt: null, hint: 'Nearest-neighbour, 1 M Na⁺' },
  { label: 'Duplex ΔS', unit: 'cal/(mol·K)', strider: (p) => fmt(p.ds, 1), idt: null, hint: 'Nearest-neighbour, 1 M Na⁺' },
];

export default function PropertiesTable({ strands, onIdt, idtConnected }: Props) {
  const entries = strands.map((s) => s.idt);
  const state = combine(entries);
  const showIdt = state !== 'idle';
  const idtProps = strands.map((s) => (s.idt?.status === 'done' ? readAnalyze(s.idt.raw) : null));

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="label">Properties</h2>
        <IdtButton state={state} onClick={onIdt} connected={idtConnected} />
      </div>
      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            {strands.length > 1 && (
              <tr className="border-b border-line">
                <th />
                {strands.map((s) => (
                  <th key={s.label} colSpan={showIdt ? 2 : 1} className="px-3 pt-2 pb-1 text-left text-[12px] font-medium text-ink">
                    {s.label}
                  </th>
                ))}
              </tr>
            )}
            <tr className="border-b border-line text-[11px] uppercase tracking-wider text-ink-faint">
              <th className="px-3 py-1.5 text-left font-medium">Parameter</th>
              {strands.map((s) => (
                <Cols key={s.label} showIdt={showIdt} />
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.label} className="border-b border-line last:border-0">
                <td className="px-3 py-1.5 text-ink-muted" title={r.hint}>
                  {r.label} <span className="text-ink-faint">({r.unit})</span>
                </td>
                {strands.map((s, k) => (
                  <Cells key={s.label} strider={r.strider(s.props)} idt={!showIdt ? undefined : s.idt?.status === 'loading' ? 'loading' : r.idt && idtProps[k] ? r.idt(idtProps[k]!) : null} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <IdtErrors entries={entries} />
    </section>
  );
}

function Cols({ showIdt }: { showIdt: boolean }) {
  return (
    <>
      <th className="px-3 py-1.5 text-right font-medium">Strider</th>
      {showIdt && <th className="px-3 py-1.5 text-right font-medium text-idt">IDT</th>}
    </>
  );
}

function Cells({ strider, idt }: { strider: string | null; idt: string | null | 'loading' | undefined }) {
  return (
    <>
      <td className="px-3 py-1.5 text-right">
        <Val v={strider} />
      </td>
      {idt !== undefined && <td className="px-3 py-1.5 text-right text-idt">{idt === 'loading' ? <span className="text-ink-faint">…</span> : <Val v={idt} />}</td>}
    </>
  );
}
