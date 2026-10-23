import type { Network, Path } from '../types/network';
import { dijkstra, extractPath, shortestPathTree } from './dijkstra';

/** Adaptive single-path routing: the current minimum effective-cost path. */
export function computeAdaptiveRoute(net: Network, source: string, destination: string): Path | null {
  return dijkstra(net, source, destination);
}

export interface RoutingTableEntry {
  destination: string;
  nextHop: string | null;
  cost: number | null;
  hops: number | null;
  path: string[] | null;
  reachable: boolean;
}

/**
 * Routing table of a router, derived from one Dijkstra run over the link-state database
 * (the routing engine's current view of the topology).
 */
export function computeRoutingTable(net: Network, routerId: string): RoutingTableEntry[] {
  const tree = shortestPathTree(net, routerId);
  return net.routers
    .filter((r) => r.id !== routerId)
    .map((r) => {
      const p = extractPath(tree, r.id);
      return {
        destination: r.id,
        nextHop: p ? p.nodes[1] : null,
        cost: p ? p.cost : null,
        hops: p ? p.nodes.length - 1 : null,
        path: p ? p.nodes : null,
        reachable: !!p,
      };
    })
    .sort((a, b) => a.destination.localeCompare(b.destination, undefined, { numeric: true }));
}

/** True when two router sequences are identical. */
export function sameRoute(a: string[] | null | undefined, b: string[] | null | undefined): boolean {
  if (!a || !b) return a === b;
  return a.length === b.length && a.every((n, i) => n === b[i]);
}
