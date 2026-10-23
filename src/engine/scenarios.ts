import type { Network } from '../types/network';
import type { Scenario, SimConfig } from '../types/simulation';
import { applyAction, createDefaultNetwork } from './topology';

const base: Partial<SimConfig> = { source: 'R1', destination: 'R12', packetCount: 100, packetRatePps: 200 };

function withActions(net: Network, actions: Parameters<typeof applyAction>[1][]): Network {
  return actions.reduce((n, a) => applyAction(n, a).network, net);
}

/**
 * Deterministic demonstration scenarios. Every scenario starts from the default topology,
 * so repeated runs (same seed) produce identical results.
 */
export const SCENARIOS: Scenario[] = [
  {
    id: 'normal',
    title: 'Normal Network Operation',
    description: 'Baseline run with every router and link healthy.',
    startingConditions: 'Default 12-router topology, all links active, no congestion. 100 packets R1 → R12 at 200 pkt/s.',
    trigger: 'None.',
    expected: 'Adaptive routing should use the minimum-cost route; multipath should spread packets over its candidate paths.',
    recommendedMode: 'adaptive',
    setup: () => ({ network: createDefaultNetwork(), config: base }),
    script: [],
  },
  {
    id: 'link_failure',
    title: 'Single Link Failure',
    description: 'A link on the primary shortest path fails while traffic is flowing.',
    startingConditions: 'Default topology, all links active.',
    trigger: 'At t = 150 ms, link R3–R7 fails.',
    expected: 'Packets on or heading into R3–R7 may be lost until routing reconverges, after which traffic should continue on an alternate route.',
    recommendedMode: 'adaptive',
    setup: () => ({ network: createDefaultNetwork(), config: base }),
    script: [{ at: 150, action: { type: 'fail_link', linkId: 'R3-R7' } }],
  },
  {
    id: 'router_failure',
    title: 'Intermediate Router Failure',
    description: 'A transit router on the primary path goes offline, taking all of its links with it.',
    startingConditions: 'Default topology, all routers online.',
    trigger: 'At t = 150 ms, router R7 fails.',
    expected: 'All routes through R7 should be invalidated and recalculated around it.',
    recommendedMode: 'adaptive',
    setup: () => ({ network: createDefaultNetwork(), config: base }),
    script: [{ at: 150, action: { type: 'fail_router', routerId: 'R7' } }],
  },
  {
    id: 'congestion',
    title: 'Congestion and Load Redistribution',
    description: 'Heavy congestion builds on a primary-path link.',
    startingConditions: 'Default topology; multipath uses load-aware distribution.',
    trigger: 'At t = 120 ms, congestion on R7–R10 rises to 85%; at t = 260 ms R3–R7 reaches 60%.',
    expected: 'Effective costs should rise, adaptive routing may move to a cheaper route and load-aware multipath should shift traffic away from the congested paths.',
    recommendedMode: 'multipath',
    setup: () => ({ network: createDefaultNetwork(), config: { ...base, distribution: 'load_aware' } }),
    script: [
      { at: 120, action: { type: 'set_congestion', linkId: 'R7-R10', level: 0.85 } },
      { at: 260, action: { type: 'set_congestion', linkId: 'R3-R7', level: 0.6 } },
    ],
  },
  {
    id: 'multi_failure',
    title: 'Multiple Link Failures',
    description: 'Three links fail one after another.',
    startingConditions: 'Default topology, all links active.',
    trigger: 'R3–R7 fails at 120 ms, R7–R10 at 220 ms and R6–R10 at 320 ms.',
    expected: 'Each failure should trigger a new route calculation; the destination should stay reachable through the remaining links.',
    recommendedMode: 'compare',
    setup: () => ({ network: createDefaultNetwork(), config: base }),
    script: [
      { at: 120, action: { type: 'fail_link', linkId: 'R3-R7' } },
      { at: 220, action: { type: 'fail_link', linkId: 'R7-R10' } },
      { at: 320, action: { type: 'fail_link', linkId: 'R6-R10' } },
    ],
  },
  {
    id: 'recovery',
    title: 'Network Recovery',
    description: 'The run starts with two failed links which are repaired during the run.',
    startingConditions: 'Links R3–R7 and R10–R12 start in the failed state.',
    trigger: 'R3–R7 is restored at 180 ms and R10–R12 at 300 ms.',
    expected: 'Restored links should be re-admitted by the routing engine and the lower-cost route should be selected again.',
    recommendedMode: 'adaptive',
    setup: () => ({
      network: withActions(createDefaultNetwork(), [
        { type: 'fail_link', linkId: 'R3-R7' },
        { type: 'fail_link', linkId: 'R10-R12' },
      ]),
      config: base,
    }),
    script: [
      { at: 180, action: { type: 'restore_link', linkId: 'R3-R7' } },
      { at: 300, action: { type: 'restore_link', linkId: 'R10-R12' } },
    ],
  },
  {
    id: 'no_route',
    title: 'No Available Route',
    description: 'Every link into the destination fails, partitioning the network.',
    startingConditions: 'Default topology.',
    trigger: 'At t = 150 ms, R9–R12, R10–R12 and R11–R12 all fail. R10–R12 is repaired at 400 ms.',
    expected: 'The destination should be reported unreachable and packets dropped (not routed through failed links) until a link is repaired.',
    recommendedMode: 'adaptive',
    setup: () => ({ network: createDefaultNetwork(), config: base }),
    script: [
      { at: 150, action: { type: 'fail_link', linkId: 'R9-R12' } },
      { at: 150, action: { type: 'fail_link', linkId: 'R10-R12' } },
      { at: 150, action: { type: 'fail_link', linkId: 'R11-R12' } },
      { at: 400, action: { type: 'restore_link', linkId: 'R10-R12' } },
    ],
  },
  {
    id: 'versus',
    title: 'Adaptive Routing versus Multipath Routing',
    description: 'Both algorithms face the same failure and congestion sequence on isolated copies of the network.',
    startingConditions: 'Default topology; identical seed, packet count, rate and payload for both algorithms.',
    trigger: 'R3–R7 fails at 150 ms; R6–R9 congests to 70% at 250 ms.',
    expected: 'Compare delivery ratio, delay, throughput and recovery time measured for each algorithm.',
    recommendedMode: 'compare',
    setup: () => ({ network: createDefaultNetwork(), config: base }),
    script: [
      { at: 150, action: { type: 'fail_link', linkId: 'R3-R7' } },
      { at: 250, action: { type: 'set_congestion', linkId: 'R6-R9', level: 0.7 } },
    ],
  },
];

export const getScenario = (id: string) => SCENARIOS.find((s) => s.id === id);
