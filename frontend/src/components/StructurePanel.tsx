import { useState } from 'react';
import type { AnalyzeResponse, DualStructure, IdtKind, StructureCandidate } from '../lib/api';
import { dgLevel, fmt, fmtTm, LEVEL_TEXT } from '../lib/format';
import { readStructures, type IdtStructure } from '../lib/idtResult';
import DimerSvg from './DimerSvg';
import IdtButton, { IdtErrors, combine, type IdtEntry } from './IdtButton';
import StriderStructure from './StriderStructure';
import { Button, Segmented, Val } from './ui';

type Tab = 'hairpin' | 'self_dimer' | 'hetero_dimer';
type Model = 'with_bulge' | 'no_bulge';
type DimerView = 'fold' | 'duplex';

interface Props {
  result: AnalyzeResponse;
  getIdt: (kind: IdtKind, seq: string, partner?: string) => IdtEntry | undefined;
  onIdt: (kind: IdtKind) => void;
  idtConnected: boolean;
  onAddPartner: () => void;
}

interface Section {
  title: string;
  seq1: string;
  /** Second strand, for a dimer. */
  seq2?: string;
  names?: string[];
  structure: DualStructure;
  idt: IdtEntry | undefined;
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'hairpin', label: 'Hairpins' },
  { id: 'self_dimer', label: 'Self-dimers' },
  { id: 'hetero_dimer', label: 'Heterodimer' },
];

export default function StructurePanel({ result, getIdt, onIdt, idtConnected, onAddPartner }: Props) {
  const [tab, setTab] = useState<Tab>('hairpin');
  const [model, setModel] = useState<Model>('with_bulge');
  const [view, setView] = useState<DimerView>('duplex');

  const oligo = result.oligo.sequence;
  const partner = result.partner?.sequence;
  const pairNames = ['O', 'P'];

  let sections: Section[] = [];
  if (tab === 'hairpin' || tab === 'self_dimer') {
    const pick = (s: AnalyzeResponse['structures']) => (tab === 'hairpin' ? s.hairpin : s.homodimer);
    sections.push({ title: 'Oligo', seq1: oligo, seq2: tab === 'self_dimer' ? oligo : undefined, structure: pick(result.structures), idt: getIdt(tab, oligo) });
    if (partner && result.partner_structures) {
      sections.push({ title: 'Partner', seq1: partner, seq2: tab === 'self_dimer' ? partner : undefined, structure: pick(result.partner_structures), idt: getIdt(tab, partner) });
    }
  } else if (partner && result.structures.heterodimer) {
    sections = [{ title: 'Oligo (O) × Partner (P)', seq1: oligo, seq2: partner, names: pairNames, structure: result.structures.heterodimer, idt: getIdt('hetero_dimer', oligo, partner) }];
  }

  const dimer = tab !== 'hairpin';
  const idtEntries = sections.map((s) => s.idt);

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-line">
        <div role="tablist" className="flex gap-5">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 pb-2 text-[13px] font-medium transition-colors ${tab === t.id ? 'border-accent text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
            >
              {t.label}
              {t.id === 'hetero_dimer' && !partner && <span className="ml-1.5 text-[11px] font-normal text-ink-faint">needs partner</span>}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 pb-2">
          {dimer && <Segmented label="Dimer drawing" value={view} onChange={setView} options={[{ value: 'duplex', label: 'Duplex' }, { value: 'fold', label: 'Fold' }]} />}
          <Segmented
            label="Strider model"
            value={model}
            onChange={setModel}
            options={[
              { value: 'with_bulge', label: 'Bulge-aware', title: 'Global minimum free energy, bulges and internal loops allowed' },
              { value: 'no_bulge', label: 'No bulge', title: 'Contiguous stems only, the sliding-window model simpler checkers such as IDT use' },
            ]}
          />
          {sections.length > 0 && <IdtButton state={combine(idtEntries)} onClick={() => onIdt(tab)} connected={idtConnected} />}
        </div>
      </div>

      {tab === 'hetero_dimer' && !partner ? (
        <div className="py-10 text-center text-[13px] text-ink-muted">
          <p className="mb-3">A heterodimer needs a second sequence.</p>
          <Button onClick={onAddPartner}>Add partner sequence</Button>
        </div>
      ) : (
        <>
          <IdtErrors entries={idtEntries} />
          {sections.map((s) => (
            <StrandSection key={s.title} section={s} model={model} dimer={dimer} view={view} />
          ))}
          <p className="mt-4 text-[12px] leading-relaxed text-ink-faint">
            {dimer
              ? 'ΔG at 37 °C. Strider’s dimer ΔG includes the +1.96 kcal/mol bimolecular initiation term (SantaLucia & Hicks 2004); IDT leaves it out, so Strider reads about 2 kcal/mol less negative for the same duplex. Flagged below -6 (amber) and -9 kcal/mol (red).'
              : 'ΔG at 25 °C, as in IDT OligoAnalyzer. Tm is the unimolecular melting point of that hairpin. Flagged below -2 (amber) and -3 kcal/mol (red).'}{' '}
            Share is the Boltzmann weight within the five structures shown. Click a figure to open it full size.
          </p>
        </>
      )}
    </section>
  );
}

function StrandSection({ section: s, model, dimer, view }: { section: Section; model: Model; dimer: boolean; view: DimerView }) {
  const [rawOpen, setRawOpen] = useState(false);
  const candidates = s.structure[model].candidates;
  const idt = s.idt?.status === 'done' ? readStructures(s.idt.raw, s.seq1, s.seq2) : null;
  const showIdt = s.idt !== undefined;
  const level = (dg: number | null) => LEVEL_TEXT[dgLevel(dg, dimer ? 'dimer' : 'hairpin')];
  const best = candidates[0];
  const idtBest = idt?.[0];

  return (
    <div className="border-b border-line py-5 last:border-0">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-[13px] font-medium text-ink">{s.title}</h3>
          <p className="truncate font-mono text-[12px] text-ink-faint" title={s.seq2 && s.seq2 !== s.seq1 ? `${s.seq1} × ${s.seq2}` : s.seq1}>
            {s.seq1}
            {s.seq2 && s.seq2 !== s.seq1 && <> × {s.seq2}</>}
          </p>
        </div>
        {/* Strider's most stable structure next to IDT's. */}
        <dl className="grid grid-cols-[auto_auto_auto] gap-x-4 gap-y-0.5 text-[12px]">
          <dt />
          <dd className="text-right text-[11px] uppercase tracking-wider text-ink-faint">Strider</dd>
          <dd className={`text-right text-[11px] uppercase tracking-wider text-idt ${showIdt ? '' : 'invisible'}`}>IDT</dd>
          <dt className="text-ink-muted">Most stable ΔG</dt>
          <dd className="text-right">
            <Val v={fmt(best?.dg, 2)} unit="kcal/mol" className={level(best?.dg ?? null)} />
          </dd>
          <dd className={`text-right ${showIdt ? '' : 'invisible'}`}>{s.idt?.status === 'loading' ? <span className="text-ink-faint">…</span> : <Val v={fmt(idtBest?.dg, 2)} unit="kcal/mol" className={level(idtBest?.dg ?? null)} />}</dd>
          <dt className="text-ink-muted">Tm</dt>
          <dd className="text-right">
            <Val v={fmtTm(best?.tm)} unit="°C" />
          </dd>
          <dd className={`text-right ${showIdt ? '' : 'invisible'}`}>{s.idt?.status === 'loading' ? <span className="text-ink-faint">…</span> : <Val v={fmtTm(idtBest?.tm)} unit="°C" />}</dd>
        </dl>
      </div>

      {candidates.length === 0 ? (
        <p className="text-[13px] italic text-ink-faint">Strider finds no stable structure.</p>
      ) : (
        <div className={`grid gap-3 ${dimer ? 'grid-cols-[repeat(auto-fill,minmax(min(26rem,100%),1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(min(15rem,100%),1fr))]'}`}>
          {candidates.map((c, i) => (
            <Card key={`${model}-${i}`} rank={i + 1} dg={c.dg} tm={c.tm} share={c.population_fraction} levelClass={level(c.dg)}>
              <Figure s={s} c={c} dimer={dimer} view={view} />
            </Card>
          ))}
        </div>
      )}

      {idt && (
        <div className="mt-4">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-idt">IDT OligoAnalyzer</span>
            <button type="button" onClick={() => setRawOpen((o) => !o)} className="text-[12px] text-ink-faint underline decoration-line-strong underline-offset-2 hover:text-ink">
              {rawOpen ? 'Hide raw response' : 'Raw response'}
            </button>
          </div>
          {rawOpen && <pre className="mb-3 max-h-72 overflow-auto rounded-md border border-line bg-surface-2 p-3 font-mono text-[11px] text-ink-muted">{JSON.stringify((s.idt as { raw: unknown }).raw, null, 2)}</pre>}
          {idt.length === 0 ? (
            <p className="text-[13px] italic text-ink-faint">IDT reports no structure.</p>
          ) : (
            <div className={`grid gap-3 ${dimer ? 'grid-cols-[repeat(auto-fill,minmax(min(26rem,100%),1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(min(15rem,100%),1fr))]'}`}>
              {idt.slice(0, 5).map((d, i) => (
                <Card key={i} rank={i + 1} dg={d.dg} tm={d.tm} levelClass={level(d.dg)} idt>
                  <IdtFigure s={s} d={d} />
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Card({ rank, dg, tm, share, levelClass, idt = false, children }: { rank: number; dg: number | null; tm: number | null; share?: number; levelClass: string; idt?: boolean; children: React.ReactNode }) {
  return (
    <div className={`min-w-0 rounded-md border bg-surface p-3 ${idt ? 'border-idt/30' : 'border-line'}`}>
      <div className="mb-2 flex items-baseline gap-3 text-[12px]">
        <span className={`font-mono ${idt ? 'text-idt' : 'text-ink-faint'}`}>#{rank}</span>
        <Val v={fmt(dg, 2)} unit="kcal/mol" className={`font-medium ${levelClass}`} />
        <Val v={fmtTm(tm)} unit="°C" />
        {share !== undefined && (
          <span className="ml-auto font-mono tabular-nums text-ink-faint" title="Boltzmann share within the structures shown">
            {(share * 100).toFixed(0)}%
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function DotBracket({ text }: { text: string }) {
  return <p className="mt-2 break-all font-mono text-[11px] leading-4 tracking-[0.04em] text-ink-faint">{text}</p>;
}

function Figure({ s, c, dimer, view }: { s: Section; c: StructureCandidate; dimer: boolean; view: DimerView }) {
  if (!dimer) {
    return (
      <>
        <StriderStructure sequence={s.seq1} structure={c.structure} title="Hairpin" fallback={null} />
        <DotBracket text={c.structure} />
      </>
    );
  }
  const seq2 = s.seq2!;
  const db = `${c.structure.slice(0, s.seq1.length)}&${c.structure.slice(s.seq1.length)}`;
  const duplex = <DimerSvg seq1={s.seq1} seq2={seq2} structure={c.structure} />;
  return (
    <>
      {view === 'duplex' ? duplex : <StriderStructure sequence={s.seq1 + seq2} nick={s.seq1.length} strandNames={s.names} structure={c.structure} title={s.names ? 'Heterodimer' : 'Self-dimer'} fallback={duplex} />}
      <DotBracket text={db} />
    </>
  );
}

function IdtFigure({ s, d }: { s: Section; d: IdtStructure }) {
  if (d.dotBracket) {
    return (
      <>
        <StriderStructure sequence={s.seq1} structure={d.dotBracket} title="IDT hairpin" fallback={null} />
        <DotBracket text={d.dotBracket} />
      </>
    );
  }
  if (d.duplex) {
    return <pre className="overflow-x-auto font-mono text-[12px] leading-[1.35] text-ink">{d.duplex.join('\n')}</pre>;
  }
  return <p className="text-[12px] italic text-ink-faint">No structure drawing in IDT’s response.</p>;
}
