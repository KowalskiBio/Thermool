import { parseOligo } from '../lib/format';

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  actions?: React.ReactNode;
}

/** A 5'-to-3' oligo box with live length, GC and LNA count. Case is shown
 * as typed, since lowercase in a mixed-case sequence means LNA. */
export default function SequenceField({ id, label, value, onChange, placeholder, autoFocus, actions }: Props) {
  const parsed = parseOligo(value);
  const seq = parsed.dna;
  const gc = seq.length ? (100 * [...seq].filter((b) => b === 'G' || b === 'C').length) / seq.length : null;
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <label htmlFor={id} className="label">
          {label}
        </label>
        <div className="flex flex-wrap items-baseline justify-end gap-x-3 gap-y-1 whitespace-nowrap text-[12px] text-ink-faint">
          {seq.length > 0 && (
            <span className="font-mono tabular-nums">
              {seq.length} nt · GC {gc!.toFixed(1)}%{parsed.lnaCount > 0 && <span className="text-accent"> · {parsed.lnaCount} LNA</span>}
            </span>
          )}
          {actions}
        </div>
      </div>
      <div className="flex items-stretch rounded-md border border-line-strong bg-surface focus-within:border-accent">
        <span className="select-none py-2.5 pl-3 pr-1 font-mono text-[13px] text-ink-faint">5′</span>
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          spellCheck={false}
          autoComplete="off"
          rows={2}
          className="min-h-[3.25rem] w-full resize-y bg-transparent px-2 py-2.5 font-mono text-[15px] leading-6 tracking-[0.06em] text-ink placeholder:normal-case placeholder:tracking-normal placeholder:text-ink-faint focus:outline-none"
        />
        <span className="select-none self-end py-2.5 pl-1 pr-3 font-mono text-[13px] text-ink-faint">3′</span>
      </div>
      {parsed.lnaCount > 0 && (
        <div className="mt-1.5 break-all font-mono text-[12px] leading-5 tracking-[0.06em] text-ink-faint" aria-label={`Read as ${parsed.notation}`} title="How Thermool reads this oligo: LNA bases highlighted">
          <span className="mr-2 tracking-normal">Read as</span>
          {[...parsed.dna].map((b, i) =>
            parsed.lna[i] ? (
              <span key={i} className="rounded-[2px] bg-accent-subtle font-medium text-accent">
                {b}
              </span>
            ) : (
              <span key={i}>{b}</span>
            ),
          )}
        </div>
      )}
    </div>
  );
}
