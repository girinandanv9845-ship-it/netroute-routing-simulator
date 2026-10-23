import { FlaskConical, GitCompareArrows, Minus, Trophy } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DROP_REASON_LABEL, type DropReason } from '../../types/packet';
import type { Algorithm, Metrics, SeriesPoint } from '../../types/simulation';
import { useSim } from '../../store/simulationStore';
import { fmtKbps, fmtMs, fmtPct } from '../../utils/formatting';
import { ALGO_COLOR, ALGO_LABEL, ALGO_SHORT, COLORS } from '../common/theme';
import { ChartCard, TimeChart } from './PerformanceCharts';

type Better = 'higher' | 'lower' | 'none';

interface Row {
  label: string;
  value: (m: Metrics) => number | null;
  format: (v: number | null) => string;
  better: Better;
  note?: string;
}

const ROWS: Row[] = [
  { label: 'Packets sent', value: (m) => m.sent, format: (v) => String(v ?? 'N/A'), better: 'none' },
  { label: 'Packets delivered', value: (m) => m.delivered, format: (v) => String(v ?? 'N/A'), better: 'higher' },
  { label: 'Packets dropped', value: (m) => m.dropped, format: (v) => String(v ?? 'N/A'), better: 'lower' },
  { label: 'Packet delivery ratio', value: (m) => m.pdr, format: (v) => fmtPct(v), better: 'higher' },
  { label: 'Packet loss rate', value: (m) => m.lossRate, format: (v) => fmtPct(v), better: 'lower' },
  { label: 'Average end-to-end delay', value: (m) => m.avgDelayMs, format: (v) => fmtMs(v, 2), better: 'lower' },
  { label: 'Delay std. deviation (jitter)', value: (m) => m.jitterMs, format: (v) => fmtMs(v, 2), better: 'lower' },
  { label: 'Throughput', value: (m) => m.throughputKbps, format: (v) => fmtKbps(v), better: 'higher' },
  { label: 'Recovery time (latest failure)', value: (m) => (m.latestRecoveryState === 'recovered' ? m.latestRecoveryMs : null), format: (v) => fmtMs(v), better: 'lower', note: 'N/A when no failure affected traffic or service never recovered' },
  { label: 'Route recalculations', value: (m) => m.routeRecalculations, format: (v) => String(v ?? 'N/A'), better: 'none' },
  { label: 'Route changes', value: (m) => m.routeChanges, format: (v) => String(v ?? 'N/A'), better: 'none' },
  { label: 'Distinct paths used', value: (m) => m.pathsUsed, format: (v) => String(v ?? 'N/A'), better: 'none' },
  { label: 'Packets rerouted in flight', value: (m) => m.reroutedPackets, format: (v) => String(v ?? 'N/A'), better: 'none' },
  { label: 'Out-of-order deliveries', value: (m) => m.reorderedPackets, format: (v) => String(v ?? 'N/A'), better: 'lower' },
  { label: 'Average hop count', value: (m) => m.avgHops, format: (v) => (v === null ? 'N/A' : v.toFixed(2)), better: 'none' },
];

function winner(row: Row, a: Metrics, b: Metrics): Algorithm | 'tie' | null {
  if (row.better === 'none') return null;
  const va = row.value(a);
  const vb = row.value(b);
  if (va === null || vb === null) return null;
  if (Math.abs(va - vb) < 1e-9) return 'tie';
  return (row.better === 'higher' ? va > vb : va < vb) ? 'adaptive' : 'multipath';
}

export function ComparisonPanel() {
  const comparison = useSim((s) => s.comparison);
  const engines = useSim((s) => s.engines);
  const mode = useSim((s) => s.mode);
  const status = useSim((s) => s.status);
  const scenarioId = useSim((s) => s.scenarioId);
  const runExperiment = useSim((s) => s.runExperiment);

  const liveCompare = mode === 'compare' && engines.length === 2 && status !== 'completed';
  const results = liveCompare
    ? engines.map((e) => ({ algorithm: e.algorithm, metrics: e.metrics, series: e.series, recoveries: e.recoveries }))
    : comparison?.results.map((r) => ({ algorithm: r.algorithm, metrics: r.metrics, series: r.series, recoveries: r.recoveries }));

  if (!results || results.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <GitCompareArrows className="h-8 w-8 text-slate-500" />
        <p className="max-w-lg text-sm text-slate-400">
          No comparison yet. Run an instant A/B experiment (both algorithms simulated on isolated copies of the same topology, seed, packet count and events), or choose
          <span className="text-amber-300"> Compare Both</span> mode and watch them run live.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button className="btn-primary" onClick={() => runExperiment(scenarioId)}>
            <FlaskConical className="h-4 w-4" /> Run experiment {scenarioId ? 'for loaded scenario' : 'on current topology'}
          </button>
          {scenarioId && (
            <button className="btn-ghost" onClick={() => runExperiment(null)}>
              Use current topology instead
            </button>
          )}
        </div>
      </div>
    );
  }

  const a = results.find((r) => r.algorithm === 'adaptive')!;
  const m = results.find((r) => r.algorithm === 'multipath')!;
  const wins = { adaptive: 0, multipath: 0 };
  ROWS.forEach((r) => {
    const w = winner(r, a.metrics, m.metrics);
    if (w === 'adaptive' || w === 'multipath') wins[w]++;
  });

  const bars = [
    { name: 'PDR (%)', adaptive: a.metrics.pdr ?? 0, multipath: m.metrics.pdr ?? 0 },
    { name: 'Loss (%)', adaptive: a.metrics.lossRate ?? 0, multipath: m.metrics.lossRate ?? 0 },
  ];
  const delayBars = [
    { name: 'Avg delay (ms)', adaptive: a.metrics.avgDelayMs ?? 0, multipath: m.metrics.avgDelayMs ?? 0 },
    { name: 'Recovery (ms)', adaptive: a.metrics.latestRecoveryMs ?? 0, multipath: m.metrics.latestRecoveryMs ?? 0 },
  ];
  const reasons = [...new Set([...Object.keys(a.metrics.dropsByReason), ...Object.keys(m.metrics.dropsByReason)])] as DropReason[];
  const failures = a.recoveries.map((r, i) => ({ time: r.time, label: `F${i + 1}` }));
  const seriesEngines = [a, m] as { algorithm: Algorithm; series: SeriesPoint[] }[];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400/30 bg-amber-500/5 px-3 py-2 text-xs">
        <div className="text-slate-300">
          <span className="mr-2 font-semibold uppercase tracking-wider text-amber-300">Simulated experiment</span>
          {liveCompare ? 'Live compare run in progress (values update as packets resolve).' : `${comparison!.title} · ${comparison!.source === 'live' ? 'live run' : 'instant run'} · ${comparison!.config.packetCount} packets ${comparison!.config.source}→${comparison!.config.destination} · ${comparison!.config.payloadBytes} B payload · seed ${comparison!.config.seed}`}
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost py-1 text-xs" onClick={() => runExperiment(scenarioId)}>
            <FlaskConical className="h-3.5 w-3.5" /> Re-run {scenarioId ? 'scenario' : 'current topology'}
          </button>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-lg border border-ink-600/70">
          <table className="w-full text-sm">
            <thead className="bg-ink-800 text-left text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2">Metric</th>
                <th className="px-3 py-2 text-right" style={{ color: ALGO_COLOR.adaptive }}>
                  {ALGO_LABEL.adaptive}
                </th>
                <th className="px-3 py-2 text-right" style={{ color: ALGO_COLOR.multipath }}>
                  {ALGO_LABEL.multipath}
                </th>
                <th className="px-3 py-2 text-center">Better</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => {
                const w = winner(r, a.metrics, m.metrics);
                return (
                  <tr key={r.label} className="border-t border-ink-700/60 hover:bg-ink-800/40" title={r.note}>
                    <td className="px-3 py-1.5 text-slate-300">{r.label}</td>
                    <td className={`px-3 py-1.5 text-right font-mono ${w === 'adaptive' ? 'font-semibold text-emerald-300' : 'text-slate-200'}`}>{r.format(r.value(a.metrics))}</td>
                    <td className={`px-3 py-1.5 text-right font-mono ${w === 'multipath' ? 'font-semibold text-emerald-300' : 'text-slate-200'}`}>{r.format(r.value(m.metrics))}</td>
                    <td className="px-3 py-1.5 text-center text-xs">
                      {w === null ? (
                        <span className="text-slate-600">—</span>
                      ) : w === 'tie' ? (
                        <span className="inline-flex items-center gap-1 text-slate-400">
                          <Minus className="h-3 w-3" /> tie
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold" style={{ color: ALGO_COLOR[w] }}>
                          <Trophy className="h-3 w-3" /> {ALGO_SHORT[w]}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="border-t border-ink-700 bg-ink-850 px-3 py-2 text-xs text-slate-400">
            Better on {wins.adaptive} metric(s): <span style={{ color: ALGO_COLOR.adaptive }}>Adaptive</span> · {wins.multipath} metric(s):{' '}
            <span style={{ color: ALGO_COLOR.multipath }}>Multipath</span>. Rows marked — describe behaviour rather than quality.
            {reasons.length > 0 && (
              <div className="mt-1.5">
                Drops by cause:{' '}
                {reasons.map((r) => (
                  <span key={r} className="mr-3">
                    {DROP_REASON_LABEL[r]}: <span className="font-mono text-slate-200">{a.metrics.dropsByReason[r] ?? 0}</span> /{' '}
                    <span className="font-mono text-slate-200">{m.metrics.dropsByReason[r] ?? 0}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <ChartCard title="Delivery and loss" subtitle="Percent of packets sent">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={bars} margin={{ top: 6, right: 8, bottom: 0, left: 0 }} barGap={2}>
                <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" stroke={COLORS.axis} tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} />
                <YAxis stroke={COLORS.axis} tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} width={36} domain={[0, 100]} />
                <Tooltip contentStyle={{ background: '#111a2e', border: '1px solid #3a4a6b', borderRadius: 8, fontSize: 12 }} cursor={{ fill: 'rgba(148,163,184,0.06)' }} formatter={(v: number, n: string) => [`${v.toFixed(1)}%`, ALGO_SHORT[n as Algorithm]]} />
                <Legend formatter={(v) => <span className="text-xs text-slate-300">{ALGO_SHORT[v as Algorithm]}</span>} />
                <Bar dataKey="adaptive" fill={ALGO_COLOR.adaptive} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="multipath" fill={ALGO_COLOR.multipath} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Delay and recovery" subtitle="Simulated milliseconds (0 = not applicable)">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={delayBars} margin={{ top: 6, right: 8, bottom: 0, left: 0 }} barGap={2}>
                <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" stroke={COLORS.axis} tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} />
                <YAxis stroke={COLORS.axis} tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} width={36} />
                <Tooltip contentStyle={{ background: '#111a2e', border: '1px solid #3a4a6b', borderRadius: 8, fontSize: 12 }} cursor={{ fill: 'rgba(148,163,184,0.06)' }} formatter={(v: number, n: string) => [`${v.toFixed(2)} ms`, ALGO_SHORT[n as Algorithm]]} />
                <Legend formatter={(v) => <span className="text-xs text-slate-300">{ALGO_SHORT[v as Algorithm]}</span>} />
                <Bar dataKey="adaptive" fill={ALGO_COLOR.adaptive} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="multipath" fill={ALGO_COLOR.multipath} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Delivery ratio over time" className="sm:col-span-2">
            <TimeChart engines={seriesEngines} pick={(p) => p.pdr} unit="%" yLabel="PDR (%)" failures={failures} domain={[0, 100]} />
          </ChartCard>
        </div>
      </div>
    </div>
  );
}
