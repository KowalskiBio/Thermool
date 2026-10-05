import { useEffect, useRef, useState } from 'react';
import { competition, type Competition, type Engine, type EquilibriumSplit } from '../lib/api';
import type { Conditions } from '../lib/conditions';
import { Spinner } from './ui';

interface Props {
  sequence: string;
  partner: string | null;
  conditions: Conditions;
  engine: Engine;
  split: EquilibriumSplit;
  onAddPartner: () => void;
}

const DEBOUNCE_MS = 500;

/** One segment of the stacked bar. */
interface Segment {
  label: string;
  value: number;
  className: string;
}

/** Oligool's equilibrium strip: a stacked bar of mutually exclusive
 * population segments (they are carved out of the free pool here, since
 * the backend's hairpin shares are subsets of it), with computed-but-
 * negligible segments shown dimmed as <0.1%. */
function CompetitionStrip({ c, split }: { c: Competition; split: EquilibriumSplit }) {
  const pHairpinTwoState = c.p_hairpin_two_state;
  const useTwoState = split === 'two-way';
  const pHairpin = useTwoState ? pHairpinTwoState : c.p_hairpin;
  const pUnfolded = c.p_unfolded;
  const pFreeTotal = c.p_free;
  const useSplit = !useTwoState;
  const pOtherFolds = useSplit ? Math.max(0, pFreeTotal - pHairpin - pUnfolded) : null;
  const segments: Segment[] = [
    { label: useSplit ? 'Unfolded' : 'Free', value: useSplit ? pUnfolded : Math.max(0, pFreeTotal - pHairpin), className: 'bg-zinc-300 dark:bg-zinc-600' },
    { label: 'Hairpin', value: pHairpin, className: 'bg-amber-500' },
    ...(pOtherFolds != null ? [{ label: 'Other folds', value: pOtherFolds, className: 'bg-amber-200 dark:bg-amber-800' }] : []),
    { label: 'Self-Dimer', value: c.p_self_dimer, className: 'bg-red-500' },
    ...(c.p_hetero_dimer != null ? [{ label: 'Cross-Dimer', value: c.p_hetero_dimer, className: 'bg-purple-500' }] : []),
  ];
  const shown = segments.filter((s) => s.value > 0.001);
  const negligible = segments.filter((s) => s.value <= 0.001 && s.value > 0);
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full border border-line-strong">
        {shown.map((s) => (
          <div key={s.label} className={s.className} style={{ width: `${s.value * 100}%` }} title={`${s.label}: ${pct(s.value)}`} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-0.5 text-[12px] text-ink-muted">
        {shown.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className={`inline-block size-1.5 rounded-full ${s.className}`} />
            {s.label} <span className="font-mono tabular-nums">{pct(s.value)}</span>
          </span>
        ))}
        {negligible.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 opacity-60">
            <span className={`inline-block size-1.5 rounded-full ${s.className}`} />
            {s.label} <span className="font-mono tabular-nums">&lt;0.1%</span>
          </span>
        ))}
      </div>
      {useTwoState && Math.abs(pHairpinTwoState - c.p_hairpin) >= 0.1 && (
        <p className="mt-1 text-[11px] text-ink-faint">Two-state model; the ensemble view puts the best fold at {pct(c.p_hairpin)}.</p>
      )}
      {!c.converged && <p className="mt-1 text-[12px] italic text-warning">Equilibrium solve did not fully converge, treat as approximate.</p>}
    </div>
  );
}

/** Equilibrium stability at a chosen temperature: what fraction of each
 * strand sits free, folded, self-dimerized or cross-dimerized. Fetched
 * separately from the main analysis (it is the expensive part) with a
 * debounce and a stale-response guard; the structure cards stay anchored
 * at their reference temperatures, like Oligool. */
export default function StabilityPanel({ sequence, partner, conditions, engine, split, onAddPartner }: Props) {
  const [tempText, setTempText] = useState('25');
  const [data, setData] = useState<{ oligo: Competition; partner: Competition | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runRef = useRef(0);

  const temp = Number(tempText.replace(',', '.'));
  const tempValid = tempText.trim() !== '' && Number.isFinite(temp) && temp >= 0 && temp <= 99;

  useEffect(() => {
    if (!tempValid) return;
    const run = ++runRef.current;
    const ctl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      competition(sequence, partner, conditions, engine, temp, ctl.signal).then(
        (d) => {
          if (run !== runRef.current) return;
          setData(d);
          setError(null);
          setLoading(false);
        },
        (e) => {
          if (run !== runRef.current) return;
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequence, partner, conditions, engine, tempValid, tempText]);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold tracking-tight text-ink">Stability</h2>
        <div className="flex items-center gap-2" title="Temperature for the equilibrium split (free / hairpin / dimer). Structure cards and ΔG values stay at their reference temperatures.">
          <span className="text-[12px] text-ink-muted">Equilibrium at</span>
          <input
            type="text"
            inputMode="decimal"
            aria-label="Equilibrium temperature"
            value={tempText}
            onChange={(e) => setTempText(e.target.value)}
            className={`h-6 w-12 rounded-md border bg-surface px-1.5 text-right font-mono text-[13px] tabular-nums focus:border-accent focus:outline-none ${tempValid ? 'border-line-strong' : 'border-danger'}`}
          />
          <span className="text-[12px] text-ink-muted">°C</span>
          {loading && <Spinner className="text-ink-faint" />}
        </div>
      </div>

      {error && <p className="mb-3 rounded-md bg-danger-subtle px-3 py-2 text-[13px] text-danger">{error}</p>}

      {data ? (
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-ink-muted">Oligo Stability</p>
            <CompetitionStrip c={data.oligo} split={split} />
          </div>
          {data.partner && (
            <div>
              <p className="mb-1.5 text-[12px] font-medium text-ink-muted">Partner Stability</p>
              <CompetitionStrip c={data.partner} split={split} />
            </div>
          )}
          {!partner && (
            <p className="text-[12px] text-ink-faint">
              <button type="button" onClick={onAddPartner} className="underline decoration-line-strong underline-offset-2 hover:text-ink">
                Add a partner
              </button>{' '}
              to see the cross-dimer competition.
            </p>
          )}
        </div>
      ) : (
        !error && (
          <div className="flex h-14 items-center justify-center text-ink-faint">{loading ? <Spinner /> : null}</div>
        )
      )}
    </section>
  );
}
