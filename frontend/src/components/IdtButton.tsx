import { Button, Spinner } from './ui';

export type IdtEntry = { status: 'loading' } | { status: 'done'; raw: unknown } | { status: 'error'; error: string };

/** Combined state of the IDT calls behind one button. */
export function combine(entries: (IdtEntry | undefined)[]): 'idle' | 'loading' | 'done' | 'error' {
  if (entries.some((e) => e?.status === 'loading')) return 'loading';
  if (entries.some((e) => e?.status === 'error')) return 'error';
  if (entries.length > 0 && entries.every((e) => e?.status === 'done')) return 'done';
  return 'idle';
}

export default function IdtButton({ state, onClick, connected }: { state: ReturnType<typeof combine>; onClick: () => void; connected: boolean }) {
  const title = connected ? 'Run this analysis on IDT OligoAnalyzer with the same conditions' : 'Connect your IDT account first';
  return (
    <Button variant="idt" onClick={onClick} disabled={state === 'loading'} title={title}>
      {state === 'loading' ? <Spinner /> : <span className="font-mono text-[11px]">IDT</span>}
      {state === 'loading' ? 'Asking IDT' : state === 'done' ? 'Refresh' : state === 'error' ? 'Retry' : 'Compare'}
    </Button>
  );
}

export function IdtErrors({ entries }: { entries: (IdtEntry | undefined)[] }) {
  const errors = [...new Set(entries.flatMap((e) => (e?.status === 'error' ? [e.error] : [])))];
  if (errors.length === 0) return null;
  return (
    <div role="alert" className="mt-2 rounded-md bg-danger-subtle px-3 py-2 text-[12px] text-danger">
      {errors.join(' · ')}
    </div>
  );
}

/** IDT answered but none of its fields could be read: show what it sent. */
export function Unreadable({ raw }: { raw: unknown }) {
  return (
    <div className="mt-2 rounded-md border border-line bg-surface-2 p-3">
      <p className="mb-2 text-[12px] text-ink-muted">IDT answered, but Thermool couldn’t find the values in its response. Raw response:</p>
      <pre className="max-h-72 overflow-auto font-mono text-[11px] text-ink-muted">{JSON.stringify(raw, null, 2)}</pre>
    </div>
  );
}
