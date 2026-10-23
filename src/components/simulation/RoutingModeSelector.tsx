import { GitCompareArrows, Route, Split } from 'lucide-react';
import { useSim } from '../../store/simulationStore';
import type { RoutingMode } from '../../types/simulation';

const MODES: { id: RoutingMode; label: string; desc: string; icon: typeof Route; color: string }[] = [
  { id: 'adaptive', label: 'Adaptive Single-Path', desc: 'Dijkstra minimum-cost route, recomputed on every topology change', icon: Route, color: 'text-cyan-300 border-cyan-400/50 bg-cyan-500/10' },
  { id: 'multipath', label: 'Multipath', desc: 'Up to k loop-free paths; packets distributed across them', icon: Split, color: 'text-purple-300 border-purple-400/50 bg-purple-500/10' },
  { id: 'compare', label: 'Compare Both', desc: 'Both algorithms run side by side on isolated copies, same events', icon: GitCompareArrows, color: 'text-amber-300 border-amber-400/50 bg-amber-500/10' },
];

export function RoutingModeSelector({ disabled }: { disabled: boolean }) {
  const mode = useSim((s) => s.mode);
  const setMode = useSim((s) => s.setMode);
  return (
    <div>
      <span className="field-label">Routing mode</span>
      <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Routing mode">
        {MODES.map((m) => {
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              role="radio"
              aria-checked={active}
              disabled={disabled && !active}
              onClick={() => setMode(m.id)}
              className={`flex items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors disabled:opacity-40 ${active ? m.color : 'border-ink-600 bg-ink-850 text-slate-300 hover:border-ink-500'}`}
            >
              <m.icon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="block text-[13px] font-semibold">{m.label}</span>
                <span className="block text-[11px] leading-snug text-slate-400">{m.desc}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
