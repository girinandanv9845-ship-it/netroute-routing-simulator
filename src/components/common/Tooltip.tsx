import { useState, type ReactNode } from 'react';

/** Lightweight hover/focus tooltip. */
export function Tooltip({ content, children, side = 'top', width = 'w-64' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom'; width?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
      {children}
      {open && (
        <span
          role="tooltip"
          className={`pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 ${side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'} ${width} animate-fadeIn rounded-lg border border-ink-500 bg-ink-800 px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-slate-300 shadow-xl`}
        >
          {content}
        </span>
      )}
    </span>
  );
}
