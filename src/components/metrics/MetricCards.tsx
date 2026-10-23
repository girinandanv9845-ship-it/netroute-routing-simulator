import { Activity, ArrowDownToLine, Gauge, HeartPulse, Network, PackageCheck, PackageX, Send, Timer, TrendingDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { isLinkUsable, routerMap } from '../../engine/graph';
import { useSim, type EngineSnapshot } from '../../store/simulationStore';
import type { Metrics } from '../../types/simulation';
import { fmtKbps, fmtMs, fmtPct } from '../../utils/formatting';
import { ALGO_COLOR, ALGO_SHORT } from '../common/theme';
import { Tooltip } from '../common/Tooltip';

interface CardDef {
  label: string;
  icon: ReactNode;
  kind: 'current' | 'cumulative';
  tip: string;
  value: (m: Metrics | null) => string;
  tone?: (m: Metrics | null) => string;
}

function recoveryText(m: Metrics | null): string {
  if (!m) return 'N/A';
  switch (m.latestRecoveryState) {
    case 'none':
      return 'No failure';
    case 'pending':
      return 'Pending';
    case 'not_recovered':
      return 'Not recovered';
    case 'recovered':
      return fmtMs(m.latestRecoveryMs);
  }
}

const CARDS: CardDef[] = [
  { label: 'Packets sent', icon: <Send className="h-4 w-4" />, kind: 'cumulative', tip: 'Packets generated and injected at the source. Every sent packet ends as delivered or dropped.', value: (m) => String(m?.sent ?? 0) },
  { label: 'Delivered', icon: <PackageCheck className="h-4 w-4" />, kind: 'cumulative', tip: 'Packets that reached the destination (counted exactly once).', value: (m) => String(m?.delivered ?? 0), tone: () => 'text-emerald-300' },
  { label: 'Dropped', icon: <PackageX className="h-4 w-4" />, kind: 'cumulative', tip: 'Packets lost: failed link/router, next hop down before convergence, no route, buffer overflow or congestion loss.', value: (m) => String(m?.dropped ?? 0), tone: (m) => (m && m.dropped > 0 ? 'text-red-300' : '') },
  { label: 'Delivery ratio', icon: <Gauge className="h-4 w-4" />, kind: 'cumulative', tip: 'PDR = delivered ÷ sent × 100. In-flight packets count as not yet delivered.', value: (m) => fmtPct(m?.pdr ?? null), tone: (m) => (m?.pdr == null ? '' : m.pdr >= 95 ? 'text-emerald-300' : m.pdr >= 80 ? 'text-amber-300' : 'text-red-300') },
  { label: 'Loss rate', icon: <TrendingDown className="h-4 w-4" />, kind: 'cumulative', tip: 'Packet loss rate = dropped ÷ sent × 100.', value: (m) => fmtPct(m?.lossRate ?? null) },
  { label: 'Avg delay', icon: <Timer className="h-4 w-4" />, kind: 'cumulative', tip: 'Mean end-to-end delay of delivered packets (simulated ms): Σ(arrival − creation) ÷ delivered.', value: (m) => fmtMs(m?.avgDelayMs ?? null) },
  { label: 'Throughput', icon: <ArrowDownToLine className="h-4 w-4" />, kind: 'cumulative', tip: 'Delivered payload bits ÷ measurement duration (first packet creation → now or completion).', value: (m) => fmtKbps(m?.throughputKbps ?? null) },
  { label: 'Recovery time', icon: <HeartPulse className="h-4 w-4" />, kind: 'current', tip: 'Simulated time from the latest traffic-affecting failure to the first delivery of a packet sent after it.', value: recoveryText, tone: (m) => (m?.latestRecoveryState === 'not_recovered' ? 'text-red-300' : m?.latestRecoveryState === 'pending' ? 'text-amber-300' : '') },
];

function Card({ def, engines }: { def: CardDef; engines: EngineSnapshot[] }) {
  const compare = engines.length > 1;
  return (
    <div className="panel flex min-w-0 flex-col gap-1 px-3 py-2.5">
      <div className="flex items-center justify-between gap-1 text-slate-400">
        <Tooltip content={def.tip} side="bottom">
          <span className="flex items-center gap-1.5 truncate text-[11px] font-semibold uppercase tracking-wider">
            {def.icon}
            {def.label}
          </span>
        </Tooltip>
      </div>
      {compare ? (
        <div className="flex flex-col">
          {engines.map((e) => (
            <div key={e.algorithm} className="flex items-baseline justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase" style={{ color: ALGO_COLOR[e.algorithm] }}>
                {ALGO_SHORT[e.algorithm]}
              </span>
              <span className={`font-mono text-sm font-semibold text-white ${def.tone?.(e.metrics) ?? ''}`}>{def.value(e.metrics)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className={`truncate font-mono text-xl font-semibold text-white ${def.tone?.(engines[0]?.metrics ?? null) ?? ''}`}>{def.value(engines[0]?.metrics ?? null)}</div>
      )}
      <span className={`text-[9px] font-semibold uppercase tracking-wider ${def.kind === 'current' ? 'text-cyan-500/80' : 'text-slate-600'}`}>{def.kind === 'current' ? 'current state' : 'cumulative'}</span>
    </div>
  );
}

export function MetricCards() {
  const engines = useSim((s) => s.engines);
  const network = useSim((s) => s.network);
  const rm = routerMap(network);
  const online = network.routers.filter((r) => r.status === 'online').length;
  const activeLinks = network.links.filter((l) => isLinkUsable(network, l, rm)).length;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 xl:grid-cols-10">
      <div className="panel flex flex-col gap-1 px-3 py-2.5">
        <div className="flex items-center justify-between text-slate-400">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider">
            <Network className="h-4 w-4" /> Routers
          </span>
        </div>
        <div className={`font-mono text-xl font-semibold ${online < network.routers.length ? 'text-amber-300' : 'text-white'}`}>
          {online}
          <span className="text-sm text-slate-500"> / {network.routers.length} online</span>
        </div>
        <span className="text-[9px] font-semibold uppercase tracking-wider text-cyan-500/80">current state</span>
      </div>
      <div className="panel flex flex-col gap-1 px-3 py-2.5">
        <div className="flex items-center justify-between text-slate-400">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider">
            <Activity className="h-4 w-4" /> Links
          </span>
        </div>
        <div className={`font-mono text-xl font-semibold ${activeLinks < network.links.length ? 'text-amber-300' : 'text-white'}`}>
          {activeLinks}
          <span className="text-sm text-slate-500"> / {network.links.length} active</span>
        </div>
        <span className="text-[9px] font-semibold uppercase tracking-wider text-cyan-500/80">current state</span>
      </div>
      {CARDS.map((c) => (
        <Card key={c.label} def={c} engines={engines} />
      ))}
    </div>
  );
}
