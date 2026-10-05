import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Button({ variant = 'ghost', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'ghost' | 'solid' | 'idt' }) {
  const look = {
    ghost: 'border-line-strong text-ink-muted hover:text-ink hover:border-ink-faint',
    solid: 'border-transparent bg-accent-solid text-white hover:bg-accent-solid-hover',
    idt: 'border-idt/40 text-idt hover:bg-idt-subtle',
  }[variant];
  return (
    <button
      type="button"
      className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${look} ${className}`}
      {...props}
    />
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode; disabled?: boolean; title?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line-strong p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`h-6 rounded-[5px] px-2.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${value === o.value ? 'bg-surface-2 text-ink' : 'text-ink-muted hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return <span className={`inline-block size-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent ${className}`} aria-hidden />;
}

/** A value, or a faint "n/a" when there is none. */
export function Val({ v, unit, className = '' }: { v: string | null; unit?: string; className?: string }) {
  if (v === null) return <span className="text-ink-faint">n/a</span>;
  return (
    <span className={`font-mono tabular-nums ${className}`}>
      {v}
      {unit && <span className="ml-1 text-[12px] font-normal text-ink-faint">{unit}</span>}
    </span>
  );
}
