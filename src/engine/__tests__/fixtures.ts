import type { Link, Network } from '../../types/network';

/**
 * Reproducible test topology (costs on edges):
 *
 *        B --1-- D
 *       /1        \1
 *      A           F
 *       \4        /1
 *        C --1-- E
 *   plus B–C (1) and D–E (5)
 *
 * Shortest A→F: A-B-D-F (cost 3). Edge-disjoint alternative: A-C-E-F (cost 6).
 */
function link(a: string, b: string, cost: number): Link {
  return { id: `${a}-${b}`, source: a, target: b, baseCost: cost, bandwidthMbps: 10, delayMs: 5, status: 'active', congestion: 0 };
}
export function testNetwork(): Network {
  const ids = ['A', 'B', 'C', 'D', 'E', 'F'];
  return {
    routers: ids.map((id, i) => ({ id, name: id, position: { x: i * 100, y: 0 }, status: 'online' })),
    links: [link('A', 'B', 1), link('B', 'D', 1), link('D', 'F', 1), link('A', 'C', 4), link('C', 'E', 1), link('E', 'F', 1), link('B', 'C', 1), link('D', 'E', 5)],
  };
}
