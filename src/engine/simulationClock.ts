import type { Network } from '../types/network';
import type {
  Algorithm,
  ExperimentResult,
  LogCategory,
  LogType,
  RoutingMode,
  ScheduledAction,
  SimConfig,
  SimStatus,
  TopologyAction,
} from '../types/simulation';
import { cloneNetwork } from './graph';
import { PacketEngine } from './packetEngine';
import { applyAction, type MutationResult } from './topology';

export const algorithmsFor = (mode: RoutingMode): Algorithm[] =>
  mode === 'compare' ? ['adaptive', 'multipath'] : [mode];

/**
 * Central simulation clock. Owns the authoritative network, one isolated PacketEngine per
 * algorithm, and the scripted scenario actions. Simulated time only advances through
 * `advance`/`step`, so pausing freezes the simulation exactly.
 *
 * In compare mode every engine receives a deep copy of the same starting network and the
 * same configuration and seed; each topology change is applied to all engines at the same
 * simulated instant, so both algorithms face identical conditions without sharing state.
 */
export class SimulationRunner {
  network: Network;
  status: SimStatus = 'ready';
  time = 0;
  engines: PacketEngine[] = [];
  config: SimConfig;
  mode: RoutingMode;
  script: ScheduledAction[] = [];
  private scriptIdx = 0;
  /** Network at the moment the run started (restored by reset). */
  private startSnapshot: Network | null = null;
  /** Failures/recoveries applied during this run (exported with results). */
  appliedEvents: { time: number; description: string }[] = [];
  /** Bumped when the network object changes so the UI can resync. */
  networkVersion = 0;

  constructor(network: Network, config: SimConfig, mode: RoutingMode) {
    this.network = network;
    this.config = config;
    this.mode = mode;
  }

  get started() {
    return this.engines.length > 0;
  }

  setScript(script: ScheduledAction[]) {
    this.script = [...script].sort((a, b) => a.at - b.at);
    this.scriptIdx = 0;
  }

  start(): string | null {
    const { source, destination } = this.config;
    if (source === destination) return 'Source and destination must be different routers.';
    if (!this.network.routers.some((r) => r.id === source)) return `Source router ${source} does not exist.`;
    if (!this.network.routers.some((r) => r.id === destination)) return `Destination router ${destination} does not exist.`;
    this.startSnapshot = this.network;
    this.time = 0;
    this.scriptIdx = 0;
    this.appliedEvents = [];
    this.engines = algorithmsFor(this.mode).map((a) => new PacketEngine(a, cloneNetwork(this.network), { ...this.config }));
    this.engines.forEach((e) =>
      e.logExternal('sim_started', 'system', source, `Simulation started: ${this.config.packetCount} packets ${source} → ${destination} at ${this.config.packetRatePps} pkt/s using ${e.algorithm === 'adaptive' ? 'adaptive single-path' : 'multipath'} routing.`),
    );
    this.status = 'running';
    return null;
  }

  pause() {
    if (this.status === 'running') {
      this.status = 'paused';
      this.engines.forEach((e) => e.logExternal('sim_paused', 'system', '-', 'Simulation paused.'));
    }
  }

  resume() {
    if (this.status === 'paused') {
      this.status = 'running';
      this.engines.forEach((e) => e.logExternal('sim_resumed', 'system', '-', 'Simulation resumed.'));
    }
  }

  /** Stop generating packets; in-flight packets are allowed to finish (drain policy). */
  stop() {
    if (!this.started) return;
    this.engines.forEach((e) => e.stopGeneration());
    if (this.status === 'paused') this.status = 'running';
  }

  /** Advance simulated time while running. */
  advance(dtMs: number) {
    if (this.status !== 'running') return;
    this.advanceBy(dtMs);
  }

  /** Single step while paused (or ready -> starts nothing). */
  step(dtMs: number) {
    if (this.status !== 'paused') return;
    this.advanceBy(dtMs);
  }

  private advanceBy(dtMs: number) {
    const target = this.time + dtMs;
    while (this.scriptIdx < this.script.length && this.script[this.scriptIdx].at <= target) {
      const { at, action } = this.script[this.scriptIdx++];
      this.engines.forEach((e) => e.advanceTo(at));
      this.time = Math.max(this.time, at);
      this.applyAction(action, 'scenario');
    }
    this.engines.forEach((e) => e.advanceTo(target));
    this.time = target;
    if (this.engines.length && this.engines.every((e) => e.isComplete) && this.scriptIdx >= this.script.length) {
      this.status = 'completed';
    }
  }

  /** Apply a failure / recovery / congestion action now. */
  applyAction(action: TopologyAction, origin: 'user' | 'scenario' = 'user'): string | null {
    return this.applyMutation(applyAction(this.network, action), origin);
  }

  /** Apply any topology mutation (add/remove/edit) and notify the routing engines. */
  applyMutation(result: MutationResult, origin: 'user' | 'scenario' = 'user'): string | null {
    if (result.error) return result.error;
    this.network = result.network;
    this.networkVersion++;
    const ev = result.event;
    if (ev && this.started) {
      this.appliedEvents.push({ time: this.time, description: ev.description });
      const [type, category] = logTypeFor(ev.kind);
      this.engines.forEach((e) => {
        e.logExternal(type, category, ev.subject, `${origin === 'scenario' ? '[Scenario] ' : ''}${ev.description}.${ev.downLinks.length && ev.kind === 'router_failed' ? ` Attached links unusable: ${ev.downLinks.join(', ')}.` : ''} Routing will reconverge in ${this.config.convergenceDelayMs} ms.`);
        e.onTopologyChange(cloneNetwork(this.network), ev);
      });
    }
    return null;
  }

  /** Position-only change (dragging): no routing impact, engines are not notified. */
  setNetworkSilently(network: Network) {
    this.network = network;
    this.networkVersion++;
  }

  /** Clear packets, metrics and timers; restore the network that existed when Start was pressed. */
  reset() {
    if (this.startSnapshot) this.network = this.startSnapshot;
    this.startSnapshot = null;
    this.engines = [];
    this.time = 0;
    this.scriptIdx = 0;
    this.appliedEvents = [];
    this.status = 'ready';
    this.networkVersion++;
  }

  /** Run headless until every engine finishes (used for experiments and tests). */
  runToCompletion(maxSimMs = 120_000, chunkMs = 25): void {
    if (!this.started) {
      const e = this.start();
      if (e) throw new Error(e);
    }
    while (this.status !== 'completed' && this.time < maxSimMs) this.advanceBy(chunkMs);
    if (this.status !== 'completed') {
      this.engines.forEach((e) => e.stopGeneration());
      this.status = 'completed';
    }
  }

  results(): ExperimentResult[] {
    return this.engines.map((e) => ({
      algorithm: e.algorithm,
      metrics: e.getMetrics(),
      series: e.series,
      paths: e.getPathStats(),
      recoveries: e.recoveries,
      reroutes: e.reroutes,
    }));
  }
}

function logTypeFor(kind: string): [LogType, LogCategory] {
  switch (kind) {
    case 'link_failed':
      return ['link_failed', 'fault'];
    case 'router_failed':
      return ['router_failed', 'fault'];
    case 'link_restored':
      return ['link_restored', 'recovery'];
    case 'router_restored':
      return ['router_restored', 'recovery'];
    case 'congestion_changed':
      return ['congestion_changed', 'fault'];
    default:
      return ['topology_changed', 'system'];
  }
}

/**
 * Run both algorithms headlessly on isolated copies of the same baseline network,
 * configuration, seed and scripted events.
 */
export function runComparison(network: Network, config: SimConfig, script: ScheduledAction[]): ExperimentResult[] {
  return (['adaptive', 'multipath'] as Algorithm[]).flatMap((alg) => {
    const runner = new SimulationRunner(cloneNetwork(network), { ...config }, alg);
    runner.setScript(script);
    runner.runToCompletion();
    return runner.results();
  });
}
