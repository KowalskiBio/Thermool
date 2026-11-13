import { analyze, type DualStructure, type Engine, type FullStructureAnalysis, type Properties, type StructureCandidate } from './api';
import type { Conditions } from './conditions';
import { parseOligo } from './format';
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
}

export interface ReportEntry extends ReportOligo {
  props: Properties;
  structures: FullStructureAnalysis;
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
}

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
      primers.push(make(o.sequenceName ?? forwardName(o.name), o.sequence, 'primer', { pair: o.name, partnerIndex: i + 1 }));
      primers.push(make(o.partnerName ?? reverseName(o.name), o.partner, 'primer', { pair: o.name, partnerIndex: i }));
    } else {
      const role = roleOf(o);
      (role === 'probe' ? probes : primers).push(make(o.name, o.sequence, role));
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

/** Analyses every oligo alone, then every pair of oligos for heterodimers. */
export async function buildReport(oligos: ReportOligo[], conditions: Conditions, engine: Engine, onProgress: (done: number, total: number) => void, signal?: AbortSignal): Promise<Report> {
  const n = oligos.length;
  const allCrossed = n <= MAX_CROSS;
  const pairs: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (allCrossed || oligos[i].partnerIndex === j) pairs.push([i, j]);

  const total = n + pairs.length;
  let done = 0;
  const tick = () => onProgress(++done, total);
  const single: { props: Properties; structures: FullStructureAnalysis }[] = new Array(n);
  const cross: Record<string, DualStructure> = {};
  onProgress(0, total);
  await pool(
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
  return { entries: oligos.map((o, i) => ({ ...o, ...single[i] })), cross, allCrossed, conditions, engine, createdAt: new Date() };
}

/** The most stable structure of the bulge-aware model (the app's default view). */
export const top = (d: DualStructure | null | undefined): StructureCandidate | null => d?.with_bulge.candidates[0] ?? null;

export const crossOf = (r: Report, i: number, j: number): DualStructure | undefined => r.cross[i < j ? `${i}-${j}` : `${j}-${i}`];
