import { Pause, Play, RotateCcw, SkipForward, Square } from 'lucide-react';
import { PACKET_COUNT_OPTIONS } from '../../engine/config';
import { useSim } from '../../store/simulationStore';
import { SPEEDS, type Distribution, type SpeedKey } from '../../types/simulation';
import { Tooltip } from '../common/Tooltip';
import { RoutingModeSelector } from './RoutingModeSelector';

const DISTRIBUTIONS: [Distribution, string, string][] = [
  ['round_robin', 'Round-Robin', 'Packets cycle through the candidate paths in turn.'],
  [
    'load_aware',
    'Load-Aware',
    'Smooth weighted round-robin with weight 1/D², where D is the estimated path delay: propagation + transmission at available bandwidth + congestion queueing + current queue backlog.',
  ],
];

export function SimulationControls() {
  const status = useSim((s) => s.status);
  const config = useSim((s) => s.config);
  const mode = useSim((s) => s.mode);
  const speed = useSim((s) => s.speed);
  const routers = useSim((s) => s.network.routers);
  const engines = useSim((s) => s.engines);
  const { start, pause, resume, stop, step, reset, updateConfig, setSpeed } = useSim.getState();
  const locked = status !== 'ready';
  const sent = engines[0]?.metrics.sent ?? 0;
  const progress = Math.min(100, (sent / config.packetCount) * 100);
  const ids = routers.map((r) => r.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        {status === 'running' ? (
          <button className="btn-warn col-span-2 py-2" onClick={pause}>
            <Pause className="h-4 w-4" /> Pause Simulation
          </button>
        ) : status === 'paused' ? (
          <button className="btn-success col-span-2 py-2" onClick={resume}>
            <Play className="h-4 w-4" /> Resume Simulation
          </button>
        ) : (
          <button className="btn-success col-span-2 py-2" onClick={start}>
            <Play className="h-4 w-4" /> {status === 'completed' ? 'Run Again (same start state)' : 'Start Simulation'}
          </button>
        )}
        <button className="btn-ghost" onClick={step} disabled={status === 'running' || status === 'completed'} title="Advance 2 ms of simulated time (pauses the run)">
          <SkipForward className="h-4 w-4" /> Step
        </button>
        <button className="btn-danger" onClick={stop} disabled={!(status === 'running' || status === 'paused')} title="Stop generating packets; in-flight packets finish">
          <Square className="h-3.5 w-3.5" /> Stop
        </button>
        <button className="btn-ghost col-span-2" onClick={reset} disabled={status === 'ready'}>
          <RotateCcw className="h-4 w-4" /> Reset Simulation
        </button>
      </div>

      {locked && (
        <div>
          <div className="mb-1 flex justify-between text-[11px] text-slate-400">
            <span>Packets generated</span>
            <span className="font-mono">
              {sent} / {config.packetCount}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-ink-700">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      <div>
        <span className="field-label">Simulation speed</span>
        <div className="grid grid-cols-4 gap-1">
          {(Object.keys(SPEEDS) as SpeedKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setSpeed(k)}
              className={`rounded-md border px-1 py-1 text-xs font-semibold transition-colors ${speed === k ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-200' : 'border-ink-600 bg-ink-850 text-slate-400 hover:text-slate-200'}`}
              title={`${SPEEDS[k].simMsPerSecond} simulated ms per real second`}
            >
              {SPEEDS[k].label}
            </button>
          ))}
        </div>
      </div>

      <RoutingModeSelector disabled={locked} />

      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className="field-label">Source</span>
          <select className="input" value={config.source} disabled={locked} onChange={(e) => updateConfig({ source: e.target.value })}>
            {ids.map((id) => (
              <option key={id} value={id} disabled={id === config.destination}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">Destination</span>
          <select className="input" value={config.destination} disabled={locked} onChange={(e) => updateConfig({ destination: e.target.value })}>
            {ids.map((id) => (
              <option key={id} value={id} disabled={id === config.source}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">Packets</span>
          <select className="input" value={config.packetCount} disabled={locked} onChange={(e) => updateConfig({ packetCount: Number(e.target.value) })}>
            {PACKET_COUNT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">Rate (pkt/s)</span>
          <select
            className="input"
            value={config.packetRatePps}
            disabled={locked}
            onChange={(e) => updateConfig({ packetRatePps: Number(e.target.value) })}
            title="Packets injected at the source per simulated second"
          >
            {[100, 200, 400, 800, 1500].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {(mode === 'multipath' || mode === 'compare') && (
        <div>
          <span className="field-label">Multipath distribution</span>
          <div className="grid grid-cols-2 gap-1">
            {DISTRIBUTIONS.map(([id, label, tip]) => (
              <Tooltip key={id} content={tip} width="w-60">
                <button
                  disabled={locked}
                  onClick={() => updateConfig({ distribution: id })}
                  className={`w-full rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                    config.distribution === id ? 'border-purple-400/50 bg-purple-500/15 text-purple-200' : 'border-ink-600 bg-ink-850 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              </Tooltip>
            ))}
          </div>
        </div>
      )}

      {locked && (
        <p className="text-[11px] leading-snug text-slate-500">
          Configuration is locked during a run. Reset the simulation to change mode, endpoints or packet settings. Speed can be changed at any time.
        </p>
      )}
    </div>
  );
}
