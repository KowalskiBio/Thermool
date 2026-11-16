// Reads a Primerool session file (`*.primerool.json`, written by Primerool's
// "Save session") and turns its designs into Thermool saved oligos.
//
// The file is `{ app: 'primerool', version, savedAt, name, state }`, where
// `state` is a flat map of Primerool panel values. Two parts hold primers:
//  - `snpBatch.blocks` + `snpBatch.results`: the SNP batch designer. Each
//    rsID maps to one result with `fwd`/`rev` primers; SNPs merged into one
//    amplicon share the same result (`mergedWith` lists them all).
//  - `app.selections`: the single-gene designer's picked primers and probes.

import { newId, type SavedOligo } from './savedOligos';

/** One design read from the session, before it becomes a saved entry. */
export interface ImportedOligo {
  name: string;
  sequence: string;
  /** Present for a primer pair (the reverse / right / common primer). */
  partner?: string;
  sequenceName?: string;
  partnerName?: string;
  role?: 'primer' | 'probe';
  note?: string;
}

export interface PrimeroolImport {
  /** The session's own name ("SNP batch (26 SNPs)"); becomes the saved group. */
  name: string;
  oligos: ImportedOligo[];
  /** Designs that had no usable primers, with the reason. */
  skipped: string[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const DNA = /^[ACGTRYSWKMBDHVN]+$/i;
const primer = (v: unknown) => {
  const s = isObj(v) ? str(v.sequence) : '';
  return DNA.test(s) ? s : '';
};
const bp = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('en-US') : '');

/** SNP batch designs, one per amplicon, in the batch's own order. */
function fromSnpBatch(state: Obj, skipped: string[]): ImportedOligo[] {
  const blocks = Array.isArray(state['snpBatch.blocks']) ? (state['snpBatch.blocks'] as unknown[]).filter(isObj) : [];
  const results = isObj(state['snpBatch.results']) ? state['snpBatch.results'] : {};
  const userNotes = isObj(state['snpBatch.userNotes']) ? state['snpBatch.userNotes'] : {};
  const byRsid = new Map(blocks.map((b) => [str(b.rsid), b]));
  const seen = new Set<string>();
  const out: ImportedOligo[] = [];
  for (const b of blocks) {
    const rsid = str(b.rsid);
    if (!rsid) continue;
    const r = results[rsid];
    const fwd = isObj(r) ? primer(r.fwd) : '';
    const rev = isObj(r) ? primer(r.rev) : '';
    if (!isObj(r) || !fwd || !rev) {
      const why = isObj(r) ? str(r.error) || (r.status === 'done' ? 'no primer pair found' : `status ${str(r.status) || 'unknown'}`) : 'not designed';
      skipped.push(`${rsid}: ${why}`);
      continue;
    }
    // A merged amplicon is stored under each member rsID: keep it once.
    const key = `${fwd}|${rev}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const group = Array.isArray(r.mergedWith) && r.mergedWith.length > 1 ? (r.mergedWith as unknown[]).map(str).filter(Boolean) : [rsid];
    const members = group.map((id) => byRsid.get(id)).filter(isObj);
    const genes = [...new Set(members.map((m) => str(m.gene)).filter(Boolean))];
    const where = members
      .map((m) => (str(m.chrom) && bp(m.position) ? `${str(m.chrom)}:${bp(m.position)}` : ''))
      .filter(Boolean)
      .join(', ');
    const notes = [
      ...group.map((id) => str(userNotes[id])).filter(Boolean),
      ...(Array.isArray(r.notes) ? (r.notes as unknown[]).map((n) => (isObj(n) ? str(n.text) : str(n))).filter(Boolean) : []),
    ];
    out.push({
      name: [genes.join('/'), group.join('+')].filter(Boolean).join(' '),
      sequence: fwd,
      partner: rev,
      note: [where, bp(r.productSize) && `${bp(r.productSize)} bp amplicon`, ...new Set(notes)].filter(Boolean).join(' · ') || undefined,
    });
  }
  return out;
}

/** The single-gene designer's picks: pairs where both primers are picked,
 * probes on their own. */
function fromSelections(state: Obj): ImportedOligo[] {
  const sel = isObj(state['app.selections']) ? state['app.selections'] : {};
  const seqOf = (k: string) => {
    const s = sel[k];
    const p = isObj(s) ? str(s.primerSeq) : '';
    return DNA.test(p) ? p : '';
  };
  const labelOf = (k: string) => (isObj(sel[k]) ? str((sel[k] as Obj).name) : '') || undefined;
  const gene = str(state['app.geneName']);
  const named = (what: string) => [gene, what].filter(Boolean).join(' ');
  const out: ImportedOligo[] = [];
  const pair = (what: string, f: string, r: string) => {
    if (seqOf(f) && seqOf(r)) out.push({ name: named(what), sequence: seqOf(f), partner: seqOf(r), sequenceName: labelOf(f), partnerName: labelOf(r) });
  };
  pair('PCR', 'geneForward', 'geneReverse');
  pair('WGA', 'wgaForward', 'wgaReverse');
  pair('junction', 'juncLeft', 'juncRight');
  pair('ARMS ref', 'armsRefPrimer', 'armsCommon');
  pair('ARMS alt', 'armsAltPrimer', 'armsCommon');
  for (const [k, what] of [
    ['geneProbe', 'probe'],
    ['geneProbeAlt', 'probe (alt)'],
  ] as const) {
    if (seqOf(k)) out.push({ name: labelOf(k) ?? named(what), sequence: seqOf(k), role: 'probe' });
  }
  return out;
}

/** Parses a Primerool session file. Throws with a readable message when the
 * text is not one, or holds no primers. */
export function parsePrimeroolSession(text: string): PrimeroolImport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not JSON. Choose a session saved by Primerool (*.primerool.json).');
  }
  if (!isObj(data) || data.app !== 'primerool' || !isObj(data.state)) throw new Error('This is not a Primerool session file (*.primerool.json).');
  const skipped: string[] = [];
  const oligos = [...fromSnpBatch(data.state, skipped), ...fromSelections(data.state)];
  if (oligos.length === 0) throw new Error(skipped.length ? `No primers to import: ${skipped.join('; ')}.` : 'This Primerool session holds no designed primers.');
  return { name: str(data.name) || 'Primerool session', oligos, skipped };
}

/** Saved entries for an import, all in one group, in the session's order. */
export function toSavedOligos(imp: PrimeroolImport, group: string): SavedOligo[] {
  const now = Date.now();
  return imp.oligos.map((o) => ({ id: newId(), savedAt: now, group, ...o }));
}
