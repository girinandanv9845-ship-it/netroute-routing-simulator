import { AlertOctagon, ArrowRight, Lightbulb, Shuffle } from 'lucide-react';
import { estimatePathDelayMs, formatPath } from '../../engine/graph';
import { useCanvasEngine, useSim } from '../../store/simulationStore';
import type { Path } from '../../types/network';
import type { RerouteRecord } from '../../types/simulation';
import { ALGO_SHORT, pathColor } from '../common/theme';

function RouteChips({ nodes, color }: { nodes: string[]; color: string }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5">
      {nodes.map((n, i) => (
        <span key={i} className="flex items-center gap-0.5">
          <span className="rounded border px-1 py-[1px] font-mono text-[11px]" style={{ borderColor: `${color}66`, color }}>
            {n}
          </span>
          {i < nodes.length - 1 && <ArrowRight className="h-3 w-3 text-slate-600" />}
        </span>
      ))}
    </div>
  );
}

/** Builds the educational explanation from an actual reroute record. */
export function explainReroute(r: RerouteRecord, multipath: boolean, source: string, destination: string): string {
  const fmt = (p: Path[]) => p.map((x) => `${formatPath(x.nodes)} (cost ${x.cost.toFixed(1)})`).join('; ');
  if (r.newPaths.length === 0) {
    return `${r.reason}. The routing engine recalculated paths over the remaining topology and found no operational path from ${source} to ${destination}: the destination is unreachable, so new packets are dropped instead of being sent through failed components.`;
  }
  if (!r.changed) {
    return `${r.reason}. The routing engine recalculated routes; the ${multipath ? 'candidate path set' : 'best route'} did not change (${fmt(r.newPaths)}), because ${multipath ? 'all candidates' : 'it'} still ${multipath ? 'avoid' : 'avoids'} the affected component and remain${multipath ? '' : 's'} cheapest.`;
  }
  if (!multipath) {
    const prev = r.previousPaths[0];
    const next = r.newPaths[0];
    return `${r.reason}. ${prev ? `The previous route ${formatPath(prev.nodes)} (cost ${prev.cost.toFixed(1)}) is no longer the best valid route.` : 'There was previously no route.'} Dijkstra recalculated the minimum-cost path and selected ${formatPath(next.nodes)}. New route cost: ${next.cost.toFixed(1)}. ${r.affectedPackets} in-flight packet(s) were affected.`;
  }
  return `${r.reason}. Candidate paths were rediscovered: ${r.previousPaths.length} → ${r.newPaths.length} path(s). New set: ${fmt(r.newPaths)}. New packets are distributed only over valid candidates; ${r.affectedPackets} in-flight packet(s) were affected and are rerouted at their current router when possible.`;
}

export function PathDetails() {
  const engine = useCanvasEngine();
  const status = useSim((s) => s.status);
  const preview = useSim((s) => s.previewPaths);
  const config = useSim((s) => s.config);
  const mode = useSim((s) => s.mode);
  const network = useSim((s) => s.network);
  const started = status !== 'ready' && !!engine;
  const multipath = started ? engine!.algorithm === 'multipath' : mode === 'multipath';
  const color = (i: number) => (multipath ? pathColor(i) : '#22d3ee');

  const lastReroute = started ? engine!.reroutes[engine!.reroutes.length - 1] : undefined;
  const totalAssigned = started ? engine!.pathStats.reduce((s, p) => s + p.assigned, 0) : 0;

  return (
    <div className="flex flex-col gap-3">
      {!started ? (
        <>
          <div className="text-xs text-slate-400">
            Planned {multipath ? `candidate paths (max ${config.maxPaths}, ${config.pathDiscovery === 'edge_disjoint' ? 'edge-disjoint' : "Yen's k-shortest"})` : 'route (Dijkstra)'} for {config.source} → {config.destination}
          </div>
          {preview.length === 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              <AlertOctagon className="h-4 w-4" /> Destination unreachable — no operational path.
            </div>
          )}
          {preview.map((p, i) => (
            <div key={i} className="rounded-lg border border-ink-600 bg-ink-850 p-2.5">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-semibold" style={{ color: color(i) }}>
                  {multipath ? `Path P${i + 1}` : 'Best route'}
                </span>
                <span className="font-mono text-slate-400">
                  cost {p.cost.toFixed(1)} · {p.nodes.length - 1} hops · ~{estimatePathDelayMs(network, p.nodes, config.payloadBytes).toFixed(1)} ms
                </span>
              </div>
              <RouteChips nodes={p.nodes} color={color(i)} />
            </div>
          ))}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>
              {ALGO_SHORT[engine!.algorithm]} · {engine!.currentPaths.length} active {multipath ? 'path(s)' : 'route'}
            </span>
            {multipath && <span>{config.distribution === 'round_robin' ? 'Round-robin' : 'Load-aware'} distribution</span>}
          </div>
          {engine!.currentPaths.length === 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              <AlertOctagon className="h-4 w-4 shrink-0" /> Destination {config.destination} unreachable — new packets are dropped (reason: no route).
            </div>
          )}
          {engine!.pathStats.map((s) => {
            const idx = multipath ? s.index : 0;
            const share = totalAssigned ? (s.assigned / totalAssigned) * 100 : 0;
            return (
              <div key={s.key} className={`rounded-lg border p-2.5 ${s.active ? 'border-ink-600 bg-ink-850' : 'border-ink-700 bg-ink-900 opacity-60'}`}>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="font-semibold" style={{ color: s.active ? color(idx) : '#64748b' }}>
                    {s.active ? (multipath ? `P${s.index + 1}` : 'Current route') : multipath ? 'Former path' : 'Previous route'}
                    {!s.active && <span className="ml-1.5 font-normal text-slate-500">(no longer a candidate)</span>}
                  </span>
                  <span className="font-mono text-slate-400">
                    cost {s.cost.toFixed(1)} · {s.hops} hops · ~{s.estDelayMs.toFixed(1)} ms
                  </span>
                </div>
                <RouteChips nodes={s.nodes} color={s.active ? color(idx) : '#64748b'} />
                <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[10px]">
                  <div>
                    <div className="font-mono text-sm text-slate-200">{s.assigned}</div>
                    <div className="text-slate-500">assigned</div>
                  </div>
                  <div>
                    <div className="font-mono text-sm text-emerald-300">{s.delivered}</div>
                    <div className="text-slate-500">delivered</div>
                  </div>
                  <div>
                    <div className="font-mono text-sm text-red-300">{s.dropped}</div>
                    <div className="text-slate-500">dropped</div>
                  </div>
                  <div>
                    <div className="font-mono text-sm text-slate-200">{share.toFixed(0)}%</div>
                    <div className="text-slate-500">share</div>
                  </div>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink-700">
                  <div className="h-full rounded-full" style={{ width: `${share}%`, background: s.active ? color(idx) : '#475569' }} />
                </div>
              </div>
            );
          })}
          {multipath && (
            <div className="flex items-start gap-2 rounded-lg border border-purple-400/30 bg-purple-500/5 px-3 py-2 text-[11px] leading-relaxed text-slate-300">
              <Shuffle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-purple-300" />
              <span>
                Paths have different delays, so packets can arrive out of order. Out-of-order deliveries so far:{' '}
                <span className="font-mono font-semibold text-purple-200">{engine!.metrics.reorderedPackets}</span>.
              </span>
            </div>
          )}
        </>
      )}

      <div className="rounded-lg border border-cyan-400/30 bg-cyan-500/5 p-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-cyan-300">
          <Lightbulb className="h-3.5 w-3.5" /> Routing decision
        </div>
        {lastReroute ? (
          <div className="space-y-2 text-xs leading-relaxed text-slate-300">
            <p>{explainReroute(lastReroute, multipath, config.source, config.destination)}</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded border border-ink-600 bg-ink-900/60 p-2 font-mono text-[11px]">
              <span className="text-slate-500">At t</span>
              <span>{lastReroute.time.toFixed(1)} ms</span>
              <span className="text-slate-500">Cost before → after</span>
              <span>
                {lastReroute.previousCost?.toFixed(1) ?? '∞'} → {lastReroute.newCost?.toFixed(1) ?? '∞'}
              </span>
              <span className="text-slate-500">Affected packets</span>
              <span>{lastReroute.affectedPackets}</span>
              <span className="text-slate-500">Recovery time</span>
              <span>
                {(() => {
                  const rec = [...engine!.recoveries].reverse().find((r) => r.time <= lastReroute.time);
                  if (!rec) return 'n/a (not a failure)';
                  return rec.recoveryMs === null ? 'pending / not recovered' : `${rec.recoveryMs.toFixed(1)} ms`;
                })()}
              </span>
            </div>
          </div>
        ) : started ? (
          <p className="text-xs leading-relaxed text-slate-300">
            Initial computation: {multipath ? 'repeated Dijkstra searches discovered' : 'Dijkstra selected'}{' '}
            {engine!.currentPaths.length ? engine!.currentPaths.map((p) => formatPath(p.nodes)).join(' | ') : 'no path (destination unreachable)'}. No topology change has occurred yet — inject a failure or congestion to see the
            routing engine adapt.
          </p>
        ) : (
          <p className="text-xs leading-relaxed text-slate-300">
            {preview.length
              ? `Before the run, the routing engine computes ${multipath ? `${preview.length} candidate path(s)` : `the minimum-cost route ${formatPath(preview[0].nodes)} (cost ${preview[0].cost.toFixed(1)})`} using effective link costs. Press Start to send packets.`
              : `No route exists between ${config.source} and ${config.destination} in the current topology.`}
          </p>
        )}
      </div>
    </div>
  );
}
