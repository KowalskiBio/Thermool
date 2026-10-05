import { useState } from 'react';
import type { AnalyzeResponse, DualStructure, IdtKind, StructureCandidate } from '../lib/api';
import { dgLevel, fmt, fmtTm, LEVEL_TEXT } from '../lib/format';
import { matchIdt, readStructures, type IdtStructure } from '../lib/idtResult';
import DuplexSvg from './DuplexSvg';
import IdtButton, { IdtErrors, Unreadable, combine, type IdtEntry } from './IdtButton';
import StriderStructure, { type ColorBy } from './StriderStructure';
import { ELEMENT_COLORS, ELEMENT_LABELS } from '../lib/elements';
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
  const [colorBy, setColorByState] = useState<ColorBy>(() => {
    try {
      return localStorage.getItem('thermool-structure-color') === 'structure' ? 'structure' : 'base';
    } catch {
      return 'base';
    }
  });
  const setColorBy = (c: ColorBy) => {
    setColorByState(c);
    try {
      localStorage.setItem('thermool-structure-color', c);
    } catch {
      /* not remembered */
    }
  };

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
            label="Base colour"
            value={colorBy}
            onChange={setColorBy}
            options={[
              { value: 'base', label: 'Bases', title: 'Colour each base by nucleotide (A, C, G, T)' },
              { value: 'structure', label: 'Structure', title: 'Colour each base by its structural element: stem, hairpin loop, interior loop or bulge, multiloop, exterior' },
            ]}
          />
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
          {colorBy === 'structure' && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-3 text-[12px] text-ink-muted">
              {ELEMENT_LABELS.filter(([el]) => (dimer ? el !== 'hairpin' && el !== 'multiloop' : true)).map(([el, label]) => (
                <span key={el} className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full" style={{ background: ELEMENT_COLORS[el] }} />
                  {label}
                </span>
              ))}
            </div>
          )}
          {sections.map((s) => (
            <StrandSection key={s.title} section={s} model={model} dimer={dimer} view={view} colorBy={colorBy} />
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

function StrandSection({ section: s, model, dimer, view, colorBy }: { section: Section; model: Model; dimer: boolean; view: DimerView; colorBy: ColorBy }) {
  const [rawOpen, setRawOpen] = useState(false);
  const candidates = s.structure[model].candidates;
  const idt = s.idt?.status === 'done' ? readStructures(s.idt.raw, s.seq1, s.seq2) : null;
  const level = (dg: number | null) => LEVEL_TEXT[dgLevel(dg, dimer ? 'dimer' : 'hairpin')];
  const best = candidates[0];
  const idtBest = idt?.[0];

  const idtState = s.idt?.status;
  // IDT reports one structure; place it on the Strider structure it matches.
  const match = idtBest ? matchIdt(idtBest, candidates.map((c) => c.structure), s.seq2 !== undefined ? s.seq1.length : undefined, s.seq2 === s.seq1) : null;
  const idtAt = (i: number): IdtCell => {
    if (idtState === 'loading') return i === 0 ? 'loading' : undefined;
    if (!idt) return undefined;
    if (!idtBest) return i === 0 ? null : undefined;
    return match?.index === i ? idtBest : undefined;
  };
  const idtNote = (i: number) =>
    match?.index !== i ? undefined : match.basis === 'no-overlap' ? 'IDT’s fold is not among these five' : match.basis === 'no-structure' ? 'IDT sent no structure to match; shown on #1' : undefined;
  const raw = s.idt?.status === 'done' ? s.idt.raw : undefined;

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
        {/* Strider's most stable structure next to IDT's, on one line. */}
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[14px]">
          <SummaryPair label="Most stable ΔG" unit="kcal/mol" strider={fmt(best?.dg, 2)} striderClass={level(best?.dg ?? null)} idt={idtState === 'loading' ? 'loading' : idt ? fmt(idtBest?.dg, 2) : undefined} idtClass={level(idtBest?.dg ?? null)} />
          <SummaryPair label="Tm" unit="°C" strider={fmtTm(best?.tm)} idt={idtState === 'loading' ? 'loading' : idt ? fmtTm(idtBest?.tm) : undefined} />
        </div>
      </div>

      {candidates.length === 0 ? (
        <p className="text-[13px] italic text-ink-faint">Strider finds no stable structure.</p>
      ) : (
        <div className={`grid gap-3 ${dimer ? 'grid-cols-[repeat(auto-fill,minmax(min(26rem,100%),1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(min(17rem,100%),1fr))]'}`}>
          {candidates.map((c, i) => (
            <Card key={`${model}-${i}`} rank={i + 1} c={c} idt={idtAt(i)} idtNote={idtNote(i)} level={level}>
              <Figure s={s} c={c} dimer={dimer} view={view} colorBy={colorBy} />
            </Card>
          ))}
        </div>
      )}

      {raw !== undefined && (
        <div className="mt-3">
          {idt && idt.length === 0 ? (
            <Unreadable raw={raw} />
          ) : (
            <div className="flex justify-end">
              <button type="button" onClick={() => setRawOpen((o) => !o)} className="text-[12px] text-ink-faint underline decoration-line-strong underline-offset-2 hover:text-ink">
                {rawOpen ? 'Hide IDT raw response' : 'IDT raw response'}
              </button>
            </div>
          )}
          {rawOpen && <pre className="mt-2 max-h-72 overflow-auto rounded-md border border-line bg-surface-2 p-3 font-mono text-[11px] text-ink-muted">{JSON.stringify(raw, null, 2)}</pre>}
        </div>
      )}
    </div>
  );
}

/** IDT's value for a card: absent (not asked), loading, or its structure of the same rank (null if IDT found fewer). */
type IdtCell = IdtStructure | null | 'loading' | undefined;

function SummaryPair({ label, unit, strider, striderClass = '', idt, idtClass = '' }: { label: string; unit: string; strider: string | null; striderClass?: string; idt: string | null | 'loading' | undefined; idtClass?: string }) {
  return (
    <span className="whitespace-nowrap">
      <span className="mr-2 text-[12px] text-ink-muted">{label}</span>
      <span className={`font-mono font-medium tabular-nums ${strider === null ? 'text-ink-faint' : striderClass}`}>{strider ?? 'n/a'}</span>
      {idt !== undefined && (
        <>
          <span className="mx-2 text-line-strong">|</span>
          <span className="mr-1 text-[11px] uppercase tracking-wider text-idt">IDT</span>
          <span className={`font-mono font-medium tabular-nums ${idt === null || idt === 'loading' ? 'text-ink-faint' : idtClass}`}>{idt === 'loading' ? '…' : (idt ?? 'n/a')}</span>
        </>
      )}
      <span className="ml-1 text-[12px] text-ink-faint">{unit}</span>
    </span>
  );
}

function Card({ rank, c, idt, idtNote, level, children }: { rank: number; c: StructureCandidate; idt: IdtCell; idtNote?: string; level: (dg: number | null) => string; children: React.ReactNode }) {
  const row = (who: 'Strider' | 'IDT', dg: string | null, dgClass: string, tm: string | null) => (
    <>
      <span className={`text-[11px] font-medium uppercase tracking-wider ${who === 'IDT' ? 'text-idt' : 'text-ink-faint'}`}>{who}</span>
      <Val v={dg} unit="kcal/mol" className={`text-[16px] font-medium ${dgClass}`} />
      <Val v={tm} unit="°C" className="text-[16px]" />
    </>
  );
  return (
    <div className="min-w-0 rounded-md border border-line bg-surface p-3">
      <div className="mb-1 flex items-baseline justify-between text-[12px]">
        <span className="font-mono text-ink-faint">#{rank}</span>
        <span className="font-mono tabular-nums text-ink-faint" title="Boltzmann share within the structures shown">
          {(c.population_fraction * 100).toFixed(0)}%
        </span>
      </div>
      <div className="mb-2 grid grid-cols-[auto_auto_1fr] items-baseline gap-x-4 gap-y-0.5">
        {row('Strider', fmt(c.dg, 2), level(c.dg), fmtTm(c.tm))}
        {idt !== undefined &&
          (idt === 'loading' ? (
            <>
              <span className="text-[11px] font-medium uppercase tracking-wider text-idt">IDT</span>
              <span className="col-span-2 text-[14px] text-ink-faint">…</span>
            </>
          ) : (
            row('IDT', fmt(idt?.dg, 2), level(idt?.dg ?? null), fmtTm(idt?.tm))
          ))}
        {idtNote && <span className="col-span-3 text-[11px] text-ink-faint">{idtNote}</span>}
      </div>
      {children}
    </div>
  );
}

function Figure({ s, c, dimer, view, colorBy }: { s: Section; c: StructureCandidate; dimer: boolean; view: DimerView; colorBy: ColorBy }) {
  if (!dimer) {
    return <StriderStructure sequence={s.seq1} structure={c.structure} title="Hairpin" fallback={null} colorBy={colorBy} />;
  }
  const seq2 = s.seq2!;
  const duplex = <DuplexSvg seq1={s.seq1} seq2={seq2} structure={c.structure} title={s.names ? 'Heterodimer' : 'Self-dimer'} colorBy={colorBy} />;
  return view === 'duplex' ? duplex : <StriderStructure sequence={s.seq1 + seq2} nick={s.seq1.length} strandNames={s.names} structure={c.structure} title={s.names ? 'Heterodimer' : 'Self-dimer'} fallback={duplex} colorBy={colorBy} />;
}
