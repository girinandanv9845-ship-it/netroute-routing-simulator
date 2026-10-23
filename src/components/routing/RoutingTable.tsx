import { useMemo } from 'react';
import { computeRoutingTable } from '../../engine/adaptiveRouting';
import { formatPath } from '../../engine/graph';
import { useCanvasEngine, useSim } from '../../store/simulationStore';

/**
 * Routing table of the selected router (or the source), computed by Dijkstra over the
 * routing engine's current link-state view. During reconvergence this view can lag the
 * physical network by the configured detection delay.
 */
export function RoutingTable() {
  const network = useSim((s) => s.network);
  const selection = useSim((s) => s.selection);
  const config = useSim((s) => s.config);
  const select = useSim((s) => s.select);
  const engine = useCanvasEngine();
  const view = engine?.controlNetwork ?? network;
  const routerId = selection?.type === 'router' ? selection.id : config.source;
  const router = network.routers.find((r) => r.id === routerId);
  const table = useMemo(() => (router ? computeRoutingTable(view, routerId) : []), [view, routerId, router]);

  if (!router) return <p className="py-6 text-center text-sm text-slate-500">Router no longer exists.</p>;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs">
        <div>
          <span className="text-slate-400">Routing table of </span>
          <select className="input inline-block w-auto px-2 py-0.5 font-mono text-xs" value={routerId} onChange={(e) => select({ type: 'router', id: e.target.value })}>
            {network.routers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id}
              </option>
            ))}
          </select>
        </div>
        {router.status === 'failed' && <span className="chip border-red-400/40 text-red-300">router failed</span>}
        {engine?.converging && <span className="chip border-amber-400/40 text-amber-300">reconverging…</span>}
      </div>
      <div className="overflow-hidden rounded-lg border border-ink-600/70">
        <table className="w-full text-xs">
          <thead className="bg-ink-800 text-left text-[10px] uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-2 py-1.5">Dest</th>
              <th className="px-2 py-1.5">Next hop</th>
              <th className="px-2 py-1.5 text-right">Cost</th>
              <th className="px-2 py-1.5 text-right">Hops</th>
              <th className="px-2 py-1.5">Valid</th>
            </tr>
          </thead>
          <tbody>
            {table.map((e) => (
              <tr
                key={e.destination}
                className={`border-t border-ink-700/60 ${e.destination === config.destination ? 'bg-emerald-500/10' : ''}`}
                title={e.path ? formatPath(e.path) : 'No path'}
              >
                <td className="px-2 py-1 font-mono text-slate-200">
                  {e.destination}
                  {e.destination === config.destination && <span className="ml-1 text-[9px] text-emerald-300">DST</span>}
                </td>
                <td className="px-2 py-1 font-mono text-cyan-300">{e.nextHop ?? '—'}</td>
                <td className="px-2 py-1 text-right font-mono text-slate-300">{e.cost === null ? '∞' : e.cost.toFixed(1)}</td>
                <td className="px-2 py-1 text-right font-mono text-slate-300">{e.hops ?? '—'}</td>
                <td className="px-2 py-1">{e.reachable ? <span className="text-emerald-400">✓</span> : <span className="text-red-400">unreachable</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(() => {
        const d = table.find((e) => e.destination === config.destination);
        if (!d || routerId === config.destination) return null;
        return (
          <div className={`rounded-lg border px-3 py-2 text-xs ${d.reachable ? 'border-ink-600 bg-ink-850 text-slate-300' : 'border-red-400/40 bg-red-500/10 text-red-200'}`}>
            {d.reachable ? (
              <>
                Path {routerId} → {config.destination}: <span className="font-mono text-cyan-200">{formatPath(d.path!)}</span> (cost {d.cost!.toFixed(1)}, {d.hops} hops)
              </>
            ) : (
              <>
                Destination {config.destination} is unreachable from {routerId}.
              </>
            )}
          </div>
        );
      })()}
      <p className="text-[10px] leading-snug text-slate-500">Computed with Dijkstra over the routing engine's link-state view using effective (congestion-aware) costs. Hover a row to see the full path.</p>
    </div>
  );
}
