import type { Properties } from '../lib/api';
import { fmt } from '../lib/format';
import { readAnalyze, type IdtProps } from '../lib/idtResult';
import IdtButton, { IdtErrors, Unreadable, combine, type IdtEntry } from './IdtButton';

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

// Length and GC are pure sequence facts, identical in both tools, so only
// Tm gets an IDT value beside it.
const STATS: { label: string; unit: string; strider: (p: Properties) => string | null; idt?: (i: IdtProps) => string | null; hint?: string }[] = [
  { label: 'Length', unit: 'nt', strider: (p) => String(p.length) },
  { label: 'GC content', unit: '%', strider: (p) => fmt(p.gc_percent, 1) },
  { label: 'Tm', unit: '°C', strider: (p) => fmt(p.tm, 1), idt: (i) => fmt(i.tm, 1), hint: 'Duplex with the perfect complement at the set conditions' },
];

/** The headline numbers: length, GC and Tm, large, with IDT's Tm beside Strider's. */
export default function PropertiesTable({ strands, onIdt, idtConnected }: Props) {
  const entries = strands.map((s) => s.idt);
  const state = combine(entries);

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="label">Properties</h2>
        <IdtButton state={state} onClick={onIdt} connected={idtConnected} />
      </div>
      <div className="divide-y divide-line rounded-md border border-line bg-surface">
        {strands.map((s) => {
          const idt = s.idt?.status === 'done' ? readAnalyze(s.idt.raw) : null;
          return (
            <div key={s.label} className="px-5 py-4">
              {strands.length > 1 && <div className="mb-2 text-[12px] font-medium text-ink-muted">{s.label}</div>}
              <div className="grid grid-cols-3 gap-4">
                {STATS.map((st) => {
                  const idtValue = idt && st.idt ? st.idt(idt) : null;
                  return (
                    <div key={st.label} title={st.hint}>
                      <div className="label mb-1">{st.label}</div>
                      <div className="flex flex-wrap items-baseline gap-x-3 font-mono leading-tight tabular-nums">
                        <span className="text-[28px] font-medium text-ink sm:text-[34px]">
                          {st.strider(s.props) ?? <span className="text-ink-faint">n/a</span>}
                          <span className="ml-1.5 text-[14px] font-normal text-ink-faint">{st.unit}</span>
                        </span>
                        {s.idt && st.idt && (
                          <span className="whitespace-nowrap text-[20px] font-medium text-idt sm:text-[24px]">
                            <span className="mr-3 hidden font-normal text-line-strong sm:inline">|</span>
                            <span className="mr-1.5 text-[11px] font-normal uppercase tracking-wider">IDT</span>
                            {s.idt.status === 'loading' ? '…' : idtValue !== null ? idtValue : <span className="text-ink-faint">n/a</span>}
                            {idtValue !== null && <span className="ml-1.5 text-[13px] font-normal">{st.unit}</span>}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <IdtErrors entries={entries} />
      {strands.map((s) =>
        s.idt?.status === 'done' && Object.values(readAnalyze(s.idt.raw)).every((v) => v === null) ? <Unreadable key={s.label} raw={s.idt.raw} /> : null,
      )}
    </section>
  );
}

