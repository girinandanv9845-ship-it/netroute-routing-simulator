import type { Link, Network, Path } from '../types/network';
import type { DropReason, Packet } from '../types/packet';
import { DROP_REASON_LABEL } from '../types/packet';
import type {
  Algorithm,
  LinkStat,
  LogCategory,
  LogEntry,
  LogType,
  Metrics,
  PathStat,
  RecoveryRecord,
  RerouteRecord,
  SeriesPoint,
  SimConfig,
  TopologyEvent,
} from '../types/simulation';
import { computeAdaptiveRoute, sameRoute } from './adaptiveRouting';
import { dijkstra } from './dijkstra';
import { EventQueue, mulberry32 } from './eventQueue';
import {
  CONGESTED_THRESHOLD,
  congestionLossProbability,
  estimatePathDelayMs,
  formatPath,
  hopDelayMs,
  isLinkUsable,
  isRouteUsable,
  pathKey,
  queueingDelayMs,
  routerMap,
  transmissionDelayMs,
} from './graph';
import { averageDelay, delayStdDev, deliveryRatio, lossRate, throughputKbps } from './metrics';
import { SmoothWeightedRoundRobin, discoverPaths } from './multipath';

/*
 * Discrete-event packet simulator. One engine simulates one routing algorithm.
 *
 * Data plane vs control plane
 *   `physical` is the real topology: packets can only cross links that are usable right now.
 *   `control` is the routing engine's link-state view. After any topology change the control
 *   plane converges `convergenceDelayMs` later (failure detection + route recomputation).
 *
 * In-flight packet policy
 *   - A packet on a link that fails (or whose endpoint router fails) is lost immediately.
 *   - A packet held by a router that fails is lost.
 *   - At every router, if routes were recomputed since the packet's route was chosen, the
 *     packet is re-evaluated: adaptive packets follow the new shortest path from the current
 *     router; multipath packets keep their path while it is still usable, otherwise they are
 *     moved to the shortest valid continuation. Continuations never revisit a router.
 *   - Before convergence, a packet whose next link is physically down is dropped
 *     ("next-hop down") because the router has no alternative in its tables yet.
 *   - Stop: no new packets are generated; packets already in flight are allowed to finish.
 */

type SimEvent =
  | { kind: 'generate' }
  | { kind: 'depart'; packet: Packet; token: number; queueKey: string; tx: number }
  | { kind: 'arrive'; packet: Packet; token: number }
  | { kind: 'converge'; network: Network; reasons: string[]; affected: number };

interface QueueState {
  busyUntil: number;
  queued: number;
}

const LOG_CAP = 4000;
const SAMPLE_EVERY_MS = 10;
const THROUGHPUT_WINDOW_MS = 50;
/** How long (simulated ms) finished packets remain visible for the delivery/drop animation. */
export const FADE_DELIVERED_MS = 6;
export const FADE_DROPPED_MS = 14;

let logSeq = 0;

export class PacketEngine {
  readonly algorithm: Algorithm;
  readonly config: SimConfig;
  time = 0;
  physical: Network;
  control: Network;
  controlRev = 0;

  packets: Packet[] = [];
  private active = new Set<Packet>();
  private recentDone: Packet[] = [];
  private queue = new EventQueue<SimEvent>();
  private rng: () => number;
  private generated = 0;
  private generationStopped = false;
  private interval: number;
  private linkIndex = new Map<string, Link>();
  private routers = new Map<string, Network['routers'][number]>();
  private queues = new Map<string, QueueState>();

  // Routing state
  adaptivePath: Path | null = null;
  candidatePaths: Path[] = [];
  private pathStats = new Map<string, PathStat>();
  private pathOrder = 0;
  private rr = 0;
  private swrr = new SmoothWeightedRoundRobin();

  // Measurements
  private delivered = 0;
  private dropped = 0;
  private delaySum = 0;
  private delaySq = 0;
  private minDelay = Infinity;
  private maxDelay = 0;
  private hopSum = 0;
  private maxSeqDelivered = -1;
  private reordered = 0;
  private reroutedPackets = 0;
  private recalculations = 0;
  private routeChanges = 0;
  private dropsByReason: Partial<Record<DropReason, number>> = {};
  private firstCreatedAt: number | null = null;
  private lastResolvedAt = 0;
  completedAt: number | null = null;
  private deliveries: { t: number; delay: number }[] = [];
  private winStart = 0;
  private nextSampleAt = 0;
  private linkStats = new Map<string, LinkStat>();

  log: LogEntry[] = [];
  reroutes: RerouteRecord[] = [];
  recoveries: RecoveryRecord[] = [];
  series: SeriesPoint[] = [];
  /** Increments on every state change; lets the UI skip redundant work. */
  version = 0;
  logHops = true;

  constructor(algorithm: Algorithm, network: Network, config: SimConfig) {
    this.algorithm = algorithm;
    this.config = config;
    this.physical = network;
    this.control = network;
    this.rng = mulberry32(config.seed);
    this.interval = 1000 / Math.max(1, config.packetRatePps);
    this.indexTopology();
    this.computeRoutes();
    this.recalculations = 0;
    const paths = this.currentPaths();
    if (paths.length) {
      this.addLog('route_calculated', 'routing', config.source, this.describeRouteSet(paths, 'Initial route computation'));
    } else {
      this.addLog('route_unreachable', 'routing', config.destination, `Destination ${config.destination} is unreachable from ${config.source}: no operational path exists.`);
    }
    this.queue.push(0, { kind: 'generate' });
  }

  /* ------------------------------- Public API ------------------------------ */

  get isComplete(): boolean {
    return (this.generationStopped || this.generated >= this.config.packetCount) && this.active.size === 0;
  }

  get sentCount() {
    return this.generated;
  }

  get inFlight() {
    return this.active.size;
  }

  stopGeneration() {
    if (this.generationStopped) return;
    this.generationStopped = true;
    this.addLog('sim_stopped', 'system', this.config.source, `Packet generation stopped after ${this.generated} packet(s); ${this.active.size} in-flight packet(s) will finish.`);
    this.checkCompletion();
  }

  /** Process all events up to and including simulated time `target`. */
  advanceTo(target: number) {
    while (this.queue.peekTime() <= target) {
      const { time, item } = this.queue.pop()!;
      this.sampleUntil(time);
      this.time = Math.max(this.time, time);
      this.handle(item);
    }
    this.sampleUntil(target);
    this.time = Math.max(this.time, target);
    this.checkCompletion();
  }

  /** Apply a physical topology change at the current simulated time. */
  onTopologyChange(network: Network, event: TopologyEvent) {
    this.physical = network;
    this.indexTopology();
    const downLinks = new Set(event.downLinks);
    const downRouters = new Set(event.downRouters);

    // Packets whose remaining route touches a failed component.
    let affected = 0;
    for (const p of this.active) if (this.routeTouches(p, downLinks, downRouters)) affected++;

    if (event.isFailure) {
      const impacted = affected > 0 || this.currentPaths().some((path) => path.links.some((l) => downLinks.has(l)) || path.nodes.some((n) => downRouters.has(n)));
      this.recoveries.push({
        id: this.recoveries.length + 1,
        algorithm: this.algorithm,
        event: event.description,
        time: this.time,
        impactedTraffic: impacted,
        packetsLost: 0,
        recoveredAt: null,
        recoveryMs: null,
      });
    }

    // Immediate data-plane consequences.
    for (const p of [...this.active]) {
      if (p.status === 'in_transit' && p.linkId && downLinks.has(p.linkId)) {
        const target = p.route[p.hop + 1];
        this.drop(p, downRouters.has(target) || downRouters.has(p.fromRouter ?? '') ? 'router_failed' : 'link_failed_in_transit');
      } else if ((p.status === 'queued' || p.status === 'created') && downRouters.has(p.location)) {
        this.drop(p, 'router_failed');
      }
    }

    this.queue.push(this.time + Math.max(0, this.config.convergenceDelayMs), {
      kind: 'converge',
      network,
      reasons: [event.description],
      affected,
    });
    this.version++;
  }

  /** Packets that should currently be drawn (in flight plus recently finished). */
  visiblePackets(): Packet[] {
    const now = this.time;
    this.recentDone = this.recentDone.filter((p) => {
      const end = p.status === 'delivered' ? (p.arrivedAt ?? 0) + FADE_DELIVERED_MS : (p.droppedAt ?? 0) + FADE_DROPPED_MS;
      return end >= now;
    });
    return [...this.active, ...this.recentDone];
  }

  queueLengthAt(routerId: string): number {
    let n = 0;
    for (const p of this.active) if (p.status === 'queued' && p.location === routerId) n++;
    return n;
  }

  currentPaths(): Path[] {
    return this.algorithm === 'adaptive' ? (this.adaptivePath ? [this.adaptivePath] : []) : this.candidatePaths;
  }

  getPathStats(): PathStat[] {
    return [...this.pathStats.values()].sort((a, b) => Number(b.active) - Number(a.active) || a.index - b.index);
  }

  getLinkStats(): LinkStat[] {
    const out: LinkStat[] = [];
    for (const [id, s] of this.linkStats) {
      let queued = 0;
      for (const [k, q] of this.queues) if (k.startsWith(id + ':')) queued += q.queued;
      out.push({ ...s, linkId: id, queued });
    }
    return out;
  }

  getMetrics(): Metrics {
    const sent = this.generated;
    const end = this.completedAt ?? this.time;
    const measurementMs = this.firstCreatedAt === null ? 0 : Math.max(0, end - this.firstCreatedAt);
    const impacted = this.recoveries.filter((r) => r.impactedTraffic);
    const latest = impacted[impacted.length - 1] ?? null;
    let latestState: Metrics['latestRecoveryState'] = 'none';
    if (latest) latestState = latest.recoveredAt !== null ? 'recovered' : this.isComplete ? 'not_recovered' : 'pending';
    const used = new Set<string>();
    for (const s of this.pathStats.values()) if (s.assigned > 0) used.add(s.key);
    return {
      algorithm: this.algorithm,
      simTime: this.time,
      sent,
      delivered: this.delivered,
      dropped: this.dropped,
      inFlight: this.active.size,
      pdr: deliveryRatio(sent, this.delivered),
      lossRate: lossRate(sent, this.dropped),
      avgDelayMs: averageDelay(this.delaySum, this.delivered),
      minDelayMs: this.delivered ? this.minDelay : null,
      maxDelayMs: this.delivered ? this.maxDelay : null,
      jitterMs: delayStdDev(this.delaySum, this.delaySq, this.delivered),
      throughputKbps: this.delivered ? throughputKbps(this.delivered, this.config.payloadBytes, measurementMs) : sent ? 0 : null,
      measurementMs,
      avgHops: this.delivered ? this.hopSum / this.delivered : null,
      reroutedPackets: this.reroutedPackets,
      routeRecalculations: this.recalculations,
      routeChanges: this.routeChanges,
      reorderedPackets: this.reordered,
      pathsUsed: used.size,
      dropsByReason: { ...this.dropsByReason },
      latestRecoveryMs: latest?.recoveryMs ?? null,
      latestRecoveryState: latestState,
    };
  }

  /* ------------------------------ Event handling ----------------------------- */

  private handle(ev: SimEvent) {
    switch (ev.kind) {
      case 'generate':
        return this.onGenerate();
      case 'depart':
        return this.onDepart(ev.packet, ev.token, ev.queueKey, ev.tx);
      case 'arrive':
        return this.onArrive(ev.packet, ev.token);
      case 'converge':
        return this.onConverge(ev.network, ev.reasons, ev.affected);
    }
  }

  private onGenerate() {
    if (this.generationStopped || this.generated >= this.config.packetCount) return;
    const seq = this.generated++;
    if (this.firstCreatedAt === null) this.firstCreatedAt = this.time;
    const { source, destination } = this.config;
    const p: Packet = {
      id: `${this.algorithm === 'adaptive' ? 'A' : 'M'}${String(seq + 1).padStart(4, '0')}`,
      seq,
      source,
      destination,
      route: [source],
      assignedPath: [],
      hop: 0,
      pathIndex: 0,
      status: 'created',
      createdAt: this.time,
      createdAtWall: Date.now(),
      arrivedAt: null,
      dropReason: null,
      droppedAt: null,
      location: source,
      linkId: null,
      queueKey: null,
      fromRouter: null,
      departAt: this.time,
      arriveAt: this.time,
      congested: false,
      rerouted: 0,
      hopsTaken: 0,
      routeRev: this.controlRev,
      token: 0,
    };
    this.packets.push(p);
    this.active.add(p);
    this.version++;

    if (this.generated < this.config.packetCount) this.queue.push(this.time + this.interval, { kind: 'generate' });

    if (this.routers.get(source)?.status !== 'online') {
      this.drop(p, 'source_offline');
      return;
    }
    const chosen = this.choosePath();
    if (!chosen) {
      this.drop(p, 'no_route');
      return;
    }
    p.route = [...chosen.path.nodes];
    p.assignedPath = p.route;
    p.pathIndex = chosen.index;
    const stat = this.ensurePathStat(chosen.path);
    stat.assigned++;
    this.addLog('packet_created', 'packet', p.id, `Packet #${seq + 1} created at ${source} → ${destination}, assigned route ${formatPath(p.route)} (cost ${chosen.path.cost.toFixed(1)}).`);
    this.forward(p);
  }

  /** Select the route for a new packet according to the routing algorithm. */
  private choosePath(): { path: Path; index: number } | null {
    if (this.algorithm === 'adaptive') {
      return this.adaptivePath ? { path: this.adaptivePath, index: 0 } : null;
    }
    const cands = this.candidatePaths;
    if (cands.length === 0) return null;
    if (this.config.distribution === 'round_robin') {
      const i = this.rr++ % cands.length;
      return { path: cands[i], index: i };
    }
    // Load-aware: weight_i = 1 / D_i², D_i = estimated delay incl. observed queue backlog.
    const items = cands.map((c) => ({ key: pathKey(c.nodes), weight: 1 / Math.pow(this.estimateLoadedDelay(c.nodes), 2) }));
    const i = this.swrr.pick(items);
    return { path: cands[i], index: i };
  }

  /** Estimated one-way delay of a path using advertised link state plus current queue backlog. */
  estimateLoadedDelay(nodes: string[]): number {
    let d = 0;
    for (let i = 0; i < nodes.length - 1; i++) {
      const link = this.linkBetween(nodes[i], nodes[i + 1], this.control);
      if (!link) return Infinity;
      const q = this.queues.get(this.queueKey(link, nodes[i], nodes[i + 1]));
      const backlog = q ? Math.max(0, q.busyUntil - this.time) : 0;
      d += backlog + hopDelayMs(link, this.config.payloadBytes);
    }
    return Math.max(d, 1e-6);
  }

  /** Forwarding decision at the router `p.route[p.hop]`. */
  private forward(p: Packet) {
    const cur = p.route[p.hop];
    if (cur === p.destination) return this.deliver(p);

    if (p.routeRev < this.controlRev) {
      p.routeRev = this.controlRev;
      const remaining = p.route.slice(p.hop);
      const keep = this.algorithm === 'multipath' && isRouteUsable(this.control, remaining);
      if (!keep) {
        const visited = new Set(p.route.slice(0, p.hop));
        const cont = dijkstra(this.control, cur, p.destination, { excludeRouters: visited });
        if (!cont) {
          this.addLog('route_unreachable', 'routing', p.id, `${cur} has no loop-free route to ${p.destination} for packet ${p.id}.`);
          return this.drop(p, 'no_route');
        }
        if (!sameRoute(cont.nodes, remaining)) {
          const old = formatPath(remaining);
          p.route = [...p.route.slice(0, p.hop), ...cont.nodes];
          if (p.rerouted === 0) this.reroutedPackets++;
          p.rerouted++;
          this.addLog('packet_rerouted', 'routing', p.id, `Packet ${p.id} rerouted at ${cur}: ${old} ⇒ ${formatPath(cont.nodes)}.`);
        }
      }
    }

    const next = p.route[p.hop + 1];
    const link = this.linkBetween(cur, next, this.physical);
    if (!link || !isLinkUsable(this.physical, link, this.routers)) {
      return this.drop(p, 'next_hop_down');
    }
    const qk = this.queueKey(link, cur, next);
    let q = this.queues.get(qk);
    if (!q) {
      q = { busyUntil: 0, queued: 0 };
      this.queues.set(qk, q);
    }
    if (q.queued >= this.config.bufferPackets) return this.drop(p, 'buffer_overflow');
    const tx = transmissionDelayMs(link, this.config.payloadBytes);
    const start = Math.max(this.time, q.busyUntil);
    q.busyUntil = start + tx;
    q.queued++;
    p.status = 'queued';
    p.location = cur;
    p.queueKey = qk;
    p.token++;
    this.queue.push(start, { kind: 'depart', packet: p, token: p.token, queueKey: qk, tx });
  }

  private onDepart(p: Packet, token: number, qk: string, tx: number) {
    if (p.token !== token || p.status !== 'queued') return;
    const q = this.queues.get(qk);
    if (q) q.queued = Math.max(0, q.queued - 1);
    p.queueKey = null;
    const cur = p.route[p.hop];
    const next = p.route[p.hop + 1];
    const link = this.linkBetween(cur, next, this.physical);
    if (!link || !isLinkUsable(this.physical, link, this.routers)) {
      // The output link went down while the packet waited: take a fresh forwarding decision.
      return this.forward(p);
    }
    p.status = 'in_transit';
    p.linkId = link.id;
    p.fromRouter = cur;
    p.departAt = this.time;
    p.arriveAt = this.time + tx + link.delayMs + queueingDelayMs(link.congestion);
    p.congested = link.congestion >= CONGESTED_THRESHOLD;
    p.token++;
    const ls = this.linkStats.get(link.id) ?? { linkId: link.id, packets: 0, busyMs: 0, queued: 0 };
    ls.packets++;
    ls.busyMs += tx;
    this.linkStats.set(link.id, ls);
    this.queue.push(p.arriveAt, { kind: 'arrive', packet: p, token: p.token });
    if (this.logHops) this.addLog('packet_hop', 'hop', p.id, `${p.id} transmitted ${cur} → ${next} over ${link.source}–${link.target} (arrives in ${(p.arriveAt - this.time).toFixed(1)} ms).`);
    this.version++;
  }

  private onArrive(p: Packet, token: number) {
    if (p.token !== token || p.status !== 'in_transit') return;
    const link = p.linkId ? this.linkIndex.get(p.linkId) : undefined;
    const next = p.route[p.hop + 1];
    if (link) {
      const pl = congestionLossProbability(link.congestion);
      if (pl > 0 && this.rng() < pl) return this.drop(p, 'congestion_loss');
    }
    if (this.routers.get(next)?.status !== 'online') return this.drop(p, 'router_failed');
    p.hop++;
    p.hopsTaken++;
    p.location = next;
    p.status = 'queued';
    p.congested = false;
    this.version++;
    this.forward(p);
  }

  private onConverge(network: Network, reasons: string[], affected: number) {
    this.control = network;
    this.controlRev++;
    this.recalculations++;
    const before = this.currentPaths();
    this.computeRoutes();
    const after = this.currentPaths();
    const changed = before.length !== after.length || before.some((p, i) => !sameRoute(p.nodes, after[i]?.nodes));
    if (changed) this.routeChanges++;
    const reason = reasons.join('; ');
    const rec: RerouteRecord = {
      id: this.reroutes.length + 1,
      algorithm: this.algorithm,
      time: this.time,
      reason,
      previousPaths: before,
      newPaths: after,
      previousCost: before[0]?.cost ?? null,
      newCost: after[0]?.cost ?? null,
      affectedPackets: affected,
      changed,
    };
    this.reroutes.push(rec);
    if (after.length === 0) {
      this.addLog('route_unreachable', 'routing', this.config.destination, `${reason}. Routing converged: destination ${this.config.destination} is UNREACHABLE from ${this.config.source}. New packets will be dropped.`);
    } else {
      this.addLog('route_recalculated', 'routing', this.config.source, this.describeRouteSet(after, `${reason}. Routing converged after ${this.config.convergenceDelayMs} ms`, before));
    }
    this.version++;
  }

  private deliver(p: Packet) {
    p.status = 'delivered';
    p.arrivedAt = this.time;
    p.location = p.destination;
    this.finish(p);
    const delay = this.time - p.createdAt;
    this.delivered++;
    this.delaySum += delay;
    this.delaySq += delay * delay;
    this.minDelay = Math.min(this.minDelay, delay);
    this.maxDelay = Math.max(this.maxDelay, delay);
    this.hopSum += p.hopsTaken;
    this.deliveries.push({ t: this.time, delay });
    if (p.seq < this.maxSeqDelivered) this.reordered++;
    else this.maxSeqDelivered = p.seq;
    const stat = this.pathStats.get(pathKey(p.assignedPath));
    if (stat) stat.delivered++;
    for (const r of this.recoveries) {
      if (r.recoveredAt === null && p.createdAt >= r.time) {
        r.recoveredAt = this.time;
        r.recoveryMs = this.time - r.time;
        this.addLog('service_restored', 'recovery', p.id, `Service restored after "${r.event}": first packet sent after the failure (${p.id}) delivered. Simulated recovery time ${r.recoveryMs.toFixed(1)} ms.`);
      }
    }
    this.addLog('packet_delivered', 'packet', p.id, `Packet ${p.id} delivered to ${p.destination} via ${formatPath(p.route)} in ${delay.toFixed(1)} ms (${p.hopsTaken} hops${p.rerouted ? ', rerouted' : ''}).`);
  }

  private drop(p: Packet, reason: DropReason) {
    if (p.status === 'delivered' || p.status === 'dropped') return;
    if (p.queueKey) {
      const q = this.queues.get(p.queueKey);
      if (q) q.queued = Math.max(0, q.queued - 1);
      p.queueKey = null;
    }
    const wasInTransit = p.status === 'in_transit';
    p.status = 'dropped';
    p.dropReason = reason;
    p.droppedAt = this.time;
    if (!wasInTransit) p.linkId = null;
    p.token++;
    this.finish(p);
    this.dropped++;
    this.dropsByReason[reason] = (this.dropsByReason[reason] ?? 0) + 1;
    const stat = this.pathStats.get(pathKey(p.assignedPath));
    if (stat && p.route.length > 1) stat.dropped++;
    for (const r of this.recoveries) if (r.recoveredAt === null) r.packetsLost++;
    this.addLog('packet_dropped', 'packet', p.id, `Packet ${p.id} dropped at ${p.location}: ${DROP_REASON_LABEL[reason]}.`);
  }

  private finish(p: Packet) {
    this.active.delete(p);
    this.recentDone.push(p);
    this.lastResolvedAt = this.time;
    this.version++;
  }

  private checkCompletion() {
    if (this.completedAt === null && this.isComplete) {
      this.completedAt = this.lastResolvedAt;
      this.sampleAt(this.completedAt);
      this.addLog('sim_completed', 'system', this.algorithm, `Run complete: ${this.delivered}/${this.generated} delivered, ${this.dropped} dropped.`);
    }
  }

  /* -------------------------------- Helpers -------------------------------- */

  private computeRoutes() {
    const { source, destination, maxPaths, pathDiscovery } = this.config;
    if (this.algorithm === 'adaptive') {
      this.adaptivePath = computeAdaptiveRoute(this.control, source, destination);
    } else {
      this.candidatePaths = discoverPaths(this.control, source, destination, maxPaths, pathDiscovery);
      this.swrr.reset();
    }
    const live = new Set(this.currentPaths().map((p) => pathKey(p.nodes)));
    for (const s of this.pathStats.values()) s.active = live.has(s.key);
    this.currentPaths().forEach((p, i) => {
      const s = this.ensurePathStat(p);
      s.active = true;
      s.index = this.algorithm === 'multipath' ? i : s.index;
      s.cost = p.cost;
      s.estDelayMs = estimatePathDelayMs(this.control, p.nodes, this.config.payloadBytes);
    });
  }

  private ensurePathStat(p: Path): PathStat {
    const key = pathKey(p.nodes);
    let s = this.pathStats.get(key);
    if (!s) {
      s = {
        key,
        index: this.pathOrder++,
        nodes: [...p.nodes],
        cost: p.cost,
        hops: p.nodes.length - 1,
        estDelayMs: estimatePathDelayMs(this.control, p.nodes, this.config.payloadBytes),
        assigned: 0,
        delivered: 0,
        dropped: 0,
        active: true,
      };
      this.pathStats.set(key, s);
    }
    return s;
  }

  private routeTouches(p: Packet, downLinks: Set<string>, downRouters: Set<string>): boolean {
    if (p.status === 'in_transit' && p.linkId && downLinks.has(p.linkId)) return true;
    for (let i = p.hop; i < p.route.length; i++) {
      if (downRouters.has(p.route[i])) return true;
      if (i < p.route.length - 1) {
        const l = this.linkBetween(p.route[i], p.route[i + 1], this.control);
        if (l && downLinks.has(l.id)) return true;
      }
    }
    return false;
  }

  private indexTopology() {
    this.linkIndex = new Map(this.physical.links.map((l) => [l.id, l]));
    this.routers = routerMap(this.physical);
  }

  private pairIndexCache = new WeakMap<Network, Map<string, Link>>();

  private linkBetween(a: string, b: string, net: Network): Link | undefined {
    let idx = this.pairIndexCache.get(net);
    if (!idx) {
      idx = new Map();
      for (const l of net.links) {
        idx.set(`${l.source}|${l.target}`, l);
        idx.set(`${l.target}|${l.source}`, l);
      }
      this.pairIndexCache.set(net, idx);
    }
    return idx.get(`${a}|${b}`);
  }

  private queueKey(link: Link, from: string, to: string) {
    return `${link.id}:${from}>${to}`;
  }

  private sampleUntil(t: number) {
    while (this.nextSampleAt <= t) {
      this.sampleAt(this.nextSampleAt);
      this.nextSampleAt += SAMPLE_EVERY_MS;
    }
  }

  private sampleAt(t: number) {
    while (this.winStart < this.deliveries.length && this.deliveries[this.winStart].t <= t - THROUGHPUT_WINDOW_MS) this.winStart++;
    let n = 0;
    let dsum = 0;
    for (let i = this.winStart; i < this.deliveries.length && this.deliveries[i].t <= t; i++) {
      n++;
      dsum += this.deliveries[i].delay;
    }
    const delivered = this.deliveries.filter((d) => d.t <= t).length;
    const windowMs = Math.min(THROUGHPUT_WINDOW_MS, Math.max(t - (this.firstCreatedAt ?? 0), 1));
    const sent = this.packets.filter((p) => p.createdAt <= t).length;
    const dropped = this.packets.filter((p) => p.droppedAt !== null && p.droppedAt <= t).length;
    const last = this.series[this.series.length - 1];
    if (last && last.t === t) this.series.pop();
    this.series.push({
      t,
      sent,
      delivered,
      dropped,
      inFlight: sent - delivered - dropped,
      throughputKbps: (n * this.config.payloadBytes * 8) / windowMs,
      windowDelayMs: n ? dsum / n : null,
      pdr: sent ? (delivered / sent) * 100 : null,
    });
    if (this.series.length > 3000) this.series.splice(0, this.series.length - 3000);
  }

  private describeRouteSet(paths: Path[], prefix: string, before?: Path[]): string {
    if (this.algorithm === 'adaptive') {
      const p = paths[0];
      const prev = before?.[0];
      if (prev && !sameRoute(prev.nodes, p.nodes)) {
        return `${prefix}. Previous route ${formatPath(prev.nodes)} (cost ${prev.cost.toFixed(1)}) replaced by ${formatPath(p.nodes)} (cost ${p.cost.toFixed(1)}).`;
      }
      if (prev) return `${prefix}. Best route unchanged: ${formatPath(p.nodes)} (cost ${p.cost.toFixed(1)}).`;
      return `${prefix}: Dijkstra selected ${formatPath(p.nodes)} (cost ${p.cost.toFixed(1)}, ${p.nodes.length - 1} hops).`;
    }
    const list = paths.map((p, i) => `P${i + 1} ${formatPath(p.nodes)} (cost ${p.cost.toFixed(1)})`).join('; ');
    const delta = before ? ` (was ${before.length} path${before.length === 1 ? '' : 's'})` : '';
    return `${prefix}: ${paths.length} candidate path${paths.length === 1 ? '' : 's'}${delta}: ${list}.`;
  }

  private addLog(type: LogType, category: LogCategory, subject: string, message: string) {
    this.log.push({ id: ++logSeq, time: this.time, type, category, algorithm: this.algorithm, subject, message });
    if (this.log.length > LOG_CAP) this.log.splice(0, this.log.length - LOG_CAP);
  }

  /** External log entries (e.g., fault injection) recorded on this engine's timeline. */
  logExternal(type: LogType, category: LogCategory, subject: string, message: string) {
    this.addLog(type, category, subject, message);
  }
}
