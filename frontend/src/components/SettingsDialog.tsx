import { useEffect, useRef } from 'react';
import type { Engine, EquilibriumSplit } from '../lib/api';
import type { IdtCredentials } from '../lib/idt';
import IdtCredentialsForm from './IdtCredentialsForm';
import { Segmented } from './ui';

export type SettingsTab = 'engine' | 'idt';

interface Props {
  open: boolean;
  tab: SettingsTab;
  onTabChange: (t: SettingsTab) => void;
  onClose: () => void;
  engine: Engine;
  onEngineChange: (e: Engine) => void;
  equilibriumSplit: EquilibriumSplit;
  onEquilibriumSplitChange: (s: EquilibriumSplit) => void;
  credentials: IdtCredentials;
  onCredentialsSaved: (c: IdtCredentials) => void;
}

/** Oligool-style settings: the Engine tab holds the structure engine and
 * equilibrium split (both apply immediately), the IDT tab holds the
 * credentials form extracted from the old IdtDialog. */
export default function SettingsDialog({ open, tab, onTabChange, onClose, engine, onEngineChange, equilibriumSplit, onEquilibriumSplitChange, credentials, onCredentialsSaved }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-black/40"
    >
      <div className="p-5">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-[15px] font-medium">Settings</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-ink-faint hover:text-ink">
            ✕
          </button>
        </div>
        <div className="mb-4 mt-3">
          <Segmented
            label="Settings tab"
            value={tab}
            onChange={onTabChange}
            options={[
              { value: 'engine', label: 'Engine' },
              { value: 'idt', label: 'IDT' },
            ]}
          />
        </div>

        {tab === 'engine' ? (
          <div className="space-y-5">
            <div>
              <p className="mb-1.5 text-[12px] text-ink-muted">Structure engine</p>
              <Segmented
                label="Structure engine"
                value={engine}
                onChange={onEngineChange}
                options={[
                  { value: 'mathews', label: 'Mathews', title: 'Mathews 2004 (closest to IDT)' },
                  { value: 'santalucia', label: 'SantaLucia', title: 'SantaLucia 2004 (Strider native)' },
                ]}
              />
              <p className="mt-1.5 text-[12px] leading-relaxed text-ink-faint">
                Nearest-neighbour parameters for hairpins and dimers. Duplex Tm always uses SantaLucia &amp; Hicks 2004.
              </p>
            </div>
            <div>
              <p className="mb-1.5 text-[12px] text-ink-muted">Equilibrium</p>
              <Segmented
                label="Equilibrium split"
                value={equilibriumSplit}
                onChange={onEquilibriumSplitChange}
                options={[
                  { value: 'two-way', label: 'Two-state (model)', title: 'Classic hairpin-vs-open sigmoid from the same dH/dS behind the Local Tm: 50% at Tm, smooth decay past it' },
                  { value: 'three-way', label: 'Ensemble', title: 'Full partition: the free monomer pool splits into unfolded, the best fold, and other folds' },
                ]}
              />
              <p className="mt-1.5 text-[12px] leading-relaxed text-ink-faint">How the stability strips split the monomer pool.</p>
            </div>
          </div>
        ) : (
          <IdtCredentialsForm credentials={credentials} onSaved={onCredentialsSaved} />
        )}
      </div>
    </dialog>
  );
}
