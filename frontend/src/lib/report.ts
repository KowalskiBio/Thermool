import { analyze, type DualStructure, type Engine, type FullStructureAnalysis, type Properties, type StructureCandidate } from './api';
import type { Conditions } from './conditions';
import { parseOligo } from './format';
import type { IdtCredentials } from './idt';
import { cachedIdt, runIdtCached } from './idtCache';
import { readAnalyze, readStructures } from './idtResult';
import { forwardName, reverseName, roleOf, type OligoRole, type SavedOligo } from './savedOligos';

/** One oligo on its own report page. */
export interface ReportOligo {
  name: string;
  role: OligoRole;
  /** As saved (case carries LNA). */
  text: string;
  /** IDT notation, what the server gets. */
  notation: string;
  /** The pair it belongs to, and the other primer's index in the list. */
  pair?: string;
  partnerIndex?: number;
  /** The saved entry's note (e.g. SNP position and amplicon size). */
  note?: string;
}

/** IDT's most stable structure; `null` when IDT found none. */
export interface IdtFold {
  dg: number | null;
  tm: number | null;
}

/** IDT OligoAnalyzer values for one oligo. A field left `undefined` means
 * that call failed (the report shows n/a and lists the error). */
export interface IdtValues {
  tm?: number | null;
  hairpin?: IdtFold | null;
  selfDimer?: IdtFold | null;
  /** Heterodimer with its pair partner (pair primers only). */
  partner?: IdtFold | null;
}

export interface ReportEntry extends ReportOligo {
  props: Properties;
  structures: FullStructureAnalysis;
  /** Present when the report was built with IDT. */
  idt?: IdtValues;
}

export interface Report {
  entries: ReportEntry[];
  /** Heterodimer of oligos `i < j`, keyed `i-j`. */
  cross: Record<string, DualStructure>;
  /** False when there were too many oligos to fold every combination
   * (then only each pair's two primers are crossed). */
  allCrossed: boolean;
  conditions: Conditions;
  engine: Engine;
  createdAt: Date;
  /** True when IDT values were requested. */
  withIdt: boolean;
  /** Messages from IDT calls that failed. */
  idtErrors: string[];
}

/** IDT questions a report asks: Tm, hairpin and self-dimer per oligo, plus
 * one heterodimer per primer pair (not the full cross matrix). `cached`
 * of them are already answered in this browser and cost no IDT call. */
export function idtCalls(oligos: ReportOligo[], c: Conditions): { total: number; cached: number } {
  const dna = oligos.map((o) => parseOligo(o.text).dna);
  const asks: boolean[] = [];
  oligos.forEach((o, i) => {
    asks.push(cachedIdt('analyze', c, o.notation) !== undefined, cachedIdt('hairpin', c, dna[i]) !== undefined, cachedIdt('self_dimer', c, dna[i]) !== undefined);
    const j = o.partnerIndex;
    if (j !== undefined && j > i) asks.push(cachedIdt('hetero_dimer', c, dna[i], dna[j]) !== undefined || cachedIdt('hetero_dimer', c, dna[j], dna[i]) !== undefined);
  });
  return { total: asks.length, cached: asks.filter(Boolean).length };
}

const bestFold = (raw: unknown, seq: string, partner?: string): IdtFold | null => {
  const b = readStructures(raw, seq, partner)[0];
  return b ? { dg: b.dg, tm: b.tm } : null;
};

/** Above this many oligos, only partner primers get a heterodimer fold
 * (n oligos need n(n-1)/2 folds for the full matrix). */
export const MAX_CROSS = 12;

/** Report order: primers first (each pair's two together), then probes. */
export function reportOligos(selected: SavedOligo[]): ReportOligo[] {
  const primers: ReportOligo[] = [];
  const probes: ReportOligo[] = [];
  const make = (name: string, text: string, role: OligoRole, extra: Partial<ReportOligo> = {}): ReportOligo => ({ name, role, text, notation: parseOligo(text).notation, ...extra });
  for (const o of selected) {
    if (o.partner) {
      const i = primers.length;
      primers.push(make(o.sequenceName ?? forwardName(o.name), o.sequence, 'primer', { pair: o.name, partnerIndex: i + 1, note: o.note }));
      primers.push(make(o.partnerName ?? reverseName(o.name), o.partner, 'primer', { pair: o.name, partnerIndex: i, note: o.note }));
    } else {
      const role = roleOf(o);
      (role === 'probe' ? probes : primers).push(make(o.name, o.sequence, role, { note: o.note }));
    }
  }
  return [...primers, ...probes];
}

/** Runs `jobs` with at most `limit` in flight. */
async function pool(jobs: (() => Promise<void>)[], limit: number) {
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) await jobs[next++]();
  };
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
}

/** Analyses every oligo alone, then every pair of oligos for heterodimers;
 * with `idt` credentials, also asks IDT OligoAnalyzer under the same
 * conditions (Tm keeps LNA as "+N"; structures use the DNA bases, like
 * the app's IDT buttons). */
export async function buildReport(oligos: ReportOligo[], conditions: Conditions, engine: Engine, onProgress: (done: number, total: number) => void, signal?: AbortSignal, idt?: IdtCredentials | null): Promise<Report> {
  const n = oligos.length;
  const allCrossed = n <= MAX_CROSS;
  const pairs: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (allCrossed || oligos[i].partnerIndex === j) pairs.push([i, j]);

  const idtValues: IdtValues[] = oligos.map(() => ({}));
  const idtErrors: string[] = [];
  const dna = oligos.map((o) => parseOligo(o.text).dna);
  const idtJob = (run: () => Promise<void>) => async () => {
    if (signal?.aborted) return;
    try {
      await run();
    } catch (e) {
      idtErrors.push(e instanceof Error ? e.message : String(e));
    }
    tick();
  };
  const idtJobs = !idt
    ? []
    : [
        ...oligos.flatMap((o, i) => [
          idtJob(async () => {
            idtValues[i].tm = readAnalyze(await runIdtCached(idt, 'analyze', o.notation, conditions)).tm;
          }),
          idtJob(async () => {
            idtValues[i].hairpin = bestFold(await runIdtCached(idt, 'hairpin', dna[i], conditions), dna[i]);
          }),
          idtJob(async () => {
            idtValues[i].selfDimer = bestFold(await runIdtCached(idt, 'self_dimer', dna[i], conditions), dna[i], dna[i]);
          }),
        ]),
        ...oligos.flatMap((o, i) =>
          o.partnerIndex !== undefined && o.partnerIndex > i
            ? [
                idtJob(async () => {
                  const j = o.partnerIndex!;
                  // The same duplex asked the other way round (from the app) has the same dG.
                  const swapped = cachedIdt('hetero_dimer', conditions, dna[j], dna[i]);
                  const fold = swapped !== undefined ? bestFold(swapped, dna[j], dna[i]) : bestFold(await runIdtCached(idt, 'hetero_dimer', dna[i], conditions, dna[j]), dna[i], dna[j]);
                  idtValues[i].partner = fold;
                  idtValues[j].partner = fold;
                }),
              ]
            : [],
        ),
      ];

  const total = n + pairs.length + idtJobs.length;
  let done = 0;
  const tick = () => onProgress(++done, total);
  const single: { props: Properties; structures: FullStructureAnalysis }[] = new Array(n);
  const cross: Record<string, DualStructure> = {};
  onProgress(0, total);
  const local = pool(
    [
      ...oligos.map((o, i) => async () => {
        const r = await analyze(o.notation, null, conditions, engine, signal);
        single[i] = { props: r.oligo, structures: r.structures };
        tick();
      }),
      ...pairs.map(([i, j]) => async () => {
        const r = await analyze(oligos[i].notation, oligos[j].notation, conditions, engine, signal);
        if (r.structures.heterodimer) cross[`${i}-${j}`] = r.structures.heterodimer;
        tick();
      }),
    ],
    4,
  );
  // IDT runs alongside, a few calls at a time to stay polite to its API.
  await Promise.all([local, pool(idtJobs, 3)]);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  return {
    entries: oligos.map((o, i) => ({ ...o, ...single[i], ...(idt ? { idt: idtValues[i] } : {}) })),
    cross,
    allCrossed,
    conditions,
    engine,
    createdAt: new Date(),
    withIdt: !!idt,
    idtErrors,
  };
}

/** The most stable structure of the bulge-aware model (the app's default view). */
export const top = (d: DualStructure | null | undefined): StructureCandidate | null => d?.with_bulge.candidates[0] ?? null;

export const crossOf = (r: Report, i: number, j: number): DualStructure | undefined => r.cross[i < j ? `${i}-${j}` : `${j}-${i}`];
