import type { Network, Path } from '../types/network';
import type { PathDiscovery } from '../types/simulation';
import { dijkstra } from './dijkstra';
import { buildAdjacency, effectiveCost, linkMap, pathKey } from './graph';

/** Candidate paths costing more than MAX_STRETCH × best path are discarded (avoids absurd detours). */
export const MAX_STRETCH = 3;

/**
 * Edge-disjoint multipath discovery: repeatedly run Dijkstra, temporarily excluding
 * the links of the paths already selected. Paths are loop-free (Dijkstra output) and
 * share no links, so a single link failure can invalidate at most one of them.
 */
export function edgeDisjointPaths(net: Network, source: string, destination: string, k: number): Path[] {
  const adjacency = buildAdjacency(net);
  const exclude = new Set<string>();
  const paths: Path[] = [];
  for (let i = 0; i < k; i++) {
    const p = dijkstra(net, source, destination, { excludeLinks: exclude, adjacency });
    if (!p) break;
    paths.push(p);
    p.links.forEach((l) => exclude.add(l));
  }
  return paths;
}

/** Yen's algorithm: the k loop-free paths of lowest cost (paths may share links). */
export function yenKShortestPaths(net: Network, source: string, destination: string, k: number): Path[] {
  const adjacency = buildAdjacency(net);
  const links = linkMap(net);
  const first = dijkstra(net, source, destination, { adjacency });
  if (!first) return [];
  const A: Path[] = [first];
  const B: Path[] = [];
  const seen = new Set([pathKey(first.nodes)]);

  for (let kk = 1; kk < k; kk++) {
    const last = A[kk - 1];
    for (let i = 0; i < last.nodes.length - 1; i++) {
      const spur = last.nodes[i];
      const rootNodes = last.nodes.slice(0, i + 1);
      const rootLinks = last.links.slice(0, i);
      const excludeLinks = new Set<string>();
      for (const p of A) {
        if (p.nodes.length > i && rootNodes.every((n, j) => p.nodes[j] === n)) excludeLinks.add(p.links[i]);
      }
      const excludeRouters = new Set(rootNodes.slice(0, -1));
      const spurPath = dijkstra(net, spur, destination, { adjacency, excludeLinks, excludeRouters });
      if (!spurPath) continue;
      const nodes = [...rootNodes.slice(0, -1), ...spurPath.nodes];
      const key = pathKey(nodes);
      if (seen.has(key)) continue;
      seen.add(key);
      const rootCost = rootLinks.reduce((s, id) => s + effectiveCost(links.get(id)!), 0);
      B.push({ nodes, links: [...rootLinks, ...spurPath.links], cost: rootCost + spurPath.cost });
    }
    if (B.length === 0) break;
    B.sort((a, b) => a.cost - b.cost || a.nodes.length - b.nodes.length || pathKey(a.nodes).localeCompare(pathKey(b.nodes)));
    A.push(B.shift()!);
  }
  return A;
}

/** Discover up to `k` loop-free candidate paths over the operational topology. */
export function discoverPaths(
  net: Network,
  source: string,
  destination: string,
  k: number,
  method: PathDiscovery = 'edge_disjoint',
): Path[] {
  if (source === destination || k < 1) return [];
  const raw = method === 'k_shortest' ? yenKShortestPaths(net, source, destination, k) : edgeDisjointPaths(net, source, destination, k);
  if (raw.length === 0) return raw;
  const best = raw[0].cost;
  return raw.filter((p) => p.cost <= best * MAX_STRETCH + 1e-9);
}

/**
 * Smooth weighted round-robin (deterministic): each candidate accumulates its weight,
 * the largest accumulator is chosen and reduced by the total weight.
 */
export class SmoothWeightedRoundRobin {
  private current = new Map<string, number>();
  pick(items: { key: string; weight: number }[]): number {
    if (items.length === 0) return -1;
    let total = 0;
    let bestIdx = 0;
    let bestVal = -Infinity;
    items.forEach((it, idx) => {
      const v = (this.current.get(it.key) ?? 0) + it.weight;
      this.current.set(it.key, v);
      total += it.weight;
      if (v > bestVal + 1e-12) {
        bestVal = v;
        bestIdx = idx;
      }
    });
    const chosen = items[bestIdx].key;
    this.current.set(chosen, this.current.get(chosen)! - total);
    // Forget candidates that disappeared.
    const live = new Set(items.map((i) => i.key));
    for (const k of [...this.current.keys()]) if (!live.has(k)) this.current.delete(k);
    return bestIdx;
  }
  reset() {
    this.current.clear();
  }
}
