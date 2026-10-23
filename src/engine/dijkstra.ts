import type { Network, Path } from '../types/network';
import { buildAdjacency, type Adjacent } from './graph';

export interface DijkstraOptions {
  /** Link IDs to ignore (used by multipath discovery). */
  excludeLinks?: Set<string>;
  /** Router IDs to ignore (never the source or destination). */
  excludeRouters?: Set<string>;
  /** Precomputed adjacency to avoid rebuilding it repeatedly. */
  adjacency?: Map<string, Adjacent[]>;
}

export interface ShortestPathTree {
  source: string;
  dist: Map<string, number>;
  prev: Map<string, { node: string; link: string }>;
}

/** Minimal binary heap keyed by distance; ties broken by insertion order for determinism. */
class MinHeap {
  private items: { key: number; seq: number; node: string }[] = [];
  private seq = 0;
  get size() {
    return this.items.length;
  }
  push(key: number, node: string) {
    const it = { key, seq: this.seq++, node };
    const a = this.items;
    a.push(it);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.less(a[i], a[p])) {
        [a[i], a[p]] = [a[p], a[i]];
        i = p;
      } else break;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (r < a.length && this.less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
  private less(x: { key: number; seq: number }, y: { key: number; seq: number }) {
    return x.key < y.key || (x.key === y.key && x.seq < y.seq);
  }
}

const EPS = 1e-9;

/**
 * Dijkstra's algorithm over the operational topology using effective (congestion-aware) costs.
 * Failed links and failed routers are never part of the adjacency, so they are never selected.
 */
export function shortestPathTree(net: Network, source: string, opts: DijkstraOptions = {}): ShortestPathTree {
  const adj = opts.adjacency ?? buildAdjacency(net);
  const dist = new Map<string, number>();
  const prev = new Map<string, { node: string; link: string }>();
  const done = new Set<string>();
  if (!adj.has(source)) return { source, dist, prev };

  dist.set(source, 0);
  const heap = new MinHeap();
  heap.push(0, source);
  while (heap.size > 0) {
    const { node: u, key: du } = heap.pop();
    if (done.has(u)) continue;
    done.add(u);
    for (const { neighbor: v, link, cost } of adj.get(u) ?? []) {
      if (opts.excludeLinks?.has(link.id)) continue;
      if (opts.excludeRouters?.has(v)) continue;
      if (done.has(v)) continue;
      const nd = du + cost;
      const old = dist.get(v);
      if (old === undefined || nd < old - EPS) {
        dist.set(v, nd);
        prev.set(v, { node: u, link: link.id });
        heap.push(nd, v);
      }
    }
  }
  return { source, dist, prev };
}

export function extractPath(tree: ShortestPathTree, destination: string): Path | null {
  if (!tree.dist.has(destination)) return null;
  const nodes = [destination];
  const links: string[] = [];
  let cur = destination;
  while (cur !== tree.source) {
    const p = tree.prev.get(cur);
    if (!p) return null;
    links.push(p.link);
    nodes.push(p.node);
    cur = p.node;
  }
  nodes.reverse();
  links.reverse();
  return { nodes, links, cost: tree.dist.get(destination)! };
}

/** Minimum-cost path from source to destination, or null if the destination is unreachable. */
export function dijkstra(net: Network, source: string, destination: string, opts: DijkstraOptions = {}): Path | null {
  if (source === destination) return null;
  return extractPath(shortestPathTree(net, source, opts), destination);
}
