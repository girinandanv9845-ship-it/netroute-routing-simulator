import { Activity, Crosshair, Link2, Link2Off, MousePointerClick, ServerCog, ServerCrash, Target, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import {
  availableBandwidthMbps,
  congestionLossProbability,
  congestionMultiplier,
  effectiveCost,
  hopDelayMs,
  linkDisplayStatus,
  queueingDelayMs,
  transmissionDelayMs,
} from '../../engine/graph';
import { useCanvasEngine, useSim } from '../../store/simulationStore';
import type { Link, Router } from '../../types/network';
import { StatusBadge } from '../common/StatusBadge';

const Row = ({ k, v, mono = true }: { k: string; v: ReactNode; mono?: boolean }) => (
  <div className="flex items-baseline justify-between gap-3 border-b border-ink-700/50 py-1 text-xs last:border-0">
    <span className="text-slate-400">{k}</span>
    <span className={`text-right text-slate-100 ${mono ? 'font-mono' : ''}`}>{v}</span>
  </div>
);

function RouterInspector({ router }: { router: Router }) {
  const network = useSim((s) => s.network);
  const config = useSim((s) => s.config);
  const status = useSim((s) => s.status);
  const engine = useCanvasEngine();
  const { inject, removeRouter, updateConfig } = useSim.getState();
  const links = network.links.filter((l) => l.source === router.id || l.target === router.id);
  const neighbours = links.map((l) => (l.source === router.id ? l.target : l.source));
  const role = router.id === config.source ? 'Source' : router.id === config.destination ? 'Destination' : 'Intermediate router';
  const onPaths = engine?.currentPaths.filter((p) => p.nodes.includes(router.id)).length ?? 0;
  const failed = router.status === 'failed';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-xl font-semibold text-white">{router.id}</div>
          <div className="text-xs text-slate-400">
            {router.name} · {role}
          </div>
        </div>
        <StatusBadge tone={failed ? 'red' : 'green'} dot pulse={!failed}>
          {failed ? 'Failed' : 'Online'}
        </StatusBadge>
      </div>
      <div className="rounded-lg border border-ink-600 bg-ink-850 px-3 py-1.5">
        <Row k="Degree (attached links)" v={links.length} />
        <Row k="Neighbours" v={neighbours.join(', ') || 'none'} />
        <Row k="Usable links" v={links.filter((l) => linkDisplayStatus(network, l) !== 'failed' && linkDisplayStatus(network, l) !== 'down').length} />
        <Row k="On active route(s)" v={engine ? onPaths : 'not running'} />
        <Row k="Position" v={`${Math.round(router.position.x)}, ${Math.round(router.position.y)}`} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {failed ? (
          <button className="btn-success col-span-2" onClick={() => inject({ type: 'restore_router', routerId: router.id })}>
            <ServerCog className="h-4 w-4" /> Restore Router
          </button>
        ) : (
          <button className="btn-danger col-span-2" onClick={() => inject({ type: 'fail_router', routerId: router.id })}>
            <ServerCrash className="h-4 w-4" /> Fail Router
          </button>
        )}
        <button className="btn-ghost text-xs" disabled={status !== 'ready' || router.id === config.source || router.id === config.destination} onClick={() => updateConfig({ source: router.id })}>
          <Crosshair className="h-3.5 w-3.5" /> Set source
        </button>
        <button className="btn-ghost text-xs" disabled={status !== 'ready' || router.id === config.destination || router.id === config.source} onClick={() => updateConfig({ destination: router.id })}>
          <Target className="h-3.5 w-3.5" /> Set destination
        </button>
        <button
          className="btn-ghost col-span-2 text-xs text-red-300"
          onClick={() => window.confirm(`Remove router ${router.id} and its ${links.length} link(s)? Routes through it will be recalculated.`) && removeRouter(router.id)}
        >
          <Trash2 className="h-3.5 w-3.5" /> Remove router
        </button>
      </div>
    </div>
  );
}

function LinkInspector({ link }: { link: Link }) {
  const network = useSim((s) => s.network);
  const config = useSim((s) => s.config);
  const engine = useCanvasEngine();
  const { inject, removeLink, editLink } = useSim.getState();
  const st = linkDisplayStatus(network, link);
  const [form, setForm] = useState({ baseCost: link.baseCost, bandwidthMbps: link.bandwidthMbps, delayMs: link.delayMs });
  const [level, setLevel] = useState(Math.round(link.congestion * 100));
  useEffect(() => {
    setForm({ baseCost: link.baseCost, bandwidthMbps: link.bandwidthMbps, delayMs: link.delayMs });
    setLevel(Math.round(link.congestion * 100));
  }, [link]);
  const stats = engine?.linkStats.find((s) => s.linkId === link.id);
  const util = stats && engine && engine.metrics.measurementMs > 0 ? (stats.busyMs / engine.metrics.measurementMs) * 100 : null;
  const usedBy = engine?.currentPaths.map((p, i) => (p.links.includes(link.id) ? i + 1 : 0)).filter(Boolean) ?? [];
  const tone = st === 'failed' || st === 'down' ? 'red' : st === 'congested' ? 'amber' : 'green';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-xl font-semibold text-white">
            {link.source}–{link.target}
          </div>
          <div className="text-xs text-slate-400">Bidirectional link</div>
        </div>
        <StatusBadge tone={tone} dot>
          {st === 'down' ? 'Down (router failed)' : st[0].toUpperCase() + st.slice(1)}
        </StatusBadge>
      </div>
      <div className="rounded-lg border border-ink-600 bg-ink-850 px-3 py-1.5">
        <Row k="Base cost" v={link.baseCost} />
        <Row k="Congestion level c" v={`${Math.round(link.congestion * 100)}%`} />
        <Row k="Multiplier M(c) = 1 + 4c" v={`× ${congestionMultiplier(link.congestion).toFixed(2)}`} />
        <Row k="Effective routing cost" v={<span className={link.congestion > 0 ? 'text-amber-200' : ''}>{effectiveCost(link).toFixed(2)}</span>} />
        <Row k="Bandwidth / available" v={`${link.bandwidthMbps} / ${availableBandwidthMbps(link).toFixed(2)} Mbps`} />
        <Row k="Propagation delay" v={`${link.delayMs} ms`} />
        <Row k={`Transmission (${config.payloadBytes} B)`} v={`${transmissionDelayMs(link, config.payloadBytes).toFixed(2)} ms`} />
        <Row k="Congestion queueing" v={`${queueingDelayMs(link.congestion).toFixed(2)} ms`} />
        <Row k="Per-hop delay estimate" v={`${hopDelayMs(link, config.payloadBytes).toFixed(2)} ms`} />
        <Row k="Congestion loss probability" v={`${(congestionLossProbability(link.congestion) * 100).toFixed(1)}%`} />
        <Row k="Packets carried" v={stats?.packets ?? 0} />
        <Row k="Bandwidth utilisation" v={util === null ? 'N/A' : `${util.toFixed(1)}%`} />
        <Row k="Queued now" v={stats?.queued ?? 0} />
        <Row k="Used by active path(s)" v={usedBy.length ? usedBy.map((i) => `P${i}`).join(', ') : 'no'} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {link.status === 'failed' ? (
          <button className="btn-success col-span-2" onClick={() => inject({ type: 'restore_link', linkId: link.id })}>
            <Link2 className="h-4 w-4" /> Restore Link
          </button>
        ) : (
          <button className="btn-danger col-span-2" onClick={() => inject({ type: 'fail_link', linkId: link.id })}>
            <Link2Off className="h-4 w-4" /> Disable Link
          </button>
        )}
      </div>

      <div>
        <span className="field-label">Congestion level</span>
        <div className="flex items-center gap-2">
          <input type="range" min={0} max={95} step={5} value={level} onChange={(e) => setLevel(Number(e.target.value))} className="flex-1" aria-label="Congestion level" />
          <span className="w-9 text-right font-mono text-xs text-slate-300">{level}%</span>
          <button className="btn-warn px-2 py-1 text-xs" onClick={() => inject({ type: 'set_congestion', linkId: link.id, level: level / 100 })}>
            <Activity className="h-3.5 w-3.5" /> Apply
          </button>
        </div>
      </div>

      <form
        className="rounded-lg border border-ink-600 bg-ink-850 p-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          editLink(link.id, form);
        }}
      >
        <span className="field-label">Edit link parameters</span>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ['baseCost', 'Cost'],
              ['bandwidthMbps', 'Mbps'],
              ['delayMs', 'Delay ms'],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="text-[10px] text-slate-500">
              {label}
              <input type="number" min={0.1} step={0.1} className="input mt-0.5 px-2 py-1 font-mono text-xs" value={form[k]} onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })} />
            </label>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <button type="submit" className="btn-primary flex-1 py-1 text-xs">
            Apply changes
          </button>
          <button type="button" className="btn-ghost py-1 text-xs text-red-300" onClick={() => window.confirm(`Remove link ${link.source}–${link.target}?`) && removeLink(link.id)}>
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
        </div>
      </form>
    </div>
  );
}

export function Inspector() {
  const selection = useSim((s) => s.selection);
  const network = useSim((s) => s.network);
  if (selection?.type === 'router') {
    const r = network.routers.find((x) => x.id === selection.id);
    if (r) return <RouterInspector router={r} />;
  }
  if (selection?.type === 'link') {
    const l = network.links.find((x) => x.id === selection.id);
    if (l) return <LinkInspector link={l} />;
  }
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center text-slate-500">
      <MousePointerClick className="h-7 w-7" />
      <p className="text-sm">Select a router or link on the canvas</p>
      <p className="max-w-[16rem] text-xs leading-relaxed">You can inspect its properties, fail or restore it, change congestion, edit link parameters, or remove it.</p>
    </div>
  );
}
