import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { DualStructure, Engine, StructureCandidate } from '../lib/api';
import type { Conditions } from '../lib/conditions';
import { dgLevel, fmt, fmtTm, LEVEL_TEXT, parseOligo } from '../lib/format';
import { buildReport, crossOf, MAX_CROSS, reportOligos, top, type Report, type ReportEntry } from '../lib/report';
import { forwardName, reverseName, roleOf, type SavedOligo } from '../lib/savedOligos';
import DuplexSvg from './DuplexSvg';
import StriderStructure from './StriderStructure';
import { Button, Spinner } from './ui';

interface Props {
  saved: SavedOligo[];
  conditions: Conditions;
  engine: Engine;
  onClose: () => void;
}

const ENGINE_LABEL: Record<Engine, string> = { mathews: 'Mathews 2004', santalucia: 'SantaLucia 2004' };

const conditionsText = (c: Conditions) => `Oligo ${c.oligo_um} µM · Na⁺ ${c.na_mm} mM · Mg²⁺ ${c.mg_mm} mM · dNTPs ${c.dntp_mm} mM`;

/** Pick saved oligos, analyse them, then show print-ready A4 pages: one
 * per primer, one per probe, and a summary. Print saves it as a PDF. */
export default function ReportView({ saved, conditions, engine, onClose }: Props) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(saved.map((o) => o.id)));
  const [phase, setPhase] = useState<'pick' | 'loading' | 'ready'>('pick');
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ctl = useRef<AbortController | null>(null);

  useEffect(() => () => ctl.current?.abort(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const chosen = saved.filter((o) => picked.has(o.id));
  const oligoCount = chosen.reduce((n, o) => n + (o.partner ? 2 : 1), 0);

  const build = () => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setError(null);
    setPhase('loading');
    buildReport(reportOligos(chosen), conditions, engine, (d, t) => setProgress([d, t]), c.signal).then(
      (r) => {
        setReport(r);
        setPhase('ready');
      },
      (e) => {
        if (c.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
        setPhase('pick');
      },
    );
  };

  if (phase !== 'ready' || !report) {
    const toggle = (id: string) =>
      setPicked((s) => {
        const next = new Set(s);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    return (
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh] print:hidden" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div role="dialog" aria-modal="true" aria-labelledby="report-title" className="w-full max-w-lg rounded-lg border border-line bg-surface shadow-xl">
          <div className="border-b border-line px-5 py-4">
            <h2 id="report-title" className="text-[15px] font-semibold text-ink">
              Report
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
              One A4 page per primer, one per probe, then a summary. It uses the current conditions ({conditionsText(conditions)}) and the {ENGINE_LABEL[engine]} parameters.
            </p>
          </div>
          {saved.length === 0 ? (
            <p className="px-5 py-6 text-[13px] text-ink-faint">Nothing saved yet. Save primers, primer pairs and probes first, then build a report from them.</p>
          ) : (
            <>
              <div className="flex items-center justify-between px-5 pt-3 text-[12px] text-ink-muted">
                <span>
                  {oligoCount} oligo{oligoCount === 1 ? '' : 's'} selected
                </span>
                <span className="flex gap-3">
                  <button type="button" className="hover:text-ink" onClick={() => setPicked(new Set(saved.map((o) => o.id)))}>
                    All
                  </button>
                  <button type="button" className="hover:text-ink" onClick={() => setPicked(new Set())}>
                    None
                  </button>
                </span>
              </div>
              <ul className="mx-5 my-3 max-h-[50vh] divide-y divide-line overflow-y-auto rounded-md border border-line">
                {saved.map((o) => (
                  <li key={o.id}>
                    <label className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-surface-2">
                      <input type="checkbox" className="mt-1 accent-[var(--accent-solid)]" checked={picked.has(o.id)} onChange={() => toggle(o.id)} disabled={phase === 'loading'} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-[13px] font-medium text-ink">{o.name}</span>
                          <RoleChip role={o.partner ? 'pair' : roleOf(o)} />
                        </span>
                        <span className="block truncate text-[12px] text-ink-muted">{o.partner ? `${o.sequenceName ?? forwardName(o.name)} + ${o.partnerName ?? reverseName(o.name)}` : parseOligo(o.sequence).dna}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
          {oligoCount > MAX_CROSS && <p className="px-5 pb-2 text-[12px] text-ink-faint">More than {MAX_CROSS} oligos: cross-dimers are folded only within each primer pair.</p>}
          {error && (
            <p role="alert" className="mx-5 mb-3 rounded-md bg-danger-subtle px-3 py-2 text-[12px] text-danger">
              {error}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
            {phase === 'loading' && (
              <span className="mr-auto flex items-center gap-2 text-[12px] text-ink-muted" role="status">
                <Spinner /> Analysing {progress[0]} of {progress[1]}
              </span>
            )}
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="solid" onClick={build} disabled={oligoCount === 0 || phase === 'loading'}>
              Build report
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const primers = report.entries.map((e, i) => ({ e, i })).filter(({ e }) => e.role === 'primer');
  const probes = report.entries.map((e, i) => ({ e, i })).filter(({ e }) => e.role === 'probe');
  const pages = report.entries.length + 1;

  return (
    <div className="report-root fixed inset-0 z-50 overflow-y-auto bg-[#d9d9de] print:static print:overflow-visible print:bg-white">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-black/10 bg-[#ececef]/95 px-4 py-2 text-[#18181b] backdrop-blur print:hidden">
        <span className="mr-auto text-[13px] font-medium">
          Report · {pages} A4 page{pages === 1 ? '' : 's'}
        </span>
        <button type="button" className="h-7 rounded-md border border-black/15 px-2.5 text-[12px] font-medium text-[#3f3f46] hover:bg-black/5" onClick={() => setPhase('pick')}>
          Change selection
        </button>
        <button type="button" className="h-7 rounded-md bg-[#1f4fd1] px-2.5 text-[12px] font-medium text-white hover:bg-[#1a43b3]" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
        <button type="button" className="h-7 rounded-md border border-black/15 px-2.5 text-[12px] font-medium text-[#3f3f46] hover:bg-black/5" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="flex flex-col items-center gap-6 py-6 print:block print:p-0">
        {[...primers, ...probes].map(({ i }, k) => (
          <OligoPage key={i} report={report} index={i} page={k + 1} pages={pages} />
        ))}
        <SummaryPage report={report} page={pages} pages={pages} />
      </div>
    </div>
  );
}

function RoleChip({ role }: { role: 'primer' | 'probe' | 'pair' }) {
  const look = role === 'probe' ? 'bg-idt-subtle text-idt' : role === 'pair' ? 'bg-accent-subtle text-accent' : 'bg-surface-2 text-ink-muted';
  return <span className={`shrink-0 rounded-sm px-1.5 text-[10px] font-medium uppercase tracking-wide ${look}`}>{role}</span>;
}

/** A4 sheet with the report's running head and foot. `flow` lets the
 * summary grow past one page instead of being cut. */
function Sheet({ report, page, pages, flow = false, children }: { report: Report; page: number; pages: number; flow?: boolean; children: ReactNode }) {
  return (
    <article className={`report-sheet shadow-lg ${flow ? 'flow' : ''}`}>
      <header className="mb-5 flex items-baseline justify-between border-b border-line pb-2 text-[10px] uppercase tracking-[0.08em] text-ink-faint">
        <span>
          <span className="font-semibold text-ink-muted">Thermool</span> · Oligo report
        </span>
        <span>{report.createdAt.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      <footer className="mt-4 flex items-baseline justify-between gap-4 border-t border-line pt-2 text-[9.5px] text-ink-faint">
        <span>
          {conditionsText(report.conditions)} · Structures: {ENGINE_LABEL[report.engine]}, bulge-aware, most stable fold
        </span>
        <span className="shrink-0 tabular-nums">
          {page} / {pages}
        </span>
      </footer>
    </article>
  );
}

/** Bases 5' to 3', LNA in the accent colour. */
function Bases({ text, className = '' }: { text: string; className?: string }) {
  const p = parseOligo(text);
  return (
    <span className={`font-mono break-all ${className}`}>
      {[...p.dna].map((b, i) =>
        p.lna[i] ? (
          <span key={i} className="font-semibold text-accent underline decoration-1 underline-offset-2">
            {b}
          </span>
        ) : (
          <span key={i}>{b}</span>
        ),
      )}
    </span>
  );
}

function Stat({ label, value, unit, big = false, className = '' }: { label: string; value: string | null; unit?: string; big?: boolean; className?: string }) {
  return (
    <div>
      <div className="mb-0.5 text-[9.5px] font-medium uppercase tracking-[0.08em] text-ink-faint">{label}</div>
      <div className={`font-mono leading-tight tabular-nums ${big ? 'text-[26px] font-medium' : 'text-[15px]'} ${value === null ? 'text-ink-faint' : className || 'text-ink'}`}>
        {value ?? 'n/a'}
        {unit && value !== null && <span className={`ml-1 font-sans font-normal text-ink-faint ${big ? 'text-[12px]' : 'text-[10.5px]'}`}>{unit}</span>}
      </div>
    </div>
  );
}

const dgClass = (dg: number | null | undefined, kind: 'hairpin' | 'dimer') => LEVEL_TEXT[dgLevel(dg ?? null, kind)];

/** One structure block: heading, ΔG and Tm of the most stable fold, figure. */
function StructureBlock({ title, note, best, kind, children, empty }: { title: string; note?: string; best: StructureCandidate | null; kind: 'hairpin' | 'dimer'; children?: ReactNode; empty: string }) {
  return (
    <section className="report-avoid rounded-md border border-line px-4 py-3">
      <div className="mb-1 flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <h3 className="text-[12.5px] font-semibold text-ink">{title}</h3>
        {note && <span className="text-[11px] text-ink-muted">{note}</span>}
        {best && (
          <span className="ml-auto flex items-baseline gap-4 text-[12px]">
            <span>
              <span className="mr-1 text-ink-muted">ΔG{kind === 'hairpin' ? '25' : '37'}</span>
              <span className={`font-mono font-medium tabular-nums ${dgClass(best.dg, kind)}`}>{fmt(best.dg, 2)}</span>
              <span className="ml-1 text-[10.5px] text-ink-faint">kcal/mol</span>
            </span>
            <span>
              <span className="mr-1 text-ink-muted">Tm</span>
              <span className="font-mono tabular-nums">{fmtTm(best.tm)}</span>
              <span className="ml-1 text-[10.5px] text-ink-faint">°C</span>
            </span>
          </span>
        )}
      </div>
      {best ? children : <p className="py-1 text-[12px] italic text-ink-faint">{empty}</p>}
    </section>
  );
}

/** The other oligo forming the most stable heterodimer with `index`. */
function strongestCross(report: Report, index: number): { j: number; d: DualStructure; best: StructureCandidate } | null {
  let out: { j: number; d: DualStructure; best: StructureCandidate } | null = null;
  report.entries.forEach((_, j) => {
    if (j === index) return;
    const d = crossOf(report, index, j);
    const best = top(d);
    if (d && best && (!out || best.dg < out.best.dg)) out = { j, d, best };
  });
  return out;
}

function OligoPage({ report, index, page, pages }: { report: Report; index: number; page: number; pages: number }) {
  const e = report.entries[index];
  const p = e.props;
  const partner = e.partnerIndex !== undefined ? report.entries[e.partnerIndex] : undefined;
  const hairpin = top(e.structures.hairpin);
  const self = top(e.structures.homodimer);
  const partnerDimer = partner ? crossOf(report, index, e.partnerIndex!) : undefined;
  const strongest = strongestCross(report, index);
  // A pair primer shows its partner; anything else (or a pair primer whose
  // worst cross-dimer is with another oligo) also shows the strongest one.
  const showStrongest = strongest && strongest.j !== e.partnerIndex && (!partner || strongest.best.dg < (top(partnerDimer)?.dg ?? 0));

  return (
    <Sheet report={report} page={page} pages={pages}>
      <div className="mb-4">
        <div className="mb-1 flex items-center gap-2">
          <RoleChip role={e.role} />
          {e.pair && <span className="text-[11px] text-ink-muted">Primer pair {e.pair}</span>}
        </div>
        <h2 className="text-[24px] font-semibold leading-tight tracking-tight text-ink">{e.name}</h2>
        {partner && <p className="text-[12px] text-ink-muted">Partner: {partner.name}</p>}
      </div>

      <div className="mb-4 rounded-md bg-surface-2 px-4 py-3">
        <div className="flex items-baseline gap-2 text-[14px] leading-relaxed text-ink">
          <span className="text-[11px] text-ink-faint">5′</span>
          <Bases text={e.text} className="tracking-[0.06em]" />
          <span className="text-[11px] text-ink-faint">3′</span>
        </div>
        {p.lna_count > 0 && <p className="mt-1 text-[10.5px] text-ink-muted">Underlined: {p.lna_count} LNA. The Tm counts them (Owczarzy 2011); hairpins and dimers fold them as DNA.</p>}
      </div>

      <div className="mb-4 grid grid-cols-4 gap-x-4 gap-y-3 rounded-md border border-line px-4 py-3">
        <Stat label="Tm" value={fmt(p.tm, 1)} unit="°C" big className="text-accent" />
        <Stat label="Length" value={String(p.length)} unit="nt" big />
        <Stat label="GC content" value={fmt(p.gc_percent, 1)} unit="%" big />
        <Stat label="MW" value={fmt(p.mw, 1)} unit="g/mol" big />
        <Stat label="ΔH" value={fmt(p.dh, 1)} unit="kcal/mol" />
        <Stat label="ΔS" value={fmt(p.ds, 1)} unit="cal/(mol·K)" />
        <Stat label="ΔG37 duplex" value={fmt(p.dg37, 2)} unit="kcal/mol" />
        <Stat label="LNA" value={String(p.lna_count)} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <StructureBlock title="Hairpin" best={hairpin} kind="hairpin" empty="No stable hairpin.">
          {hairpin && (
            <>
              <StriderStructure sequence={p.sequence} structure={hairpin.structure} fallback={null} maxHeight={250} forceLight title={`${e.name} hairpin`} />
              <p className="mt-1 text-center font-mono text-[10px] tracking-[0.06em] text-ink-muted">{hairpin.structure}</p>
            </>
          )}
        </StructureBlock>
        <StructureBlock title="Self-dimer" best={self} kind="dimer" empty="No stable self-dimer.">
          {self && <DuplexSvg seq1={p.sequence} seq2={p.sequence} structure={self.structure} title={`${e.name} self-dimer`} />}
        </StructureBlock>
        {partner && (
          <StructureBlock title="Heterodimer" note={`with ${partner.name}`} best={top(partnerDimer)} kind="dimer" empty="No stable heterodimer with the partner.">
            {partnerDimer && top(partnerDimer) && <DuplexSvg seq1={p.sequence} seq2={partner.props.sequence} structure={top(partnerDimer)!.structure} title={`${e.name} × ${partner.name}`} />}
          </StructureBlock>
        )}
        {showStrongest && strongest && (
          <StructureBlock title="Strongest cross-dimer" note={`with ${report.entries[strongest.j].name}`} best={strongest.best} kind="dimer" empty="">
            <DuplexSvg seq1={p.sequence} seq2={report.entries[strongest.j].props.sequence} structure={strongest.best.structure} title={`${e.name} × ${report.entries[strongest.j].name}`} />
          </StructureBlock>
        )}
      </div>
    </Sheet>
  );
}

function SummaryPage({ report, page, pages }: { report: Report; page: number; pages: number }) {
  const E = report.entries;
  const primers = E.filter((e) => e.role === 'primer');
  const probes = E.filter((e) => e.role === 'probe');
  const meanPrimerTm = primers.length ? primers.reduce((s, e) => s + e.props.tm, 0) / primers.length : null;
  const pairChecks = E.flatMap((e, i) => (e.partnerIndex !== undefined && e.partnerIndex > i ? [{ pair: e.pair!, a: e, b: E[e.partnerIndex], dTm: Math.abs(e.props.tm - E[e.partnerIndex].props.tm) }] : []));
  const th = 'px-2 py-1.5 text-left text-[9.5px] font-medium uppercase tracking-[0.06em] text-ink-faint';
  const td = 'px-2 py-1.5 font-mono tabular-nums';
  const num = (v: string | null, cls = '') => <span className={v === null ? 'text-ink-faint' : cls}>{v ?? 'n/a'}</span>;

  return (
    <Sheet report={report} page={page} pages={pages} flow>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-[24px] font-semibold tracking-tight text-ink">Summary</h2>
        <span className="text-[12px] text-ink-muted">
          {primers.length} primer{primers.length === 1 ? '' : 's'}
          {probes.length > 0 && `, ${probes.length} probe${probes.length === 1 ? '' : 's'}`}
        </span>
      </div>

      <section className="report-avoid mb-5">
        <table className="w-full border-collapse text-[11.5px]">
          <thead className="border-b border-line-strong">
            <tr>
              <th className={th}>#</th>
              <th className={th}>Oligo</th>
              <th className={`${th} text-right`}>nt</th>
              <th className={`${th} text-right`}>GC %</th>
              <th className={`${th} text-right`}>Tm °C</th>
              <th className={`${th} text-right`}>Hairpin ΔG25</th>
              <th className={`${th} text-right`}>Hairpin Tm</th>
              <th className={`${th} text-right`}>Self-dimer ΔG37</th>
              <th className={`${th} text-right`}>Partner ΔG37</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {E.map((e, i) => {
              const hp = top(e.structures.hairpin);
              const sd = top(e.structures.homodimer);
              const het = e.partnerIndex !== undefined ? top(crossOf(report, i, e.partnerIndex)) : null;
              return (
                <tr key={i}>
                  <td className="px-2 py-1.5 text-ink-faint tabular-nums">{i + 1}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-medium text-ink">{e.name}</span>
                      <RoleChip role={e.role} />
                    </div>
                    <Bases text={e.text} className="text-[9.5px] text-ink-muted" />
                  </td>
                  <td className={`${td} text-right`}>{e.props.length}</td>
                  <td className={`${td} text-right`}>{fmt(e.props.gc_percent, 1)}</td>
                  <td className={`${td} text-right font-semibold text-ink`}>{fmt(e.props.tm, 1)}</td>
                  <td className={`${td} text-right`}>{hp ? num(fmt(hp.dg, 2), dgClass(hp.dg, 'hairpin')) : <span className="text-ink-faint">none</span>}</td>
                  <td className={`${td} text-right`}>{hp ? fmtTm(hp.tm) : <span className="text-ink-faint">-</span>}</td>
                  <td className={`${td} text-right`}>{sd ? num(fmt(sd.dg, 2), dgClass(sd.dg, 'dimer')) : <span className="text-ink-faint">none</span>}</td>
                  <td className={`${td} text-right`}>{e.partnerIndex === undefined ? <span className="text-ink-faint">-</span> : het ? num(fmt(het.dg, 2), dgClass(het.dg, 'dimer')) : <span className="text-ink-faint">none</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-1.5 text-[9.5px] text-ink-faint">
          ΔG in kcal/mol. Amber and red mark structures likely to interfere (hairpin ΔG25 at or below -2 / -3, dimers ΔG37 at or below -6 / -9, IDT's rules of thumb).
        </p>
      </section>

      {(pairChecks.length > 0 || (probes.length > 0 && meanPrimerTm !== null)) && (
        <section className="report-avoid mb-5">
          <h3 className="mb-2 text-[12.5px] font-semibold text-ink">Tm matching</h3>
          <ul className="space-y-1 text-[12px] text-ink">
            {pairChecks.map((c) => (
              <li key={c.pair} className="flex items-baseline gap-2">
                <span className="w-40 shrink-0 truncate text-ink-muted">{c.pair}</span>
                <span>
                  {c.a.name} {fmt(c.a.props.tm, 1)} °C, {c.b.name} {fmt(c.b.props.tm, 1)} °C:{' '}
                  <span className={`font-mono font-medium tabular-nums ${c.dTm > 2 ? 'text-warning' : 'text-success'}`}>ΔTm {fmt(c.dTm, 1)} °C</span>
                </span>
              </li>
            ))}
            {meanPrimerTm !== null &&
              probes.map((e, k) => {
                const d = e.props.tm - meanPrimerTm;
                return (
                  <li key={`p${k}`} className="flex items-baseline gap-2">
                    <span className="w-40 shrink-0 truncate text-ink-muted">{e.name}</span>
                    <span>
                      Probe {fmt(e.props.tm, 1)} °C vs mean primer {fmt(meanPrimerTm, 1)} °C:{' '}
                      <span className={`font-mono font-medium tabular-nums ${d >= 5 && d <= 10 ? 'text-success' : 'text-warning'}`}>
                        {d >= 0 ? '+' : ''}
                        {fmt(d, 1)} °C
                      </span>
                    </span>
                  </li>
                );
              })}
          </ul>
          <p className="mt-1.5 text-[9.5px] text-ink-faint">Rules of thumb: primers in a pair within 2 °C of each other; a hydrolysis probe 5 to 10 °C above its primers.</p>
        </section>
      )}

      {E.length > 1 && (
        <section className="report-avoid mb-5">
          <h3 className="mb-2 text-[12.5px] font-semibold text-ink">Dimer matrix</h3>
          <table className="border-collapse text-[11px]">
            <thead>
              <tr>
                <th className={th} />
                {E.map((_, j) => (
                  <th key={j} className={`${th} text-right`}>
                    #{j + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {E.map((e, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="max-w-40 truncate px-2 py-1 text-ink-muted">
                    <span className="mr-1.5 tabular-nums text-ink-faint">#{i + 1}</span>
                    {e.name}
                  </td>
                  {E.map((_, j) => {
                    const best = i === j ? top(e.structures.homodimer) : top(crossOf(report, i, j));
                    const folded = i === j || !!crossOf(report, i, j);
                    return (
                      <td key={j} className={`px-2 py-1 text-right font-mono tabular-nums ${i === j ? 'bg-surface-2' : ''}`}>
                        {!folded ? <span className="text-ink-faint">·</span> : best ? <span className={dgClass(best.dg, 'dimer')}>{fmt(best.dg, 1)}</span> : <span className="text-ink-faint">none</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1.5 text-[9.5px] text-ink-faint">
            Most stable dimer ΔG37 (kcal/mol) for each combination; the shaded diagonal is each oligo's self-dimer.
            {!report.allCrossed && ' With this many oligos only each pair was crossed (dots: not folded).'}
          </p>
        </section>
      )}

      <section className="mb-2">
        <h3 className="mb-2 text-[12.5px] font-semibold text-ink">Hairpin structures</h3>
        <div className="grid grid-cols-3 gap-3">
          {E.map((e, i) => (
            <HairpinThumb key={i} e={e} n={i + 1} />
          ))}
        </div>
      </section>
    </Sheet>
  );
}

function HairpinThumb({ e, n }: { e: ReportEntry; n: number }) {
  const hp = top(e.structures.hairpin);
  return (
    <div className="report-avoid rounded-md border border-line px-2.5 py-2">
      <div className="mb-1 flex items-baseline justify-between gap-2 text-[11px]">
        <span className="truncate font-medium text-ink">
          <span className="mr-1 text-ink-faint">#{n}</span>
          {e.name}
        </span>
        {hp && <span className={`shrink-0 font-mono tabular-nums ${dgClass(hp.dg, 'hairpin')}`}>{fmt(hp.dg, 2)}</span>}
      </div>
      {hp ? (
        <StriderStructure sequence={e.props.sequence} structure={hp.structure} fallback={<p className="text-[11px] text-ink-faint">{hp.structure}</p>} maxHeight={120} forceLight title={`${e.name} hairpin`} />
      ) : (
        <p className="py-6 text-center text-[11px] italic text-ink-faint">No stable hairpin</p>
      )}
    </div>
  );
}
