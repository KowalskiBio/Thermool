import { useEffect, useRef, useState } from 'react';
import { parseOligo } from '../lib/format';
import type { SavedOligo } from '../lib/savedOligos';
import { Button } from './ui';

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

interface SaveFormProps {
  initialName: string;
  withPartner: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
}

/** Inline "name this oligo" row; Enter saves, Escape cancels. */
export function SaveOligoForm({ initialName, withPartner, onSave, onCancel }: SaveFormProps) {
  const [name, setName] = useState(initialName);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.select(), []);
  const submit = () => name.trim() && onSave(name.trim());
  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor="save-name" className="text-[12px] text-ink-muted">
        Name
      </label>
      <input
        id="save-name"
        ref={input}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        maxLength={80}
        className="h-7 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-2 text-[13px] text-ink focus:border-accent focus:outline-none sm:max-w-xs"
      />
      <Button variant="solid" type="submit" disabled={!name.trim()}>
        Save{withPartner ? ' with partner' : ''}
      </Button>
      <Button onClick={onCancel}>Cancel</Button>
    </form>
  );
}

interface ListProps {
  oligos: SavedOligo[];
  activeId: string | null;
  onOpen: (o: SavedOligo) => void;
  onDelete: (o: SavedOligo) => void;
  undo: SavedOligo | null;
  onUndo: () => void;
}

/** The user's saved oligos: click one to load it, x to delete it. */
export default function SavedOligos({ oligos, activeId, onOpen, onDelete, undo, onUndo }: ListProps) {
  return (
    <section aria-label="Saved oligos" className="rounded-md border border-line bg-surface">
      {oligos.length === 0 && !undo && <p className="px-4 py-3 text-[13px] text-ink-faint">Nothing saved yet. Type an oligo and press Save to keep it here, in this browser.</p>}
      {oligos.length > 0 && (
        <ul className="max-h-72 divide-y divide-line overflow-y-auto">
          {oligos.map((o) => {
            const active = o.id === activeId;
            return (
              <li key={o.id} className={`group flex items-start gap-2 pr-2 ${active ? 'bg-accent-subtle/60' : ''}`}>
                <button type="button" onClick={() => onOpen(o)} className="min-w-0 flex-1 px-4 py-2 text-left hover:bg-surface-2" aria-current={active || undefined} title="Load this oligo">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-[13px] font-medium text-ink">{o.name}</span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-faint">
                      {parseOligo(o.sequence).dna.length} nt{o.partner ? ' + partner' : ''}
                    </span>
                  </div>
                  <div className="truncate text-[12px] text-ink-muted">
                    <OligoText sequence={o.sequence} />
                  </div>
                  {o.partner && (
                    <div className="truncate text-[12px] text-ink-faint">
                      <OligoText sequence={o.partner} />
                    </div>
                  )}
                </button>
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
