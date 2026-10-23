import type { ReactNode } from 'react';

type Tone = 'cyan' | 'green' | 'amber' | 'red' | 'purple' | 'slate';

const TONES: Record<Tone, string> = {
  cyan: 'border-cyan-400/40 bg-cyan-500/10 text-cyan-300',
  green: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300',
  amber: 'border-amber-400/40 bg-amber-500/10 text-amber-300',
  red: 'border-red-400/40 bg-red-500/10 text-red-300',
  purple: 'border-purple-400/40 bg-purple-500/10 text-purple-300',
  slate: 'border-ink-500 bg-ink-800 text-slate-300',
};

const DOT: Record<Tone, string> = {
  cyan: 'bg-cyan-400',
  green: 'bg-emerald-400',
  amber: 'bg-amber-400',
  red: 'bg-red-400',
  purple: 'bg-purple-400',
  slate: 'bg-slate-400',
};

export function StatusBadge({ tone = 'slate', children, dot, pulse, className = '' }: { tone?: Tone; children: ReactNode; dot?: boolean; pulse?: boolean; className?: string }) {
  return (
    <span className={`chip ${TONES[tone]} ${className}`}>
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          {pulse && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${DOT[tone]}`} />}
          <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${DOT[tone]}`} />
        </span>
      )}
      {children}
    </span>
  );
}
