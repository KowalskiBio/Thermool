import { useState } from 'react';
import { EMPTY_CREDENTIALS, hasCredentials, saveCredentials, testCredentials, type IdtCredentials } from '../lib/idt';
import { Button, Segmented, Spinner } from './ui';

interface Props {
  credentials: IdtCredentials;
  onSaved: (c: IdtCredentials) => void;
}

const FIELDS: { key: Exclude<keyof IdtCredentials, 'region'>; label: string; secret: boolean }[] = [
  { key: 'clientId', label: 'Client ID', secret: false },
  { key: 'clientSecret', label: 'Client secret', secret: true },
  { key: 'username', label: 'Username', secret: false },
  { key: 'password', label: 'Password', secret: true },
];

/** IDT OligoAnalyzer API credentials, as in Oligool/Primerool. Saving
 * signs in once to check the credentials before keeping them. Lives in
 * the settings dialog; the draft resets whenever it is remounted. */
export default function IdtCredentialsForm({ credentials, onSaved }: Props) {
  const [draft, setDraft] = useState(credentials);
  const [revealed, setRevealed] = useState(false);
  const [status, setStatus] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'error'; text?: string }>({ kind: 'idle' });

  const save = async () => {
    setStatus({ kind: 'busy' });
    try {
      await testCredentials(draft);
      await saveCredentials(draft);
      onSaved(draft);
      setStatus({ kind: 'ok', text: 'Connected. Credentials saved in this browser.' });
    } catch (e) {
      setStatus({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  };

  const remove = async () => {
    await saveCredentials(null);
    setDraft(EMPTY_CREDENTIALS);
    onSaved(EMPTY_CREDENTIALS);
    setStatus({ kind: 'idle' });
  };

  return (
    <div>
      <p className="mb-4 text-[12px] leading-relaxed text-ink-muted">
        API credentials from your IDT account (
        <a href="https://www.idtdna.com/pages/tools/apidoc" target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">
          IDT API access
        </a>
        ). Stored encrypted in this browser and used only when you press an IDT button; Thermool’s server relays them to IDT and keeps nothing.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1">
            <span className="text-[12px] text-ink-muted">{f.label}</span>
            <span className="relative">
              <input
                type={f.secret && !revealed ? 'password' : 'text'}
                autoComplete="off"
                spellCheck={false}
                value={draft[f.key]}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                className={`h-8 w-full rounded-md border border-line-strong bg-surface px-2 font-mono text-[13px] focus:border-accent focus:outline-none ${f.secret ? 'pr-12' : ''}`}
              />
              {f.secret && (
                <button type="button" onClick={() => setRevealed((r) => !r)} aria-pressed={revealed} className="absolute inset-y-0 right-0 px-2.5 text-[11px] font-medium text-ink-muted hover:text-ink">
                  {revealed ? 'Hide' : 'Show'}
                </button>
              )}
            </span>
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="text-[12px] text-ink-muted">Region</span>
        <Segmented label="IDT region" value={draft.region} onChange={(region) => setDraft({ ...draft, region })} options={[{ value: 'eu', label: 'EU' }, { value: 'us', label: 'US' }]} />
        <span className="font-mono text-[11px] text-ink-faint">{draft.region === 'us' ? 'www.idtdna.com' : 'eu.idtdna.com'}</span>
      </div>

      {status.text && <p className={`mt-4 rounded-md px-3 py-2 text-[12px] ${status.kind === 'error' ? 'bg-danger-subtle text-danger' : 'bg-idt-subtle text-idt'}`}>{status.text}</p>}

      <div className="mt-5 flex items-center justify-between">
        {hasCredentials(credentials) ? (
          <Button onClick={remove} className="hover:!border-danger hover:!text-danger">
            Forget credentials
          </Button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => void save()}
          disabled={!hasCredentials(draft) || status.kind === 'busy'}
          className="inline-flex h-7 items-center gap-1.5 rounded-md bg-accent-solid px-3 text-[12px] font-medium text-white hover:bg-accent-solid-hover disabled:opacity-50"
        >
          {status.kind === 'busy' && <Spinner />}
          Connect
        </button>
      </div>
    </div>
  );
}
