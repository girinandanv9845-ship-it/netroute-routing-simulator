import { BaseEdge, EdgeLabelRenderer, type Edge, type EdgeProps } from '@xyflow/react';
import { memo } from 'react';
import { effectiveCost } from '../../engine/graph';
import { useSim } from '../../store/simulationStore';
import type { Link, LinkDisplayStatus } from '../../types/network';

export type LinkEdgeData = {
  link: Link;
  status: LinkDisplayStatus;
  /** Routes using this link: colour and whether the route runs target→source. */
  highlights: { color: string; reverse: boolean }[];
  isSelected: boolean;
  utilization: number | null;
  packets: number;
  animate: boolean;
};

export type LinkFlowEdge = Edge<LinkEdgeData, 'link'>;

const STATUS_COLOR: Record<LinkDisplayStatus, string> = {
  active: '#3a4a6b',
  congested: '#f59e0b',
  failed: '#ef4444',
  down: '#7f1d1d',
};

function NetworkEdgeView({ id, sourceX, sourceY, targetX, targetY, data }: EdgeProps<LinkFlowEdge>) {
  const select = useSim((s) => s.select);
  if (!data) return null;
  const { link, status, highlights, isSelected, utilization, packets, animate } = data;
  const path = `M ${sourceX},${sourceY} L ${targetX},${targetY}`;
  const revPath = `M ${targetX},${targetY} L ${sourceX},${sourceY}`;
  const mx = (sourceX + targetX) / 2;
  const my = (sourceY + targetY) / 2;
  const dead = status === 'failed' || status === 'down';
  const eff = effectiveCost(link);
  const color = STATUS_COLOR[status];

  // Perpendicular offset so several highlighted routes on one link stay visible.
  const len = Math.hypot(targetX - sourceX, targetY - sourceY) || 1;
  const nx = -(targetY - sourceY) / len;
  const ny = (targetX - sourceX) / len;

  return (
    <>
      {isSelected && <path d={path} stroke="#22d3ee" strokeOpacity={0.35} strokeWidth={14} fill="none" strokeLinecap="round" />}
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={18}
        style={{
          stroke: color,
          strokeWidth: status === 'congested' ? 3.5 : dead ? 2 : 2.5,
          strokeDasharray: dead ? '6 6' : undefined,
          opacity: status === 'down' ? 0.6 : 1,
        }}
      />
      {!dead &&
        highlights.map((h, i) => {
          const off = (i - (highlights.length - 1) / 2) * 5;
          return (
            <g key={i} transform={`translate(${nx * off}, ${ny * off})`}>
              <path d={h.reverse ? revPath : path} stroke={h.color} strokeOpacity={0.18} strokeWidth={9} fill="none" strokeLinecap="round" />
              <path
                d={h.reverse ? revPath : path}
                stroke={h.color}
                strokeWidth={2.5}
                fill="none"
                strokeDasharray="8 4"
                className={animate ? 'edge-flow' : undefined}
                strokeLinecap="round"
              />
            </g>
          );
        })}
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto absolute"
          style={{ transform: `translate(-50%, -50%) translate(${mx}px, ${my}px)` }}
          onClick={() => select({ type: 'link', id: link.id })}
          title={`Link ${link.source}–${link.target}\nStatus: ${status}\nBase cost: ${link.baseCost}  Effective cost: ${eff.toFixed(2)}\nBandwidth: ${link.bandwidthMbps} Mbps  Delay: ${link.delayMs} ms\nCongestion: ${Math.round(link.congestion * 100)}%\nPackets carried: ${packets}${utilization !== null ? `  Utilisation: ${(utilization * 100).toFixed(1)}%` : ''}`}
        >
          <div
            className={`rounded-md border px-1.5 py-[1px] font-mono text-[10px] font-semibold leading-tight shadow ${
              dead
                ? 'border-red-500/60 bg-red-950/90 text-red-300'
                : status === 'congested'
                  ? 'border-amber-500/60 bg-amber-950/90 text-amber-200'
                  : isSelected
                    ? 'border-cyan-400/70 bg-ink-800 text-cyan-200'
                    : 'border-ink-500 bg-ink-900/95 text-slate-400'
            }`}
          >
            {dead ? '✕ ' + (status === 'failed' ? 'FAILED' : 'DOWN') : status === 'congested' ? `${link.baseCost}→${eff.toFixed(1)}` : link.baseCost}
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const NetworkEdge = memo(NetworkEdgeView);
