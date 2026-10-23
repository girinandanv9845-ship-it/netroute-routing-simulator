import { BookOpen, Clock, RotateCcw, Settings } from 'lucide-react';
import { getScenario } from '../../engine/scenarios';
import { useSim } from '../../store/simulationStore';
import { StatusBadge } from '../common/StatusBadge';

const STATUS = {
  ready: { tone: 'slate', label: 'Ready' },
  running: { tone: 'green', label: 'Running' },
  paused: { tone: 'amber', label: 'Paused' },
  completed: { tone: 'cyan', label: 'Completed' },
} as const;

const MODE_LABEL = { adaptive: 'Adaptive Single-Path', multipath: 'Multipath', compare: 'Compare Both' };

export function TopBar() {
  const status = useSim((s) => s.status);
  const mode = useSim((s) => s.mode);
  const simTime = useSim((s) => s.simTime);
  const scenarioId = useSim((s) => s.scenarioId);
  const { reset, togglePanel } = useSim.getState();
  const st = STATUS[status];
  const scenario = scenarioId ? getScenario(scenarioId) : null;

  return (
    <header className="sticky top-0 z-40 border-b border-ink-600/70 bg-ink-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1920px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-400/40 bg-gradient-to-br from-cyan-500/20 to-blue-600/10">
            <svg viewBox="0 0 32 32" className="h-6 w-6" aria-hidden>
              <path d="M8 22 L16 9 L24 22 Z M8 22 L24 22" stroke="#22d3ee" strokeWidth="1.8" fill="none" />
              <circle cx="16" cy="9" r="3" fill="#22d3ee" />
              <circle cx="8" cy="22" r="3" fill="#38bdf8" />
              <circle cx="24" cy="22" r="3" fill="#22c55e" />
            </svg>
          </div>
          <div className="leading-tight">
            <div className="text-lg font-bold tracking-[0.18em] text-white">NETROUTE</div>
            <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">Adaptive Network Intelligence</div>
          </div>
        </div>

        <div className="hidden h-8 w-px bg-ink-600 md:block" />

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <StatusBadge tone={st.tone} dot pulse={status === 'running'}>
            {st.label}
          </StatusBadge>
          <StatusBadge tone={mode === 'multipath' ? 'purple' : mode === 'compare' ? 'amber' : 'cyan'}>Mode: {MODE_LABEL[mode]}</StatusBadge>
          {scenario && <StatusBadge tone="slate">Scenario: {scenario.title}</StatusBadge>}
          <span className="flex items-center gap-1.5 font-mono text-slate-400" title="Simulated time (not wall-clock time)">
            <Clock className="h-3.5 w-3.5" /> t = {simTime.toFixed(1)} ms
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button className="btn-ghost" onClick={() => togglePanel('learn', true)}>
            <BookOpen className="h-4 w-4" /> Learn
          </button>
          <button className="btn-ghost" onClick={() => togglePanel('settings', true)}>
            <Settings className="h-4 w-4" /> Settings
          </button>
          <button className="btn-danger" onClick={reset} disabled={status === 'ready'} title="Clear packets, metrics and timers; restore the network as it was when Start was pressed">
            <RotateCcw className="h-4 w-4" /> Reset
          </button>
        </div>
      </div>
    </header>
  );
}
