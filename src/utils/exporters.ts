import { effectiveCost } from '../engine/graph';
import { getScenario } from '../engine/scenarios';
import type { SimulationRunner } from '../engine/simulationClock';
import type { Network } from '../types/network';
import type { ExperimentResult, LogEntry, SimConfig } from '../types/simulation';
import { toCsv } from './csvExport';

const r2 = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(d)));

export function resultsCsv(results: ExperimentResult[], config: SimConfig, scenarioName: string, failureEvents: { time: number; description: string }[]): string {
  const headers = [
    'scenario',
    'algorithm',
    'source',
    'destination',
    'packet_count',
    'payload_bytes',
    'packet_rate_pps',
    'convergence_delay_ms',
    'distribution',
    'path_discovery',
    'seed',
    'packets_sent',
    'packets_delivered',
    'packets_dropped',
    'delivery_ratio_pct',
    'loss_rate_pct',
    'avg_delay_ms',
    'min_delay_ms',
    'max_delay_ms',
    'delay_stddev_ms',
    'throughput_kbps',
    'measurement_ms',
    'recovery_time_ms',
    'recovery_state',
    'route_recalculations',
    'route_changes',
    'paths_used',
    'rerouted_packets',
    'reordered_packets',
    'avg_hops',
    'failure_events',
  ];
  const rows = results.map(({ algorithm, metrics: m }) => [
    scenarioName,
    algorithm,
    config.source,
    config.destination,
    config.packetCount,
    config.payloadBytes,
    config.packetRatePps,
    config.convergenceDelayMs,
    algorithm === 'multipath' ? config.distribution : '',
    algorithm === 'multipath' ? config.pathDiscovery : '',
    config.seed,
    m.sent,
    m.delivered,
    m.dropped,
    r2(m.pdr),
    r2(m.lossRate),
    r2(m.avgDelayMs),
    r2(m.minDelayMs),
    r2(m.maxDelayMs),
    r2(m.jitterMs),
    r2(m.throughputKbps),
    r2(m.measurementMs),
    r2(m.latestRecoveryMs),
    m.latestRecoveryState,
    m.routeRecalculations,
    m.routeChanges,
    m.pathsUsed,
    m.reroutedPackets,
    m.reorderedPackets,
    r2(m.avgHops),
    failureEvents.map((f) => `t=${f.time.toFixed(1)}ms ${f.description}`).join(' | '),
  ]);
  return toCsv(headers, rows);
}

export function packetsCsv(runner: SimulationRunner): string {
  const headers = ['algorithm', 'packet_id', 'seq', 'source', 'destination', 'status', 'created_ms', 'arrived_ms', 'delay_ms', 'dropped_ms', 'drop_reason', 'drop_location', 'hops', 'rerouted', 'assigned_path', 'final_route'];
  const rows = runner.engines.flatMap((e) =>
    e.packets.map((p) => [
      e.algorithm,
      p.id,
      p.seq + 1,
      p.source,
      p.destination,
      p.status,
      r2(p.createdAt),
      r2(p.arrivedAt),
      p.arrivedAt !== null ? r2(p.arrivedAt - p.createdAt) : null,
      r2(p.droppedAt),
      p.dropReason ?? '',
      p.status === 'dropped' ? p.location : '',
      p.hopsTaken,
      p.rerouted,
      p.assignedPath.join('>'),
      p.route.join('>'),
    ]),
  );
  return toCsv(headers, rows);
}

export function logCsv(entries: LogEntry[]): string {
  return toCsv(
    ['sim_time_ms', 'algorithm', 'category', 'event_type', 'subject', 'message'],
    entries.map((l) => [r2(l.time), l.algorithm, l.category, l.type, l.subject, l.message]),
  );
}

export function topologyJson(net: Network) {
  return {
    format: 'netroute-topology',
    version: 1,
    routers: net.routers.map((r) => ({ id: r.id, name: r.name, position: r.position, status: r.status })),
    links: net.links.map((l) => ({ ...l, effectiveCost: r2(effectiveCost(l)) })),
  };
}

export function summaryJson(runner: SimulationRunner, scenarioId: string | null, comparison: { title: string; results: ExperimentResult[]; config: SimConfig } | null) {
  return {
    generatedBy: 'NETROUTE – Adaptive Network Intelligence (educational simulation)',
    generatedAt: new Date().toISOString(),
    note: 'All values are produced by the discrete-event simulator; times are simulated milliseconds.',
    scenario: scenarioId ? getScenario(scenarioId)?.title ?? scenarioId : 'Manual',
    mode: runner.mode,
    status: runner.status,
    simulatedTimeMs: r2(runner.time),
    parameters: runner.config,
    models: {
      effectiveCost: 'baseCost × (1 + 4c)',
      availableBandwidth: 'B × (1 − c)',
      transmissionDelay: 'payloadBits / availableBandwidth',
      congestionQueueing: '4 ms × c / (1 − c)',
      congestionLoss: '0.3 × (c − 0.6) / 0.35 for c > 0.6',
      recoveryTime: 'time from failure to first delivery of a packet created at/after the failure',
      throughput: 'delivered payload bits / (completion time − first packet creation time)',
    },
    failureEvents: runner.appliedEvents,
    results: runner.engines.map((e) => ({
      algorithm: e.algorithm,
      metrics: e.getMetrics(),
      paths: e.getPathStats(),
      reroutes: e.reroutes.map((r) => ({ ...r, previousPaths: r.previousPaths.map((p) => p.nodes.join('>')), newPaths: r.newPaths.map((p) => p.nodes.join('>')) })),
      recoveries: e.recoveries,
    })),
    comparison: comparison
      ? {
          title: comparison.title,
          parameters: comparison.config,
          results: comparison.results.map((r) => ({ algorithm: r.algorithm, metrics: r.metrics, paths: r.paths, recoveries: r.recoveries })),
        }
      : null,
    topology: topologyJson(runner.network),
  };
}

/** Validate an imported topology file; returns an error message or the network. */
export function parseTopology(text: string): Network | string {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return 'File is not valid JSON.';
  }
  const d = data as { routers?: unknown; links?: unknown; topology?: { routers?: unknown; links?: unknown } };
  const src = Array.isArray(d.routers) ? d : d.topology;
  if (!src || !Array.isArray(src.routers) || !Array.isArray(src.links)) return 'Expected "routers" and "links" arrays.';
  const routers: Network['routers'] = [];
  const ids = new Set<string>();
  for (const r of src.routers as Record<string, unknown>[]) {
    if (typeof r.id !== 'string' || ids.has(r.id)) return `Invalid or duplicate router id: ${String(r.id)}`;
    const pos = r.position as { x?: number; y?: number } | undefined;
    ids.add(r.id);
    routers.push({ id: r.id, name: typeof r.name === 'string' ? r.name : r.id, position: { x: Number(pos?.x) || 0, y: Number(pos?.y) || 0 }, status: r.status === 'failed' ? 'failed' : 'online' });
  }
  const links: Network['links'] = [];
  const pairs = new Set<string>();
  for (const l of src.links as Record<string, unknown>[]) {
    const s = String(l.source);
    const t = String(l.target);
    if (!ids.has(s) || !ids.has(t)) return `Link ${String(l.id)} references an unknown router.`;
    if (s === t) return `Link ${String(l.id)} is a self-loop.`;
    const key = [s, t].sort().join('|');
    if (pairs.has(key)) return `Duplicate link between ${s} and ${t}.`;
    pairs.add(key);
    const cost = Number(l.baseCost);
    const bw = Number(l.bandwidthMbps);
    const delay = Number(l.delayMs);
    if (!(cost > 0) || !(bw > 0) || !(delay > 0)) return `Link ${s}–${t} must have positive cost, bandwidth and delay.`;
    links.push({ id: `${s}-${t}`, source: s, target: t, baseCost: cost, bandwidthMbps: bw, delayMs: delay, status: l.status === 'failed' ? 'failed' : 'active', congestion: Math.min(0.95, Math.max(0, Number(l.congestion) || 0)) });
  }
  if (routers.length < 2) return 'A topology needs at least two routers.';
  return { routers, links };
}
