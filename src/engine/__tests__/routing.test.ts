import { describe, expect, it } from 'vitest';
import { computeRoutingTable } from '../adaptiveRouting';
import { dijkstra } from '../dijkstra';
import { congestionMultiplier, effectiveCost, isRouteUsable } from '../graph';
import { discoverPaths, edgeDisjointPaths, yenKShortestPaths } from '../multipath';
import { addLink, applyAction, createDefaultNetwork, removeRouter } from '../topology';
import { testNetwork } from './fixtures';

const hasLoop = (nodes: string[]) => new Set(nodes).size !== nodes.length;

describe('Dijkstra', () => {
  it('returns the minimum-cost path on a known graph', () => {
    const p = dijkstra(testNetwork(), 'A', 'F')!;
    expect(p.nodes).toEqual(['A', 'B', 'D', 'F']);
    expect(p.cost).toBe(3);
    expect(p.links).toEqual(['A-B', 'B-D', 'D-F']);
  });

  it('avoids failed links', () => {
    const net = applyAction(testNetwork(), { type: 'fail_link', linkId: 'B-D' }).network;
    const p = dijkstra(net, 'A', 'F')!;
    expect(p.links).not.toContain('B-D');
    expect(p.nodes).toEqual(['A', 'B', 'C', 'E', 'F']);
    expect(p.cost).toBe(4);
  });

  it('avoids failed routers', () => {
    const net = applyAction(testNetwork(), { type: 'fail_router', routerId: 'D' }).network;
    const p = dijkstra(net, 'A', 'F')!;
    expect(p.nodes).not.toContain('D');
    expect(p.nodes).toEqual(['A', 'B', 'C', 'E', 'F']);
  });

  it('returns null for an unreachable destination', () => {
    let net = applyAction(testNetwork(), { type: 'fail_link', linkId: 'D-F' }).network;
    net = applyAction(net, { type: 'fail_link', linkId: 'E-F' }).network;
    expect(dijkstra(net, 'A', 'F')).toBeNull();
    expect(dijkstra(testNetwork(), 'A', 'A')).toBeNull();
  });

  it('finds the default topology best route R1 → R3 → R7 → R10 → R12', () => {
    const p = dijkstra(createDefaultNetwork(), 'R1', 'R12')!;
    expect(p.nodes).toEqual(['R1', 'R3', 'R7', 'R10', 'R12']);
    expect(p.cost).toBe(8);
  });

  it('builds a routing table with next hops', () => {
    const table = computeRoutingTable(testNetwork(), 'A');
    const f = table.find((e) => e.destination === 'F')!;
    expect(f.nextHop).toBe('B');
    expect(f.cost).toBe(3);
    expect(table).toHaveLength(5);
  });
});

describe('Congestion model', () => {
  it('raises effective cost by M(c) = 1 + 4c', () => {
    expect(congestionMultiplier(0)).toBe(1);
    expect(congestionMultiplier(0.5)).toBe(3);
    const net = applyAction(testNetwork(), { type: 'set_congestion', linkId: 'B-D', level: 0.5 }).network;
    expect(effectiveCost(net.links.find((l) => l.id === 'B-D')!)).toBe(3);
  });

  it('changes the selected route when a link becomes congested', () => {
    const net = applyAction(testNetwork(), { type: 'set_congestion', linkId: 'D-F', level: 0.8 }).network; // cost 1 -> 4.2
    const p = dijkstra(net, 'A', 'F')!;
    expect(p.nodes).toEqual(['A', 'B', 'C', 'E', 'F']);
    expect(p.cost).toBe(4);
  });
});

describe('Multipath discovery', () => {
  it('discovers multiple valid edge-disjoint paths', () => {
    const paths = edgeDisjointPaths(testNetwork(), 'A', 'F', 3);
    expect(paths.length).toBe(2);
    const used = paths.flatMap((p) => p.links);
    expect(new Set(used).size).toBe(used.length);
    expect(paths[0].nodes).toEqual(['A', 'B', 'D', 'F']);
  });

  it('produces loop-free, usable paths (edge-disjoint and Yen)', () => {
    const net = createDefaultNetwork();
    for (const method of ['edge_disjoint', 'k_shortest'] as const) {
      const paths = discoverPaths(net, 'R1', 'R12', 3, method);
      expect(paths.length).toBe(3);
      for (const p of paths) {
        expect(hasLoop(p.nodes)).toBe(false);
        expect(p.nodes[0]).toBe('R1');
        expect(p.nodes[p.nodes.length - 1]).toBe('R12');
        expect(isRouteUsable(net, p.nodes)).toBe(true);
      }
    }
  });

  it('Yen returns paths in non-decreasing cost order', () => {
    const paths = yenKShortestPaths(testNetwork(), 'A', 'F', 4);
    for (let i = 1; i < paths.length; i++) expect(paths[i].cost).toBeGreaterThanOrEqual(paths[i - 1].cost);
    expect(new Set(paths.map((p) => p.nodes.join())).size).toBe(paths.length);
  });

  it('excludes failed links and routers from candidate paths', () => {
    let net = applyAction(createDefaultNetwork(), { type: 'fail_link', linkId: 'R3-R7' }).network;
    net = applyAction(net, { type: 'fail_router', routerId: 'R6' }).network;
    for (const method of ['edge_disjoint', 'k_shortest'] as const) {
      const paths = discoverPaths(net, 'R1', 'R12', 3, method);
      expect(paths.length).toBeGreaterThan(0);
      for (const p of paths) {
        expect(p.links).not.toContain('R3-R7');
        expect(p.nodes).not.toContain('R6');
      }
    }
  });
});

describe('Topology editing', () => {
  it('rejects self links and duplicates', () => {
    const net = testNetwork();
    expect(addLink(net, 'A', 'A', { baseCost: 1, bandwidthMbps: 1, delayMs: 1 }).error).toBeTruthy();
    expect(addLink(net, 'B', 'A', { baseCost: 1, bandwidthMbps: 1, delayMs: 1 }).error).toBeTruthy();
    expect(addLink(net, 'A', 'F', { baseCost: 0, bandwidthMbps: 1, delayMs: 1 }).error).toBeTruthy();
    expect(addLink(net, 'A', 'F', { baseCost: 1, bandwidthMbps: 1, delayMs: 1 }).error).toBeUndefined();
  });

  it('removes a router together with its links', () => {
    const r = removeRouter(testNetwork(), 'D');
    expect(r.network.routers.map((x) => x.id)).not.toContain('D');
    expect(r.network.links.some((l) => l.source === 'D' || l.target === 'D')).toBe(false);
    expect(r.event?.isFailure).toBe(true);
    expect(r.event?.downLinks.sort()).toEqual(['B-D', 'D-E', 'D-F']);
  });
});
