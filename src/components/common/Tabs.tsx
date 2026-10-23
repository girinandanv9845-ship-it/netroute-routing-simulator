import type { ReactNode } from 'react';

export function Tabs<T extends string>({ value, onChange, items, className = '' }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; icon?: ReactNode; badge?: ReactNode }[]; className?: string }) {
  return (
    <div role="tablist" className={`flex gap-1 rounded-lg border border-ink-600 bg-ink-850 p-1 ${className}`}>
      {items.map((it) => (
        <button
          key={it.id}
          role="tab"
          aria-selected={value === it.id}
          onClick={() => onChange(it.id)}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
            value === it.id ? 'bg-ink-700 text-cyan-200 shadow' : 'text-slate-400 hover:bg-ink-800 hover:text-slate-200'
          }`}
        >
          {it.icon}
          {it.label}
          {it.badge}
        </button>
      ))}
    </div>
  );
}
