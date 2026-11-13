import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { parseOligo } from '../lib/format';
import { forwardName, reverseName, roleOf, type OligoRole, type SavedOligo } from '../lib/savedOligos';
import { Button, Segmented } from './ui';

/** Bases as one mono line, LNA in the accent colour. */
function OligoText({ sequence }: { sequence: string }) {
  const p = parseOligo(sequence);
  return (
    <span className="font-mono tracking-[0.04em]">
      {[...p.dna].map((b, i) =>
        p.lna[i] ? (
          <span key={i} className="font-medium text-accent">
            {b}
          </span>
        ) : (
          <span key={i}>{b}</span>
        ),
      )}
    </span>
  );
}

const inputClass =
  'h-7 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none sm:max-w-xs';

/** What the form saves: one oligo, or the oligo and its partner as a pair. */
export type SaveRequest = { kind: 'single'; name: string; role: OligoRole } | { kind: 'pair'; name: string; sequenceName: string; partnerName: string };

interface SaveFormProps {
  initialName: string;
  /** Present when there is a partner: the pair's starting names. */
  pair?: { name: string; sequenceName?: string; partnerName?: string };
  onSave: (req: SaveRequest) => void;
  onCancel: () => void;
}

/** Inline "name this oligo" row; with a partner it names the primer pair
 * and each primer. Enter saves, Escape cancels. */
export function SaveOligoForm({ initialName, pair, onSave, onCancel }: SaveFormProps) {
  const [asPair, setAsPair] = useState(!!pair);
  const [name, setName] = useState(pair ? pair.name : initialName);
  const [single, setSingle] = useState(initialName);
  const [role, setRole] = useState<OligoRole>('primer');
  // Empty primer names follow the pair name ("<pair>-F", "<pair>-R").
  const [fwd, setFwd] = useState(pair?.sequenceName ?? '');
  const [rev, setRev] = useState(pair?.partnerName ?? '');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.select(), [asPair]);
  const pairName = name.trim();
  const fwdName = fwd.trim() || (pairName && forwardName(pairName));
  const revName = rev.trim() || (pairName && reverseName(pairName));
  const ok = asPair ? !!pairName : !!single.trim();
  const submit = () => {
    if (!ok) return;
    onSave(asPair ? { kind: 'pair', name: pairName, sequenceName: fwdName, partnerName: revName } : { kind: 'single', name: single.trim(), role });
  };
  const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
  return (
    <form
      className="mt-2 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {pair && (
        <Segmented
          label="What to save"
          value={asPair ? 'pair' : 'single'}
          onChange={(v) => setAsPair(v === 'pair')}
          options={[
            { value: 'pair', label: 'Primer pair' },
            { value: 'single', label: 'Sequence only' },
          ]}
        />
      )}
      {asPair ? (
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1.5 sm:max-w-md">
          <label htmlFor="save-name" className="text-[12px] text-ink-muted">
            Pair
          </label>
          <input id="save-name" ref={input} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={esc} maxLength={80} className={inputClass} />
          <label htmlFor="save-fwd" className="text-[12px] text-ink-muted">
            Sequence
          </label>
          <input id="save-fwd" value={fwd} placeholder={pairName ? forwardName(pairName) : 'Forward primer'} onChange={(e) => setFwd(e.target.value)} onKeyDown={esc} maxLength={80} className={inputClass} />
          <label htmlFor="save-rev" className="text-[12px] text-ink-muted">
            Partner
          </label>
          <input id="save-rev" value={rev} placeholder={pairName ? reverseName(pairName) : 'Reverse primer'} onChange={(e) => setRev(e.target.value)} onKeyDown={esc} maxLength={80} className={inputClass} />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="save-name" className="text-[12px] text-ink-muted">
            Name
          </label>
          <input id="save-name" ref={input} value={single} onChange={(e) => setSingle(e.target.value)} onKeyDown={esc} maxLength={80} className={inputClass} />
          <Segmented
            label="Role"
            value={role}
            onChange={setRole}
            options={[
              { value: 'primer', label: 'Primer' },
              { value: 'probe', label: 'Probe' },
            ]}
          />
        </div>
      )}
      <div className="flex gap-2">
        <Button variant="solid" type="submit" disabled={!ok}>
          {asPair ? 'Save pair' : 'Save'}
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

/** Primer or probe; click to switch. */
function RoleTag({ role, onToggle }: { role: OligoRole; onToggle: () => void }) {
  const probe = role === 'probe';
  return (
    <button
      type="button"
      onClick={onToggle}
      title={`Marked as ${role} (click to make it a ${probe ? 'primer' : 'probe'})`}
      className={`mt-2.5 shrink-0 rounded-sm px-1.5 text-[10px] font-medium uppercase tracking-wide ${probe ? 'bg-idt-subtle text-idt' : 'bg-surface-2 text-ink-muted hover:text-ink'}`}
    >
      {role}
    </button>
  );
}

/** A saved primer pair. Any click loads both primers; a primer row puts
 * that primer first (in the Sequence field). */
function PairEntry({ o, partner, active, onOpen }: { o: SavedOligo; partner: string; active: boolean; onOpen: ListProps['onOpen'] }) {
  const rows = [
    { only: 'sequence' as const, name: o.sequenceName ?? forwardName(o.name), seq: o.sequence },
    { only: 'partner' as const, name: o.partnerName ?? reverseName(o.name), seq: partner },
  ];
  return (
    <div className="min-w-0 flex-1">
      <button type="button" onClick={() => onOpen(o)} className="flex w-full items-baseline gap-2 px-4 pt-2 pb-1 text-left hover:bg-surface-2" aria-current={active || undefined} title="Load both primers">
        <span className="truncate text-[13px] font-medium text-ink">{o.name}</span>
        <span className="shrink-0 rounded-sm bg-surface-2 px-1 text-[10px] font-medium uppercase tracking-wide text-ink-muted">Pair</span>
      </button>
      {rows.map((r) => (
        <button key={r.only} type="button" onClick={() => onOpen(o, r.only)} className="flex w-full items-baseline gap-2 px-4 py-0.5 text-left text-[12px] last:pb-2 hover:bg-surface-2" title={`Load ${r.name} with its partner`}>
          <span className="w-24 shrink-0 truncate text-ink-muted">{r.name}</span>
          <span className="min-w-0 flex-1 truncate text-ink-muted">
            <OligoText sequence={r.seq} />
          </span>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-faint">{parseOligo(r.seq).dna.length} nt</span>
        </button>
      ))}
    </div>
  );
}

interface ListProps {
  oligos: SavedOligo[];
  activeId: string | null;
  /** Load the entry; for a pair, `first` says which primer goes in the
   * Sequence field (the other always comes along as Partner). */
  onOpen: (o: SavedOligo, first?: 'sequence' | 'partner') => void;
  onDelete: (o: SavedOligo) => void;
  /** Switch a single oligo between primer and probe. */
  onRole: (o: SavedOligo, role: OligoRole) => void;
  undo: SavedOligo | null;
  onUndo: () => void;
}

/** The user's saved oligos: click one to load it, x to delete it. */
export default function SavedOligos({ oligos, activeId, onOpen, onDelete, onRole, undo, onUndo }: ListProps) {
  return (
    <section aria-label="Saved oligos" className="rounded-md border border-line bg-surface">
      {oligos.length === 0 && !undo && <p className="px-4 py-3 text-[13px] text-ink-faint">Nothing saved yet. Type an oligo (add a partner to keep a primer pair) and press Save to keep it here, in this browser.</p>}
      {oligos.length > 0 && (
        <ul className="max-h-72 divide-y divide-line overflow-y-auto">
          {oligos.map((o) => {
            const active = o.id === activeId;
            return (
              <li key={o.id} className={`group flex items-start gap-2 pr-2 ${active ? 'bg-accent-subtle/60' : ''}`}>
                {o.partner ? (
                  <PairEntry o={o} partner={o.partner} active={active} onOpen={onOpen} />
                ) : (
                  <button type="button" onClick={() => onOpen(o)} className="min-w-0 flex-1 px-4 py-2 text-left hover:bg-surface-2" aria-current={active || undefined} title="Load this oligo">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-[13px] font-medium text-ink">{o.name}</span>
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-faint">{parseOligo(o.sequence).dna.length} nt</span>
                    </div>
                    <div className="truncate text-[12px] text-ink-muted">
                      <OligoText sequence={o.sequence} />
                    </div>
                  </button>
                )}
                {!o.partner && (
                  <RoleTag role={roleOf(o)} onToggle={() => onRole(o, roleOf(o) === 'probe' ? 'primer' : 'probe')} />
                )}
                <button
                  type="button"
                  onClick={() => onDelete(o)}
                  aria-label={`Delete ${o.name}`}
                  title="Delete"
                  className="mt-2 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-ink-faint hover:bg-danger-subtle hover:text-danger"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {undo && (
        <div className={`flex items-center justify-between gap-3 px-4 py-2 text-[12px] text-ink-muted ${oligos.length ? 'border-t border-line' : ''}`} role="status">
          <span className="truncate">Deleted {undo.name}.</span>
          <button type="button" onClick={onUndo} className="shrink-0 font-medium text-accent hover:underline">
            Undo
          </button>
        </div>
      )}
    </section>
  );
}
