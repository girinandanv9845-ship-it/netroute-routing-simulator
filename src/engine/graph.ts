import type { Link, LinkDisplayStatus, Network, Path, Router } from '../types/network';

/* ------------------------------------------------------------------------- *
 * Link performance model (documented in README and the Learn panel)
 *
 *   c                 congestion level, 0 <= c <= 0.95
 *   M(c)            = 1 + 4c                       congestion multiplier
 *   effectiveCost   = baseCost × M(c)              used by every routing decision
 *   B_avail         = B × (1 − c)                  bandwidth left for our traffic
 *   t_tx            = payloadBits / B_avail        transmission (serialisation) delay
 *   t_queue(c)      = 4 ms × c / (1 − c)           background queueing delay (M/M/1-inspired)
 *   hopDelay        = t_tx + propagationDelay + t_queue
 *   P_loss(c)       = 0.3 × (c − 0.6) / 0.35  for c > 0.6, else 0
 * ------------------------------------------------------------------------- */

export const MAX_CONGESTION = 0.95;
export const CONGESTED_THRESHOLD = 0.25;
export const QUEUE_BASE_MS = 4;

export const clampCongestion = (c: number) => Math.min(MAX_CONGESTION, Math.max(0, c));

export function congestionMultiplier(c: number): number {
  return 1 + 4 * clampCongestion(c);
}

export function effectiveCost(link: Link): number {
  return link.baseCost * congestionMultiplier(link.congestion);
}

export function availableBandwidthMbps(link: Link): number {
  return link.bandwidthMbps * (1 - clampCongestion(link.congestion));
}

export function transmissionDelayMs(link: Link, payloadBytes: number): number {
  const bitsPerMs = availableBandwidthMbps(link) * 1000; // Mbit/s -> bit/ms
  return (payloadBytes * 8) / bitsPerMs;
}

export function queueingDelayMs(c: number): number {
  const cc = clampCongestion(c);
  return (QUEUE_BASE_MS * cc) / (1 - cc);
}

export function hopDelayMs(link: Link, payloadBytes: number): number {
  return transmissionDelayMs(link, payloadBytes) + link.delayMs + queueingDelayMs(link.congestion);
}

export function congestionLossProbability(c: number): number {
  const cc = clampCongestion(c);
  return cc > 0.6 ? (0.3 * (cc - 0.6)) / 0.35 : 0;
}

/* ------------------------------------------------------------------------- */

export function routerMap(net: Network): Map<string, Router> {
  return new Map(net.routers.map((r) => [r.id, r]));
}

export function linkMap(net: Network): Map<string, Link> {
  return new Map(net.links.map((l) => [l.id, l]));
}

export function isRouterOnline(net: Network, id: string): boolean {
  const r = net.routers.find((x) => x.id === id);
  return !!r && r.status === 'online';
}

/** A link can forward traffic only if it is active and both endpoint routers exist and are online. */
export function isLinkUsable(net: Network, link: Link, routers = routerMap(net)): boolean {
  if (link.status !== 'active') return false;
  const a = routers.get(link.source);
  const b = routers.get(link.target);
  return !!a && !!b && a.status === 'online' && b.status === 'online';
}

export function linkDisplayStatus(net: Network, link: Link, routers = routerMap(net)): LinkDisplayStatus {
  if (link.status === 'failed') return 'failed';
  if (!isLinkUsable(net, link, routers)) return 'down';
  if (link.congestion >= CONGESTED_THRESHOLD) return 'congested';
  return 'active';
}

export function otherEnd(link: Link, id: string): string {
  return link.source === id ? link.target : link.source;
}

export function findLink(net: Network, a: string, b: string): Link | undefined {
  return net.links.find((l) => (l.source === a && l.target === b) || (l.source === b && l.target === a));
}

export interface Adjacent {
  neighbor: string;
  link: Link;
  cost: number;
}

/** Adjacency list of the *operational* topology (failed links/routers excluded). */
export function buildAdjacency(net: Network): Map<string, Adjacent[]> {
  const routers = routerMap(net);
  const adj = new Map<string, Adjacent[]>();
  for (const r of net.routers) if (r.status === 'online') adj.set(r.id, []);
  for (const l of net.links) {
    if (!isLinkUsable(net, l, routers)) continue;
    const cost = effectiveCost(l);
    adj.get(l.source)!.push({ neighbor: l.target, link: l, cost });
    adj.get(l.target)!.push({ neighbor: l.source, link: l, cost });
  }
  // Deterministic neighbour order => deterministic tie-breaking.
  for (const list of adj.values()) list.sort((a, b) => a.neighbor.localeCompare(b.neighbor, undefined, { numeric: true }));
  return adj;
}

/** Build a Path object (links + effective cost) from a router sequence; null if any hop has no link. */
export function pathFromNodes(net: Network, nodes: string[]): Path | null {
  const links: string[] = [];
  let cost = 0;
  for (let i = 0; i < nodes.length - 1; i++) {
    const l = findLink(net, nodes[i], nodes[i + 1]);
    if (!l) return null;
    links.push(l.id);
    cost += effectiveCost(l);
  }
  return { nodes, links, cost };
}

/** True if every router and link along `nodes` is currently usable and the sequence is loop-free. */
export function isRouteUsable(net: Network, nodes: string[]): boolean {
  if (new Set(nodes).size !== nodes.length) return false;
  const routers = routerMap(net);
  for (const n of nodes) if (routers.get(n)?.status !== 'online') return false;
  for (let i = 0; i < nodes.length - 1; i++) {
    const l = findLink(net, nodes[i], nodes[i + 1]);
    if (!l || !isLinkUsable(net, l, routers)) return false;
  }
  return true;
}

export function pathKey(nodes: string[]): string {
  return nodes.join('>');
}

/** Estimated unloaded one-way delay of a router sequence (ms). */
export function estimatePathDelayMs(net: Network, nodes: string[], payloadBytes: number): number {
  let d = 0;
  for (let i = 0; i < nodes.length - 1; i++) {
    const l = findLink(net, nodes[i], nodes[i + 1]);
    if (!l) return Infinity;
    d += hopDelayMs(l, payloadBytes);
  }
  return d;
}

export function cloneNetwork(net: Network): Network {
  return {
    routers: net.routers.map((r) => ({ ...r, position: { ...r.position } })),
    links: net.links.map((l) => ({ ...l })),
  };
}

export function formatPath(nodes: string[]): string {
  return nodes.join(' → ');
}

export function linkLabel(link: Link): string {
  return `${link.source}–${link.target}`;
}
