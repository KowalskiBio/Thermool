import type { Conditions } from './conditions';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, 'Cannot reach the Thermool server.');
  }
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body, handled below */
  }
  if (!response.ok) {
    const msg = data && typeof data === 'object' && 'error' in data ? String((data as { error: unknown }).error) : text.slice(0, 200) || `HTTP ${response.status}`;
    throw new ApiError(response.status, msg);
  }
  return data as T;
}

// Shapes from `src/analyze.rs` (and Primerool's `engine::structure_variant`).

export interface Properties {
  sequence: string;
  length: number;
  gc_percent: number;
  tm: number;
  mw: number;
  dh: number;
  ds: number;
  dg37: number;
}

export interface StructureCandidate {
  /** kcal/mol: at 25 °C for hairpins, 37 °C for dimers. */
  dg: number;
  tm: number;
  /** Dot-bracket; for a dimer it spans seq1 + seq2 (no separator). */
  structure: string;
  /** Boltzmann share within this model's top-5 ensemble. */
  population_fraction: number;
}

export interface StructureVariant {
  structure_found: boolean;
  candidates: StructureCandidate[];
}

export interface DualStructure {
  with_bulge: StructureVariant;
  no_bulge: StructureVariant;
}

export interface FullStructureAnalysis {
  hairpin: DualStructure;
  homodimer: DualStructure;
  heterodimer: DualStructure | null;
}

export interface AnalyzeResponse {
  oligo: Properties;
  partner: Properties | null;
  structures: FullStructureAnalysis;
  partner_structures: FullStructureAnalysis | null;
}

/** Nearest-neighbour parameters for hairpin/dimer folding and scoring. */
export type Engine = 'mathews' | 'santalucia';

export function analyze(sequence: string, partner: string | null, conditions: Conditions, engine: Engine, signal?: AbortSignal) {
  return postJson<AnalyzeResponse>('/api/analyze', { sequence, partner, conditions, engine }, signal);
}

// IDT (`src/idt.rs`).

export type IdtKind = 'analyze' | 'hairpin' | 'self_dimer' | 'hetero_dimer';
export type IdtRegion = 'eu' | 'us';

export interface IdtTokenRequest {
  client_id: string;
  client_secret: string;
  username: string;
  password: string;
  region: IdtRegion;
}

export function idtToken(req: IdtTokenRequest) {
  return postJson<{ access_token: string; expires_in?: number }>('/api/idt/token', req);
}

export interface IdtRunRequest {
  kind: IdtKind;
  sequence: string;
  partner?: string;
  conditions: Conditions;
  token: string;
  region: IdtRegion;
}

/** IDT's raw JSON for one OligoAnalyzer endpoint. */
export function idtRun(req: IdtRunRequest) {
  return postJson<unknown>('/api/idt/run', req);
}
