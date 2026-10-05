import { useCallback, useEffect, useState } from 'react';
import { analyze, ApiError, type AnalyzeResponse, type Engine, type IdtKind } from './lib/api';
import { conditionsKey, loadConditions, saveConditions, type Conditions } from './lib/conditions';
import { cleanSequence } from './lib/format';
import { EMPTY_CREDENTIALS, hasCredentials, loadCredentials, runIdt, type IdtCredentials } from './lib/idt';
import ConditionsBar from './components/ConditionsBar';
import IdtDialog from './components/IdtDialog';
import type { IdtEntry } from './components/IdtButton';
import PropertiesTable from './components/PropertiesTable';
import SequenceField from './components/SequenceField';
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

const idtKey = (kind: IdtKind, c: Conditions, seq: string, partner?: string) => `${kind}|${conditionsKey(c)}|${seq}|${partner ?? ''}`;

export default function App() {
  const [theme, setTheme] = useTheme();
  const [seqText, setSeqText] = useState('');
  const [partnerText, setPartnerText] = useState('');
  const [showPartner, setShowPartner] = useState(false);
  const [conditions, setConditions] = useState<Conditions>(loadConditions);
  const [engine, setEngine] = useState<Engine>(loadEngine);
  const [result, setResult] = useState<{ data: AnalyzeResponse; conditions: Conditions } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creds, setCreds] = useState<IdtCredentials>(EMPTY_CREDENTIALS);
  const [dialogOpen, setDialogOpen] = useState(false);
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
      setDialogOpen(true);
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
                onClick={() => setDialogOpen(true)}
                className={`inline-flex h-7 items-center gap-2 rounded-full border px-3 text-[12px] font-medium ${connected ? 'border-idt/40 text-idt' : 'border-line-strong text-ink-muted hover:text-ink'}`}
              >
                <span className={`size-1.5 rounded-full ${connected ? 'bg-idt' : 'bg-ink-faint'}`} />
                {connected ? `IDT · ${creds.region.toUpperCase()}` : 'Connect IDT'}
              </button>
              <button type="button" onClick={() => setTheme(nextTheme[theme])} title={`Theme: ${theme}`} aria-label={`Theme: ${theme}`} className="inline-flex size-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink">
                <ThemeIcon theme={theme} />
              </button>
            </div>
          </div>
          <ConditionsBar value={conditions} onChange={setConditions} engine={engine} onEngineChange={setEngine} />
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
                  Add a partner for the heterodimer. Connect IDT to compare each result with OligoAnalyzer.
                </>
              )}
            </div>
          )
        )}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-5xl px-4 py-4 text-[11px] leading-relaxed text-ink-faint sm:px-6">
          Strider (native Rust, via Primerool): SantaLucia &amp; Hicks 2004 nearest-neighbour duplex Tm with Owczarzy Na⁺/Mg²⁺ correction (Mg²⁺ net of dNTPs); hairpins and dimers folded and scored with {engine === 'mathews' ? 'Mathews 2004' : 'SantaLucia 2004'} parameters, ranked suboptimal structures. IDT values come from IDT OligoAnalyzer under the same conditions.
        </div>
      </footer>

      <IdtDialog open={dialogOpen} credentials={creds} onClose={() => setDialogOpen(false)} onSaved={setCreds} />
    </div>
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
