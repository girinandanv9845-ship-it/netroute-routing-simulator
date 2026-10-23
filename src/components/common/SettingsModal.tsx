import { Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DEFAULT_CONFIG } from '../../engine/config';
import { useSim } from '../../store/simulationStore';
import type { PathDiscovery, SimConfig } from '../../types/simulation';
import { Modal } from './Modal';

type NumKey = 'payloadBytes' | 'convergenceDelayMs' | 'bufferPackets' | 'maxPaths' | 'seed' | 'packetRatePps';

const FIELDS: { key: NumKey; label: string; help: string; min: number; max: number; step: number }[] = [
  { key: 'payloadBytes', label: 'Packet payload (bytes)', help: 'Used for transmission delay and throughput (bits = bytes × 8).', min: 64, max: 9000, step: 1 },
  { key: 'packetRatePps', label: 'Injection rate (packets/s)', help: 'Packets created at the source per simulated second.', min: 10, max: 5000, step: 10 },
  { key: 'convergenceDelayMs', label: 'Convergence delay (ms)', help: 'Failure detection + route recomputation time. During it, routers still use stale routes.', min: 0, max: 500, step: 1 },
  { key: 'bufferPackets', label: 'Output buffer (packets)', help: 'Per directed link queue capacity; a full queue drops arriving packets.', min: 1, max: 1000, step: 1 },
  { key: 'maxPaths', label: 'Max multipath candidates (k)', help: 'Number of loop-free paths multipath routing tries to discover.', min: 1, max: 5, step: 1 },
  { key: 'seed', label: 'Random seed', help: 'Seeds the deterministic PRNG used for congestion-induced loss. Same seed ⇒ same results.', min: 0, max: 2 ** 31, step: 1 },
];

export function SettingsModal() {
  const open = useSim((s) => s.panels.settings);
  const config = useSim((s) => s.config);
  const status = useSim((s) => s.status);
  const { togglePanel, updateConfig } = useSim.getState();
  const [draft, setDraft] = useState<SimConfig>(config);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setDraft(config);
      setError(null);
    }
  }, [open, config]);
  const locked = status !== 'ready';

  const save = () => {
    for (const f of FIELDS) {
      const v = draft[f.key];
      if (!Number.isFinite(v) || v < f.min || v > f.max) return setError(`${f.label} must be between ${f.min} and ${f.max}.`);
    }
    updateConfig({ ...draft, maxPaths: Math.round(draft.maxPaths), bufferPackets: Math.round(draft.bufferPackets), seed: Math.round(draft.seed) });
    togglePanel('settings', false);
  };

  return (
    <Modal open={open} onClose={() => togglePanel('settings', false)} title="Simulation settings" icon={<Settings className="h-4 w-4 text-cyan-400" />}>
      {locked && <div className="mb-3 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">A simulation exists. Reset it to change these parameters.</div>}
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key}>
            <span className="field-label">{f.label}</span>
            <input
              type="number"
              className="input font-mono"
              min={f.min}
              max={f.max}
              step={f.step}
              disabled={locked}
              value={draft[f.key]}
              onChange={(e) => setDraft({ ...draft, [f.key]: Number(e.target.value) })}
            />
            <span className="mt-1 block text-[11px] leading-snug text-slate-500">{f.help}</span>
          </label>
        ))}
        <label>
          <span className="field-label">Multipath path discovery</span>
          <select className="input" disabled={locked} value={draft.pathDiscovery} onChange={(e) => setDraft({ ...draft, pathDiscovery: e.target.value as PathDiscovery })}>
            <option value="edge_disjoint">Edge-disjoint (repeated Dijkstra with link exclusion)</option>
            <option value="k_shortest">Yen's k-shortest loop-free paths</option>
          </select>
          <span className="mt-1 block text-[11px] leading-snug text-slate-500">Edge-disjoint paths survive any single link failure; Yen's paths are cheaper but may share links. Paths costing more than 3× the best are discarded.</span>
        </label>
      </div>
      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      <div className="mt-5 flex justify-between gap-2">
        <button className="btn-ghost" disabled={locked} onClick={() => setDraft({ ...DEFAULT_CONFIG, source: draft.source, destination: draft.destination })}>
          Restore defaults
        </button>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => togglePanel('settings', false)}>
            Cancel
          </button>
          <button className="btn-primary" disabled={locked} onClick={save}>
            Save settings
          </button>
        </div>
      </div>
    </Modal>
  );
}
