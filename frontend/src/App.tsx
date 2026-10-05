import { useCallback, useEffect, useState } from 'react';
import { analyze, ApiError, type AnalyzeResponse, type Engine, type EquilibriumSplit, type IdtKind } from './lib/api';
import { conditionsKey, loadConditions, saveConditions, type Conditions } from './lib/conditions';
import { cleanSequence } from './lib/format';
import { EMPTY_CREDENTIALS, hasCredentials, loadCredentials, runIdt, type IdtCredentials } from './lib/idt';
import ConditionsBar from './components/ConditionsBar';
import SettingsDialog, { type SettingsTab } from './components/SettingsDialog';
import type { IdtEntry } from './components/IdtButton';
import PropertiesTable from './components/PropertiesTable';
import SequenceField from './components/SequenceField';
import StabilityPanel from './components/StabilityPanel';
import StructurePanel from './components/StructurePanel';
import { Spinner } from './components/ui';

const EXAMPLE = { oligo: 'GCACTACAACCGCTACCGTG', partner: 'TCCAGGAGCTCGTTGTAGCC' };

type Theme = 'system' | 'light' | 'dark';

function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem('thermool-theme') as Theme) || 'system';
    } catch {
      return 'system';
    }
  });
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && media.matches));
    apply();
    try {
      localStorage.setItem('thermool-theme', theme);
    } catch {
      /* not remembered */
    }
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  return [theme, setTheme] as const;
}

function loadEngine(): Engine {
  try {
    return localStorage.getItem('thermool-engine') === 'santalucia' ? 'santalucia' : 'mathews';
  } catch {
    return 'mathews';
  }
}

function loadEquilibriumSplit(): EquilibriumSplit {
  try {
    return localStorage.getItem('thermool-equilibrium-split') === 'three-way' ? 'three-way' : 'two-way';
  } catch {
    return 'two-way';
  }
}

const idtKey = (kind: IdtKind, c: Conditions, seq: string, partner?: string) => `${kind}|${conditionsKey(c)}|${seq}|${partner ?? ''}`;

export default function App() {
  const [theme, setTheme] = useTheme();
  const [seqText, setSeqText] = useState('');
  const [partnerText, setPartnerText] = useState('');
  const [showPartner, setShowPartner] = useState(false);
  const [conditions, setConditions] = useState<Conditions>(loadConditions);
  const [engine, setEngine] = useState<Engine>(loadEngine);
  const [equilibriumSplit, setEquilibriumSplit] = useState<EquilibriumSplit>(loadEquilibriumSplit);
  const [result, setResult] = useState<{ data: AnalyzeResponse; conditions: Conditions } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creds, setCreds] = useState<IdtCredentials>(EMPTY_CREDENTIALS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('engine');
  const [idt, setIdt] = useState<Record<string, IdtEntry>>({});

  useEffect(() => {
    loadCredentials().then(setCreds, () => {});
  }, []);

  useEffect(() => saveConditions(conditions), [conditions]);
  useEffect(() => {
    try {
      localStorage.setItem('thermool-engine', engine);
    } catch {
      /* not remembered */
    }
  }, [engine]);
  useEffect(() => {
    try {
      localStorage.setItem('thermool-equilibrium-split', equilibriumSplit);
    } catch {
      /* not remembered */
    }
  }, [equilibriumSplit]);

  const oligo = cleanSequence(seqText);
  const partner = showPartner ? cleanSequence(partnerText) : '';

  // Re-analyze shortly after typing stops; a newer request cancels the old one.
  useEffect(() => {
    if (!oligo) {
      setResult(null);
      setError(null);
      setLoading(false);
      return;
    }
    const ctl = new AbortController();
    const c = conditions;
    setLoading(true);
    const t = setTimeout(() => {
      analyze(oligo, partner || null, c, engine, ctl.signal)
        .then((data) => {
          setResult({ data, conditions: c });
          setError(null);
        })
        .catch((e) => {
          if (ctl.signal.aborted) return;
          setError(e instanceof ApiError ? e.message : String(e));
        })
        .finally(() => {
          if (!ctl.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [oligo, partner, conditions, engine]);

  const connected = hasCredentials(creds);

  const getIdt = useCallback((kind: IdtKind, seq: string, p?: string) => (result ? idt[idtKey(kind, result.conditions, seq, p)] : undefined), [idt, result]);

  /** Runs one analysis on IDT, under the conditions the shown result used. */
  const requestIdt = (kind: IdtKind) => {
    if (!result) return;
    if (!connected) {
      setSettingsTab('idt');
      setSettingsOpen(true);
      return;
    }
    const { data, conditions: c } = result;
    const o = data.oligo.sequence;
    const p = data.partner?.sequence;
    const jobs: [string, string | undefined][] = kind === 'hetero_dimer' ? (p ? [[o, p]] : []) : [[o, undefined], ...(p ? [[p, undefined] as [string, undefined]] : [])];
    for (const [seq, second] of jobs) {
      const key = idtKey(kind, c, seq, second);
      setIdt((m) => ({ ...m, [key]: { status: 'loading' } }));
      runIdt(creds, kind, seq, c, second).then(
        (raw) => setIdt((m) => ({ ...m, [key]: { status: 'done', raw } })),
        (e) => setIdt((m) => ({ ...m, [key]: { status: 'error', error: e instanceof Error ? e.message : String(e) } })),
      );
    }
  };

  const data = result?.data;
  const nextTheme: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };

  return (
    <div className="min-h-screen">
      {/* Oligool-style floating bar: title, settings and IDT stay in reach while results scroll. */}
      <header className="relative z-40 mx-auto mt-2 max-w-5xl px-2 sm:sticky sm:top-2 sm:px-4">
        <div className="rounded-lg border border-line bg-base/92 px-4 py-3 shadow-sm backdrop-blur-md">
          <div className="mb-2.5 flex items-start justify-between gap-3">
            <div>
              <h1 className="text-[17px] font-semibold tracking-tight">Thermool</h1>
              <p className="text-[12px] text-ink-faint">Oligo thermodynamics by Strider</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                title={connected ? `Settings (IDT connected, ${creds.region.toUpperCase()})` : 'Settings'}
                aria-label="Settings"
                className="relative inline-flex size-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink"
              >
                <GearIcon />
                {connected && <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-idt" aria-label="IDT connected" />}
              </button>
              <button type="button" onClick={() => setTheme(nextTheme[theme])} title={`Theme: ${theme}`} aria-label={`Theme: ${theme}`} className="inline-flex size-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink">
                <ThemeIcon theme={theme} />
              </button>
            </div>
          </div>
          <ConditionsBar value={conditions} onChange={setConditions} />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        <div className="space-y-5 pt-6 pb-6">
          <SequenceField
            id="oligo"
            label="Sequence"
            value={seqText}
            onChange={setSeqText}
            autoFocus
            placeholder="Paste a DNA oligo, 5′ to 3′ (raw or FASTA)"
            actions={
              <>
                {!seqText && (
                  <button
                    type="button"
                    className="text-ink-muted underline decoration-line-strong underline-offset-2 hover:text-ink"
                    onClick={() => {
                      setSeqText(EXAMPLE.oligo);
                      setPartnerText(EXAMPLE.partner);
                    }}
                  >
                    Example
                  </button>
                )}
                {seqText && (
                  <button type="button" className="text-ink-muted hover:text-ink" onClick={() => setSeqText('')}>
                    Clear
                  </button>
                )}
                {!showPartner && (
                  <button type="button" className="text-ink-muted underline decoration-line-strong underline-offset-2 hover:text-ink" onClick={() => setShowPartner(true)}>
                    + Partner
                  </button>
                )}
              </>
            }
          />
          {showPartner && (
            <SequenceField
              id="partner"
              label="Partner (for heterodimer)"
              value={partnerText}
              onChange={setPartnerText}
              placeholder="Second oligo, 5′ to 3′"
              actions={
                <button type="button" className="text-ink-muted hover:text-ink" onClick={() => setShowPartner(false)}>
                  Remove
                </button>
              }
            />
          )}
        </div>

        {error && (
          <div role="alert" className="mb-5 rounded-md bg-danger-subtle px-3 py-2 text-[13px] text-danger">
            {error}
          </div>
        )}

        {data ? (
          <div className={`space-y-8 transition-opacity ${loading || error ? 'opacity-50' : ''}`}>
            <div className="relative">
              {loading && <Spinner className="absolute -top-5 right-0 text-ink-faint" />}
              <PropertiesTable
                strands={[
                  { label: 'Oligo', props: data.oligo, idt: getIdt('analyze', data.oligo.sequence) },
                  ...(data.partner ? [{ label: 'Partner', props: data.partner, idt: getIdt('analyze', data.partner.sequence) }] : []),
                ]}
                onIdt={() => requestIdt('analyze')}
                idtConnected={connected}
              />
            </div>
            <StabilityPanel
              sequence={data.oligo.sequence}
              partner={data.partner?.sequence ?? null}
              conditions={result.conditions}
              engine={engine}
              split={equilibriumSplit}
              onAddPartner={() => setShowPartner(true)}
            />
            <StructurePanel result={data} getIdt={getIdt} onIdt={requestIdt} idtConnected={connected} onAddPartner={() => setShowPartner(true)} />
          </div>
        ) : (
          !error && (
            <div className="rounded-md border border-dashed border-line-strong px-6 py-14 text-center text-[13px] leading-relaxed text-ink-faint">
              {loading ? (
                <Spinner />
              ) : (
                <>
                  Paste a sequence to see its Tm, GC content, hairpins and dimers.
                  <br />
                  Add a partner for the heterodimer. Connect IDT in settings to compare each result with OligoAnalyzer.
                </>
              )}
            </div>
          )
        )}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-5xl px-4 py-4 text-[11px] leading-relaxed text-ink-faint sm:px-6">
          Strider (native Rust, vendored in this repo): SantaLucia &amp; Hicks 2004 nearest-neighbour duplex Tm with Owczarzy Na⁺/Mg²⁺ correction (Mg²⁺ net of dNTPs); hairpins and dimers folded and scored with {engine === 'mathews' ? 'Mathews 2004' : 'SantaLucia 2004'} parameters, ranked suboptimal structures. IDT values come from IDT OligoAnalyzer under the same conditions.
        </div>
      </footer>

      <SettingsDialog
        open={settingsOpen}
        tab={settingsTab}
        onTabChange={setSettingsTab}
        onClose={() => setSettingsOpen(false)}
        engine={engine}
        onEngineChange={setEngine}
        equilibriumSplit={equilibriumSplit}
        onEquilibriumSplitChange={setEquilibriumSplit}
        credentials={creds}
        onCredentialsSaved={setCreds}
      />
    </div>
  );
}

function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function ThemeIcon({ theme }: { theme: Theme }) {
  const common = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (theme === 'light')
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  if (theme === 'dark')
    return (
      <svg {...common}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    );
  return (
    <svg {...common}>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}
