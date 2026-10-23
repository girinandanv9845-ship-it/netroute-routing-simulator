import { describe, expect, it } from 'vitest';
import type { SimConfig } from '../../types/simulation';
import { escapeCsvField, toCsv } from '../../utils/csvExport';
import { DEFAULT_CONFIG } from '../config';
import { cloneNetwork } from '../graph';
import { averageDelay, deliveryRatio, lossRate, recoveryTime, throughputKbps } from '../metrics';
import { PacketEngine } from '../packetEngine';
import { SCENARIOS } from '../scenarios';
import { SimulationRunner, runComparison } from '../simulationClock';
import { applyAction, createDefaultNetwork } from '../topology';
import { testNetwork } from './fixtures';

const cfg = (over: Partial<SimConfig> = {}): SimConfig => ({ ...DEFAULT_CONFIG, ...over });

describe('Metric formulas', () => {
  it('computes delivery ratio and loss rate', () => {
    expect(deliveryRatio(0, 0)).toBeNull();
    expect(lossRate(0, 0)).toBeNull();
    expect(deliveryRatio(200, 150)).toBe(75);
    expect(lossRate(200, 50)).toBe(25);
  });

  it('computes average delay over delivered packets only', () => {
    expect(averageDelay(0, 0)).toBeNull();
    expect(averageDelay(30 + 40 + 50, 3)).toBe(40);
  });

  it('computes throughput from payload size and measurement duration', () => {
    // 100 packets × 1000 B × 8 = 800 000 bits over 500 ms = 1600 bits/ms = 1600 kbit/s
    expect(throughputKbps(100, 1000, 500)).toBe(1600);
    expect(throughputKbps(10, 1000, 0)).toBeNull();
  });

  it('measures recovery time from the first post-failure delivery', () => {
    const deliveries = [
      { createdAt: 90, arrivedAt: 120 }, // created before the failure: ignored
      { createdAt: 110, arrivedAt: 160 },
      { createdAt: 105, arrivedAt: 140 },
    ];
    expect(recoveryTime(100, deliveries)).toBe(40);
    expect(recoveryTime(500, deliveries)).toBeNull();
  });
});

describe('Packet engine', () => {
  it('delivers every packet exactly once on a healthy network', () => {
    const runner = new SimulationRunner(createDefaultNetwork(), cfg({ packetCount: 50 }), 'adaptive');
    runner.runToCompletion();
    const e = runner.engines[0];
    const m = e.getMetrics();
    expect(m.sent).toBe(50);
    expect(m.delivered).toBe(50);
    expect(m.dropped).toBe(0);
    expect(m.pdr).toBe(100);
    const ids = e.packets.filter((p) => p.status === 'delivered').map((p) => p.id);
    expect(new Set(ids).size).toBe(50);
    expect(e.log.filter((l) => l.type === 'packet_delivered')).toHaveLength(50);
    // Average delay equals the mean of individual packet delays.
    const mean = e.packets.reduce((s, p) => s + (p.arrivedAt! - p.createdAt), 0) / 50;
    expect(m.avgDelayMs).toBeCloseTo(mean, 9);
    // Throughput = delivered bits / (completion − first creation)
    expect(m.throughputKbps).toBeCloseTo((50 * 1000 * 8) / m.measurementMs, 9);
    for (const p of e.packets) expect(new Set(p.route).size).toBe(p.route.length);
  });

  it('never generates more packets than configured and sent = delivered + dropped', () => {
    const runner = new SimulationRunner(createDefaultNetwork(), cfg({ packetCount: 80 }), 'multipath');
    runner.setScript(SCENARIOS.find((s) => s.id === 'multi_failure')!.script);
    runner.runToCompletion();
    const m = runner.engines[0].getMetrics();
    expect(m.sent).toBe(80);
    expect(m.delivered + m.dropped).toBe(80);
    expect(m.inFlight).toBe(0);
  });

  it('does not deliver a packet after it was dropped', () => {
    const runner = new SimulationRunner(createDefaultNetwork(), cfg({ packetCount: 100 }), 'adaptive');
    runner.setScript([{ at: 100, action: { type: 'fail_link', linkId: 'R3-R7' } }]);
    runner.runToCompletion();
    const e = runner.engines[0];
    const dropped = e.packets.filter((p) => p.status === 'dropped');
    expect(dropped.length).toBeGreaterThan(0);
    for (const p of dropped) {
      expect(p.arrivedAt).toBeNull();
      expect(p.dropReason).not.toBeNull();
      expect(e.log.some((l) => l.type === 'packet_delivered' && l.subject === p.id)).toBe(false);
    }
    // After convergence the failed link is never used by new packets.
    const late = e.packets.filter((p) => p.createdAt > 100 + DEFAULT_CONFIG.convergenceDelayMs);
    for (const p of late) expect(p.route.join('>')).not.toContain('R3>R7');
  });

  it('reroutes adaptive traffic and records recovery time after a link failure', () => {
    const runner = new SimulationRunner(createDefaultNetwork(), cfg(), 'adaptive');
    runner.setScript([{ at: 150, action: { type: 'fail_link', linkId: 'R3-R7' } }]);
    runner.runToCompletion();
    const e = runner.engines[0];
    expect(e.adaptivePath!.links).not.toContain('R3-R7');
    const rec = e.recoveries[0];
    expect(rec.impactedTraffic).toBe(true);
    expect(rec.recoveryMs).not.toBeNull();
    // Recovery can't happen before routing converged.
    expect(rec.recoveryMs!).toBeGreaterThanOrEqual(DEFAULT_CONFIG.convergenceDelayMs);
    const firstAfter = e.packets.filter((p) => p.createdAt >= 150 && p.status === 'delivered').sort((a, b) => a.arrivedAt! - b.arrivedAt!)[0];
    expect(rec.recoveredAt).toBe(firstAfter.arrivedAt);
    expect(e.getMetrics().routeChanges).toBe(1);
  });

  it('reports no recovery when the destination stays unreachable', () => {
    let net = createDefaultNetwork();
    const runner = new SimulationRunner(net, cfg({ packetCount: 60 }), 'adaptive');
    runner.setScript(['R9-R12', 'R10-R12', 'R11-R12'].map((linkId) => ({ at: 50, action: { type: 'fail_link' as const, linkId } })));
    runner.runToCompletion();
    const e = runner.engines[0];
    expect(e.adaptivePath).toBeNull();
    expect(e.recoveries.every((r) => r.recoveryMs === null)).toBe(true);
    expect(e.getMetrics().latestRecoveryState).toBe('not_recovered');
    expect(e.packets.filter((p) => p.createdAt > 70).every((p) => p.status === 'dropped' && p.dropReason === 'no_route')).toBe(true);
    net = runner.network;
    expect(net.links.filter((l) => l.status === 'failed')).toHaveLength(3);
  });

  it('spreads multipath traffic across all candidate paths with round-robin', () => {
    const runner = new SimulationRunner(createDefaultNetwork(), cfg({ packetCount: 90 }), 'multipath');
    runner.runToCompletion();
    const stats = runner.engines[0].getPathStats();
    expect(stats.length).toBe(3);
    for (const s of stats) expect(s.assigned).toBe(30);
  });

  it('load-aware distribution shifts traffic away from a congested path', () => {
    const net = applyAction(createDefaultNetwork(), { type: 'set_congestion', linkId: 'R1-R4', level: 0.9 }).network;
    const runner = new SimulationRunner(net, cfg({ packetCount: 90, distribution: 'load_aware' }), 'multipath');
    runner.runToCompletion();
    const stats = runner.engines[0].getPathStats();
    const congested = stats.find((s) => s.nodes.includes('R4'));
    const others = stats.filter((s) => s !== congested);
    for (const o of others) expect(o.assigned).toBeGreaterThan(congested ? congested.assigned : 0);
  });

  it('is deterministic for a given seed', () => {
    const run = () => {
      const r = new SimulationRunner(createDefaultNetwork(), cfg(), 'multipath');
      r.setScript(SCENARIOS.find((s) => s.id === 'congestion')!.script);
      r.runToCompletion();
      return r.engines[0].getMetrics();
    };
    expect(run()).toEqual(run());
  });

  it('reset clears the previous simulation and restores the starting network', () => {
    const runner = new SimulationRunner(createDefaultNetwork(), cfg({ packetCount: 40 }), 'adaptive');
    runner.start();
    runner.advance(80);
    runner.applyAction({ type: 'fail_link', linkId: 'R3-R7' });
    expect(runner.network.links.find((l) => l.id === 'R3-R7')!.status).toBe('failed');
    runner.reset();
    expect(runner.engines).toHaveLength(0);
    expect(runner.time).toBe(0);
    expect(runner.status).toBe('ready');
    expect(runner.network.links.find((l) => l.id === 'R3-R7')!.status).toBe('active');
    runner.start();
    expect(runner.engines[0].getMetrics().sent).toBe(0);
  });

  it('pause does not advance simulated time', () => {
    const runner = new SimulationRunner(createDefaultNetwork(), cfg(), 'adaptive');
    runner.start();
    runner.advance(30);
    runner.pause();
    const sent = runner.engines[0].sentCount;
    runner.advance(100);
    expect(runner.time).toBe(30);
    expect(runner.engines[0].sentCount).toBe(sent);
    runner.resume();
    runner.advance(10);
    expect(runner.time).toBe(40);
  });

  it('stop halts generation and drains in-flight packets', () => {
    const runner = new SimulationRunner(createDefaultNetwork(), cfg({ packetCount: 100 }), 'adaptive');
    runner.start();
    runner.advance(50);
    runner.stop();
    const sent = runner.engines[0].sentCount;
    runner.runToCompletion();
    const m = runner.engines[0].getMetrics();
    expect(m.sent).toBe(sent);
    expect(m.sent).toBeLessThan(100);
    expect(m.delivered + m.dropped).toBe(sent);
  });

  it('works on the small test topology', () => {
    const e = new PacketEngine('adaptive', testNetwork(), cfg({ source: 'A', destination: 'F', packetCount: 10 }));
    e.advanceTo(1000);
    expect(e.getMetrics().delivered).toBe(10);
    expect(e.packets[0].route).toEqual(['A', 'B', 'D', 'F']);
  });
});

describe('Comparison isolation', () => {
  it('runs both algorithms on isolated copies with identical inputs', () => {
    const base = createDefaultNetwork();
    const snapshot = JSON.stringify(base);
    const scenario = SCENARIOS.find((s) => s.id === 'versus')!;
    const [a, m] = runComparison(base, cfg(), scenario.script);
    expect(JSON.stringify(base)).toBe(snapshot); // baseline untouched
    expect(a.algorithm).toBe('adaptive');
    expect(m.algorithm).toBe('multipath');
    expect(a.metrics.sent).toBe(100);
    expect(m.metrics.sent).toBe(100);
    // Running one algorithm alone gives the same result as inside the comparison.
    const solo = new SimulationRunner(cloneNetwork(base), cfg(), 'multipath');
    solo.setScript(scenario.script);
    solo.runToCompletion();
    expect(solo.engines[0].getMetrics()).toEqual(m.metrics);
  });

  it('live compare mode keeps engine state separate', () => {
    const runner = new SimulationRunner(createDefaultNetwork(), cfg({ packetCount: 60 }), 'compare');
    runner.setScript([{ at: 100, action: { type: 'fail_link', linkId: 'R3-R7' } }]);
    runner.runToCompletion();
    const [a, m] = runner.engines;
    expect(a.packets).not.toBe(m.packets);
    expect(a.packets.every((p) => p.id.startsWith('A'))).toBe(true);
    expect(m.packets.every((p) => p.id.startsWith('M'))).toBe(true);
    expect(a.physical).not.toBe(m.physical);
    expect(a.getMetrics().sent).toBe(60);
    expect(m.getMetrics().sent).toBe(60);
  });
});

describe('CSV export', () => {
  it('escapes commas, quotes and newlines', () => {
    expect(escapeCsvField('plain')).toBe('plain');
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(3.5)).toBe('3.5');
    expect(escapeCsvField('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(escapeCsvField(-4)).toBe('-4');
  });

  it('builds a CSV document with CRLF rows', () => {
    const csv = toCsv(['id', 'message'], [[1, 'R1 → R3, then "R7"']]);
    expect(csv).toBe('id,message\r\n1,"R1 → R3, then ""R7"""');
  });
});
