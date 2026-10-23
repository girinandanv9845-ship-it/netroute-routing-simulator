import { ViewportPortal } from '@xyflow/react';
import { useMemo } from 'react';
import { FADE_DELIVERED_MS, FADE_DROPPED_MS } from '../../engine/packetEngine';
import { useFrame } from '../../store/frameStore';
import { getRunner, useSim } from '../../store/simulationStore';
import type { Packet } from '../../types/packet';
import { COLORS, pathColor } from '../common/theme';

interface Drawn {
  key: string;
  x: number;
  y: number;
  color: string;
  kind: 'moving' | 'queued' | 'delivered' | 'dropped';
  age: number;
  label: string;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Draws every simulated packet of the engine shown on the canvas. Positions are derived
 * from the packet's simulated state (link, departure and arrival time), never the reverse,
 * so the animation can't contradict the simulation.
 */
export function PacketLayer() {
  useFrame((s) => s.frame);
  const network = useSim((s) => s.network);
  const canvasAlgorithm = useSim((s) => s.canvasAlgorithm);
  const status = useSim((s) => s.status);

  const pos = useMemo(() => new Map(network.routers.map((r) => [r.id, r.position])), [network]);

  const runner = getRunner();
  const engine = runner.engines.find((e) => e.algorithm === canvasAlgorithm) ?? runner.engines[0];
  if (!engine || status === 'ready') return null;

  const now = engine.time;
  const drawn: Drawn[] = [];
  const queueSlots = new Map<string, number>();

  const colorOf = (p: Packet) => {
    if (p.congested) return COLORS.amber;
    return engine.algorithm === 'adaptive' ? COLORS.cyan : pathColor(p.pathIndex);
  };

  const pointOnLink = (p: Packet, t: number) => {
    const a = pos.get(p.fromRouter ?? '');
    const b = pos.get(p.route[p.hop + 1]);
    if (!a || !b) return null;
    const span = p.arriveAt - p.departAt;
    const f = span > 0 ? clamp01((t - p.departAt) / span) : 1;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  };

  for (const p of engine.visiblePackets()) {
    const label = `${p.id} · seq ${p.seq + 1} · ${p.status.replace('_', ' ')}${p.dropReason ? ` (${p.dropReason.replace(/_/g, ' ')})` : ''}`;
    if (p.status === 'in_transit') {
      const pt = pointOnLink(p, now);
      if (pt) drawn.push({ key: p.id, ...pt, color: colorOf(p), kind: 'moving', age: 0, label });
    } else if (p.status === 'queued' || p.status === 'created') {
      const c = pos.get(p.location);
      if (!c) continue;
      const slot = queueSlots.get(p.location) ?? 0;
      queueSlots.set(p.location, slot + 1);
      if (slot >= 12) continue;
      const ang = -Math.PI / 2 + slot * (Math.PI / 6);
      drawn.push({ key: p.id, x: c.x + Math.cos(ang) * 38, y: c.y + Math.sin(ang) * 38, color: colorOf(p), kind: 'queued', age: 0, label });
    } else if (p.status === 'delivered') {
      const c = pos.get(p.destination);
      if (c) drawn.push({ key: p.id, ...c, color: COLORS.green, kind: 'delivered', age: clamp01((now - (p.arrivedAt ?? now)) / FADE_DELIVERED_MS), label });
    } else if (p.status === 'dropped') {
      const pt = p.linkId ? pointOnLink(p, p.droppedAt ?? now) : pos.get(p.location);
      if (pt) drawn.push({ key: p.id, x: pt.x, y: pt.y, color: COLORS.red, kind: 'dropped', age: clamp01((now - (p.droppedAt ?? now)) / FADE_DROPPED_MS), label });
    }
  }

  return (
    <ViewportPortal>
      <svg style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'visible', pointerEvents: 'none', zIndex: 5 }}>
        {drawn.map((d) => {
          if (d.kind === 'delivered') {
            return <circle key={d.key} cx={d.x} cy={d.y} r={30 + d.age * 22} fill="none" stroke={d.color} strokeWidth={2.5} opacity={0.8 * (1 - d.age)} />;
          }
          if (d.kind === 'dropped') {
            const s = 6 + d.age * 4;
            return (
              <g key={d.key} opacity={1 - d.age} transform={`translate(${d.x}, ${d.y})`}>
                <circle r={10 + d.age * 14} fill={d.color} opacity={0.2} />
                <path d={`M ${-s} ${-s} L ${s} ${s} M ${s} ${-s} L ${-s} ${s}`} stroke={d.color} strokeWidth={3} strokeLinecap="round" />
              </g>
            );
          }
          const r = d.kind === 'queued' ? 4.5 : 7;
          return (
            <g key={d.key} transform={`translate(${d.x}, ${d.y})`}>
              <title>{d.label}</title>
              <circle r={r + 6} fill={d.color} opacity={0.22} />
              <circle r={r} fill={d.color} stroke="#f8fafc" strokeWidth={1.6} opacity={d.kind === 'queued' ? 0.8 : 1} />
              {d.kind === 'moving' && <circle r={r * 0.35} fill="#f8fafc" />}
            </g>
          );
        })}
      </svg>
    </ViewportPortal>
  );
}

