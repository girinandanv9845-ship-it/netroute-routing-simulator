import type { Network, Path } from './network';
import type { DropReason } from './packet';

export type Algorithm = 'adaptive' | 'multipath';
export type RoutingMode = 'adaptive' | 'multipath' | 'compare';
export type Distribution = 'round_robin' | 'load_aware';
export type PathDiscovery = 'edge_disjoint' | 'k_shortest';
export type SimStatus = 'ready' | 'running' | 'paused' | 'completed';
export type SpeedKey = 'slow' | 'normal' | 'fast' | 'turbo';

export const SPEEDS: Record<SpeedKey, { label: string; simMsPerSecond: number }> = {
  slow: { label: 'Slow', simMsPerSecond: 8 },
  normal: { label: 'Normal', simMsPerSecond: 20 },
  fast: { label: 'Fast', simMsPerSecond: 50 },
  turbo: { label: 'Turbo', simMsPerSecond: 140 },
};

export interface SimConfig {
  source: string;
  destination: string;
  packetCount: number;
  /** Packet payload size in bytes. */
  payloadBytes: number;
  /** Packets injected per simulated second at the source. */
  packetRatePps: number;
  /** Failure detection + routing convergence delay (simulated ms). */
  convergenceDelayMs: number;
  /** Output queue capacity per directed link, in packets. */
  bufferPackets: number;
  maxPaths: number;
  pathDiscovery: PathDiscovery;
  distribution: Distribution;
  /** Seed for the deterministic PRNG (congestion loss). */
  seed: number;
}

export type LogCategory = 'system' | 'packet' | 'hop' | 'routing' | 'fault' | 'recovery';

export type LogType =
  | 'sim_started'
  | 'sim_paused'
  | 'sim_resumed'
  | 'sim_stopped'
  | 'sim_completed'
  | 'packet_created'
  | 'packet_hop'
  | 'packet_delivered'
  | 'packet_dropped'
  | 'packet_rerouted'
  | 'route_calculated'
  | 'route_recalculated'
  | 'route_unreachable'
  | 'service_restored'
  | 'link_failed'
  | 'link_restored'
  | 'router_failed'
  | 'router_restored'
  | 'congestion_changed'
  | 'topology_changed'
  | 'scenario';

export interface LogEntry {
  id: number;
  time: number;
  type: LogType;
  category: LogCategory;
  algorithm: Algorithm | 'system';
  subject: string;
  message: string;
}

/** A topology change that the routing control plane must react to. */
export interface TopologyEvent {
  kind:
    | 'link_failed'
    | 'link_restored'
    | 'router_failed'
    | 'router_restored'
    | 'congestion_changed'
    | 'link_added'
    | 'link_removed'
    | 'router_added'
    | 'router_removed'
    | 'link_edited';
  subject: string;
  description: string;
  /** True when the event removes forwarding capacity (used for recovery measurement). */
  isFailure: boolean;
  /** Links that became unusable for forwarding as a consequence of this event. */
  downLinks: string[];
  /** Routers that became unusable. */
  downRouters: string[];
}

export interface RerouteRecord {
  id: number;
  algorithm: Algorithm;
  time: number;
  reason: string;
  previousPaths: Path[];
  newPaths: Path[];
  previousCost: number | null;
  newCost: number | null;
  affectedPackets: number;
  changed: boolean;
}

export interface RecoveryRecord {
  id: number;
  algorithm: Algorithm;
  event: string;
  time: number;
  /** Did the failure touch a path in use or a packet in flight? */
  impactedTraffic: boolean;
  packetsLost: number;
  recoveredAt: number | null;
  recoveryMs: number | null;
}

export interface SeriesPoint {
  t: number;
  sent: number;
  delivered: number;
  dropped: number;
  inFlight: number;
  /** Throughput over the trailing window, kbit/s. */
  throughputKbps: number;
  /** Mean delay of packets delivered within the trailing window, ms (null if none). */
  windowDelayMs: number | null;
  pdr: number | null;
}

export interface PathStat {
  key: string;
  index: number;
  nodes: string[];
  cost: number;
  hops: number;
  estDelayMs: number;
  assigned: number;
  delivered: number;
  dropped: number;
  active: boolean;
}

export interface LinkStat {
  linkId: string;
  packets: number;
  /** Seconds of transmission time accumulated (for utilisation). */
  busyMs: number;
  queued: number;
}

export interface Metrics {
  algorithm: Algorithm;
  simTime: number;
  sent: number;
  delivered: number;
  dropped: number;
  inFlight: number;
  /** % or null when sent = 0 */
  pdr: number | null;
  lossRate: number | null;
  avgDelayMs: number | null;
  minDelayMs: number | null;
  maxDelayMs: number | null;
  jitterMs: number | null;
  throughputKbps: number | null;
  measurementMs: number;
  avgHops: number | null;
  reroutedPackets: number;
  routeRecalculations: number;
  routeChanges: number;
  reorderedPackets: number;
  pathsUsed: number;
  dropsByReason: Partial<Record<DropReason, number>>;
  latestRecoveryMs: number | null;
  latestRecoveryState: 'none' | 'pending' | 'recovered' | 'not_recovered';
}

export interface ScheduledAction {
  /** Simulated time in ms at which the action fires. */
  at: number;
  action: TopologyAction;
}

export type TopologyAction =
  | { type: 'fail_link'; linkId: string }
  | { type: 'restore_link'; linkId: string }
  | { type: 'fail_router'; routerId: string }
  | { type: 'restore_router'; routerId: string }
  | { type: 'set_congestion'; linkId: string; level: number };

export interface Scenario {
  id: string;
  title: string;
  description: string;
  startingConditions: string;
  trigger: string;
  expected: string;
  recommendedMode: RoutingMode;
  /** Prepares the network and config before start (deterministic). */
  setup: (base: Network) => { network: Network; config?: Partial<SimConfig> };
  script: ScheduledAction[];
}

export interface ExperimentResult {
  algorithm: Algorithm;
  metrics: Metrics;
  series: SeriesPoint[];
  paths: PathStat[];
  recoveries: RecoveryRecord[];
  reroutes: RerouteRecord[];
}
