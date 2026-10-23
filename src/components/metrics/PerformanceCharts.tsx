import { BarChart3 } from 'lucide-react';
import { memo, useMemo, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatPath } from '../../engine/graph';
import { useSim, type EngineSnapshot } from '../../store/simulationStore';
import type { Algorithm, SeriesPoint } from '../../types/simulation';
import { fmtMs } from '../../utils/formatting';
import { ALGO_COLOR, ALGO_SHORT, COLORS, pathColor } from '../common/theme';

const axisProps = { stroke: COLORS.axis, tick: { fill: '#94a3b8', fontSize: 11 }, tickLine: false, axisLine: { stroke: '#26334f' } };
const tooltipStyle = {
  contentStyle: { background: '#111a2e', border: '1px solid #3a4a6b', borderRadius: 8, fontSize: 12, color: '#e2e8f0' },
  labelStyle: { color: '#94a3b8', marginBottom: 4 },
  itemStyle: { padding: 0 },
  cursor: { stroke: '#3a4a6b', strokeWidth: 1 },
};

export function ChartCard({ title, subtitle, children, className = '' }: { title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-ink-600/70 bg-ink-850 p-3 ${className}`}>
      <div className="mb-2">
        <h4 className="text-[13px] font-semibold text-slate-200">{title}</h4>
        {subtitle && <p className="text-[11px] text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function EmptyChart({ text = 'Start a simulation to collect data.' }: { text?: string }) {
  return <div className="flex h-[190px] items-center justify-center rounded border border-dashed border-ink-600 text-xs text-slate-500">{text}</div>;
}

/** Merge per-algorithm time series into rows keyed by simulated time. */
export function mergeSeries(engines: { algorithm: Algorithm; series: SeriesPoint[] }[], pick: (p: SeriesPoint) => number | null) {
  const rows = new Map<number, Record<string, number | null>>();
  for (const e of engines) {
    for (const p of e.series) {
      const row = rows.get(p.t) ?? { t: p.t };
      row[e.algorithm] = pick(p);
      rows.set(p.t, row);
    }
  }
  return [...rows.values()].sort((a, b) => (a.t as number) - (b.t as number));
}

export function TimeChart({
  engines,
  pick,
  unit,
  yLabel,
  failures,
  domain,
}: {
  engines: { algorithm: Algorithm; series: SeriesPoint[] }[];
  pick: (p: SeriesPoint) => number | null;
  unit: string;
  yLabel: string;
  failures: { time: number; label: string }[];
  domain?: [number, number];
}) {
  const data = useMemo(() => mergeSeries(engines, pick), [engines, pick]);
  if (data.length < 2) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={190}>
      <LineChart data={data} margin={{ top: 6, right: 12, bottom: 14, left: 0 }}>
        <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} {...axisProps} tickFormatter={(v) => `${Math.round(v)}`} label={{ value: 'Simulated time (ms)', position: 'insideBottom', offset: -6, fill: '#64748b', fontSize: 10 }} />
        <YAxis {...axisProps} width={46} domain={domain ?? [0, 'auto']} label={{ value: yLabel, angle: -90, position: 'insideLeft', offset: 12, fill: '#64748b', fontSize: 10, style: { textAnchor: 'middle' } }} />
        <Tooltip {...tooltipStyle} labelFormatter={(v) => `t = ${Number(v).toFixed(1)} ms`} formatter={(v: number, name: string) => [v === null || v === undefined ? 'N/A' : `${Number(v).toFixed(1)} ${unit}`, ALGO_SHORT[name as Algorithm] ?? name]} />
        {engines.length > 1 && <Legend formatter={(v) => <span className="text-xs text-slate-300">{ALGO_SHORT[v as Algorithm]}</span>} iconType="plainline" wrapperStyle={{ paddingTop: 4 }} />}
        {failures.map((f, i) => (
          <ReferenceLine key={i} x={f.time} stroke={COLORS.red} strokeDasharray="4 3" strokeOpacity={0.7} label={{ value: f.label, fill: '#fca5a5', fontSize: 9, position: 'insideTopRight' }} />
        ))}
        {engines.map((e) => (
          <Line key={e.algorithm} dataKey={e.algorithm} stroke={ALGO_COLOR[e.algorithm]} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls activeDot={{ r: 4, stroke: '#0a0f1c', strokeWidth: 2 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

const pickPdr = (p: SeriesPoint) => p.pdr;
const pickThroughput = (p: SeriesPoint) => p.throughputKbps;
const pickDelay = (p: SeriesPoint) => p.windowDelayMs;
const pickDropped = (p: SeriesPoint) => p.dropped;

function failureMarkers(engines: EngineSnapshot[]) {
  const e = engines[0];
  if (!e) return [];
  return e.recoveries.map((r, i) => ({ time: r.time, label: `F${i + 1}` }));
}

function PathDistribution({ engine }: { engine: EngineSnapshot }) {
  const data = engine.pathStats
    .filter((p) => p.assigned > 0 || p.active)
    .map((p, i) => ({ name: `${engine.algorithm === 'multipath' ? `P${p.index + 1}` : `Route ${i + 1}`}`, route: formatPath(p.nodes), delivered: p.delivered, dropped: p.dropped, inflight: Math.max(0, p.assigned - p.delivered - p.dropped), color: engine.algorithm === 'multipath' ? pathColor(p.index) : ALGO_COLOR.adaptive }));
  if (!data.length) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={190}>
      <BarChart data={data} margin={{ top: 6, right: 12, bottom: 14, left: 0 }} barCategoryGap="25%">
        <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" {...axisProps} />
        <YAxis {...axisProps} width={46} allowDecimals={false} label={{ value: 'Packets', angle: -90, position: 'insideLeft', offset: 12, fill: '#64748b', fontSize: 10, style: { textAnchor: 'middle' } }} />
        <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(148,163,184,0.06)' }} labelFormatter={(_l, p) => (p?.[0] ? `${p[0].payload.name}: ${p[0].payload.route}` : '')} />
        <Legend formatter={(v) => <span className="text-xs text-slate-300">{v}</span>} wrapperStyle={{ paddingTop: 4 }} />
        <Bar dataKey="delivered" name="Delivered" stackId="a" fill="#16a34a" stroke="#111a2e" strokeWidth={2} isAnimationActive={false} />
        <Bar dataKey="dropped" name="Dropped" stackId="a" fill="#dc2626" stroke="#111a2e" strokeWidth={2} isAnimationActive={false} />
        <Bar dataKey="inflight" name="In flight" stackId="a" fill="#475569" stroke="#111a2e" strokeWidth={2} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function LinkUtilization({ engine }: { engine: EngineSnapshot }) {
  const m = engine.metrics.measurementMs;
  const data = engine.linkStats
    .filter((l) => l.packets > 0)
    .map((l) => ({ name: l.linkId.replace('-', '–'), util: m > 0 ? Math.min(100, (l.busyMs / m) * 100) : 0, packets: l.packets }))
    .sort((a, b) => b.packets - a.packets)
    .slice(0, 10);
  if (!data.length) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={190}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 14, left: 8 }}>
        <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" {...axisProps} allowDecimals={false} label={{ value: 'Packets carried', position: 'insideBottom', offset: -6, fill: '#64748b', fontSize: 10 }} />
        <YAxis type="category" dataKey="name" {...axisProps} width={58} tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} />
        <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(148,163,184,0.06)' }} formatter={(v: number, n: string, item) => (n === 'Packets carried' ? [`${v} packets · bandwidth utilisation ${item.payload.util.toFixed(1)}%`, n] : [v, n])} />
        <Bar dataKey="packets" name="Packets carried" fill={ALGO_COLOR[engine.algorithm]} radius={[0, 4, 4, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function RecoveryTable({ engines }: { engines: EngineSnapshot[] }) {
  const rows = engines.flatMap((e) => e.recoveries.map((r, i) => ({ ...r, idx: i + 1, algorithm: e.algorithm })));
  if (!rows.length) return <EmptyChart text="No failure events yet. Inject a link or router failure to measure recovery." />;
  return (
    <div className="scroll-thin max-h-[190px] overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-ink-850 text-left text-[10px] uppercase tracking-wider text-slate-500">
          <tr>
            <th className="py-1 pr-2">#</th>
            {engines.length > 1 && <th className="pr-2">Algo</th>}
            <th className="pr-2">Failure</th>
            <th className="pr-2 text-right">At</th>
            <th className="pr-2 text-right">Lost</th>
            <th className="text-right">Recovery</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.algorithm}-${r.id}`} className="border-t border-ink-700/60">
              <td className="py-1 pr-2 font-mono text-red-300">F{r.idx}</td>
              {engines.length > 1 && (
                <td className="pr-2 font-semibold" style={{ color: ALGO_COLOR[r.algorithm] }}>
                  {ALGO_SHORT[r.algorithm]}
                </td>
              )}
              <td className="pr-2 text-slate-300">
                {r.event}
                {!r.impactedTraffic && <span className="ml-1 text-slate-500">(no active traffic affected)</span>}
              </td>
              <td className="pr-2 text-right font-mono text-slate-400">{r.time.toFixed(0)} ms</td>
              <td className="pr-2 text-right font-mono text-slate-300">{r.packetsLost}</td>
              <td className={`text-right font-mono ${r.recoveryMs === null ? 'text-amber-300' : 'text-emerald-300'}`}>{r.recoveryMs === null ? 'not yet' : fmtMs(r.recoveryMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] leading-snug text-slate-500">Recovery = time from the failure to the first delivery of a packet sent after it. "Lost" counts drops between failure and recovery.</p>
    </div>
  );
}

function PerformanceChartsView() {
  const engines = useSim((s) => s.engines);
  const canvasAlgorithm = useSim((s) => s.canvasAlgorithm);
  const focus = engines.find((e) => e.algorithm === canvasAlgorithm) ?? engines[0];
  const failures = failureMarkers(engines);

  if (!engines.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-slate-500">
        <BarChart3 className="h-8 w-8" />
        <p className="text-sm">Performance charts appear once a simulation starts.</p>
        <p className="text-xs">All values are computed from recorded packet events; nothing is estimated or randomised.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
      <ChartCard title="Packet delivery ratio over time" subtitle="Cumulative delivered ÷ sent (%). Red markers = failure events.">
        <TimeChart engines={engines} pick={pickPdr} unit="%" yLabel="PDR (%)" failures={failures} domain={[0, 100]} />
      </ChartCard>
      <ChartCard title="Throughput over time" subtitle="Delivered payload in a trailing 50 ms window (kbit/s)">
        <TimeChart engines={engines} pick={pickThroughput} unit="kbps" yLabel="kbit/s" failures={failures} />
      </ChartCard>
      <ChartCard title="End-to-end delay" subtitle="Mean delay of packets delivered in the trailing 50 ms window">
        <TimeChart engines={engines} pick={pickDelay} unit="ms" yLabel="Delay (ms)" failures={failures} />
      </ChartCard>
      <ChartCard title="Cumulative packet loss" subtitle="Dropped packets over time">
        <TimeChart engines={engines} pick={pickDropped} unit="pkts" yLabel="Dropped" failures={failures} />
      </ChartCard>
      <ChartCard title={`Route utilisation — ${ALGO_SHORT[focus.algorithm]}`} subtitle="Packets per assigned route (delivered / dropped / in flight)">
        <PathDistribution engine={focus} />
      </ChartCard>
      <ChartCard title={`Busiest links — ${ALGO_SHORT[focus.algorithm]}`} subtitle="Packet counts; hover for bandwidth utilisation (busy time ÷ duration)">
        <LinkUtilization engine={focus} />
      </ChartCard>
      <ChartCard title="Routing recovery after failure" subtitle="Simulated recovery time per failure event" className="md:col-span-2 2xl:col-span-3">
        <RecoveryTable engines={engines} />
      </ChartCard>
    </div>
  );
}

export const PerformanceCharts = memo(PerformanceChartsView);
