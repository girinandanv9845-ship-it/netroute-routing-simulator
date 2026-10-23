import { Activity, HeartPulse, Link2, Link2Off, ServerCrash, ServerCog, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CONGESTED_THRESHOLD, effectiveCost, linkLabel } from '../../engine/graph';
import { useSim } from '../../store/simulationStore';

export function EventInjectionPanel() {
  const network = useSim((s) => s.network);
  const selection = useSim((s) => s.selection);
  const status = useSim((s) => s.status);
  const { inject, restoreAll } = useSim.getState();

  const links = useMemo(() => [...network.links].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })), [network.links]);
  const routers = network.routers;

  const [linkId, setLinkId] = useState(links[0]?.id ?? '');
  const [routerId, setRouterId] = useState(routers[0]?.id ?? '');
  const [level, setLevel] = useState(70);

  // Follow canvas selection.
  useEffect(() => {
    if (selection?.type === 'link') setLinkId(selection.id);
    if (selection?.type === 'router') setRouterId(selection.id);
  }, [selection]);

  const link = network.links.find((l) => l.id === linkId);
  const router = routers.find((r) => r.id === routerId);
  useEffect(() => {
    if (link) setLevel(Math.round(link.congestion * 100) || 70);
  }, [link?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const failedLinks = network.links.filter((l) => l.status === 'failed').length;
  const failedRouters = routers.filter((r) => r.status === 'failed').length;
  const congested = network.links.filter((l) => l.congestion >= CONGESTED_THRESHOLD).length;
  const previewLink = link ? { ...link, congestion: level / 100 } : null;

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-lg border border-ink-600 bg-ink-850 px-3 py-2 text-[11px] leading-relaxed text-slate-400">
        Inject events {status === 'running' ? 'while packets are flowing' : 'before or during a run'}. You can also click a link or router on the canvas. Multiple simultaneous failures are allowed.
      </p>

      <section>
        <h3 className="field-label flex items-center gap-1.5">
          <Link2Off className="h-3.5 w-3.5" /> Link failure / recovery
        </h3>
        <select className="input mb-2" value={linkId} onChange={(e) => setLinkId(e.target.value)}>
          {links.map((l) => (
            <option key={l.id} value={l.id}>
              {linkLabel(l)} · {l.status === 'failed' ? 'FAILED' : l.congestion >= CONGESTED_THRESHOLD ? `congested ${Math.round(l.congestion * 100)}%` : 'active'}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-danger" disabled={!link || link.status === 'failed'} onClick={() => inject({ type: 'fail_link', linkId })}>
            <Link2Off className="h-4 w-4" /> Disable Link
          </button>
          <button className="btn-success" disabled={!link || link.status !== 'failed'} onClick={() => inject({ type: 'restore_link', linkId })}>
            <Link2 className="h-4 w-4" /> Restore Link
          </button>
        </div>
      </section>

      <section>
        <h3 className="field-label flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5" /> Congestion
        </h3>
        <div className="mb-1 flex items-center gap-3">
          <input type="range" min={0} max={95} step={5} value={level} onChange={(e) => setLevel(Number(e.target.value))} className="flex-1" aria-label="Congestion level" />
          <span className={`w-10 text-right font-mono text-sm ${level >= 25 ? 'text-amber-300' : 'text-slate-300'}`}>{level}%</span>
        </div>
        {previewLink && (
          <p className="mb-2 font-mono text-[11px] text-slate-500">
            effective cost {link!.baseCost} × (1 + 4·{(level / 100).toFixed(2)}) = <span className="text-amber-200">{effectiveCost(previewLink).toFixed(2)}</span>
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-warn" disabled={!link} onClick={() => inject({ type: 'set_congestion', linkId, level: level / 100 })}>
            <Activity className="h-4 w-4" /> Apply Congestion
          </button>
          <button className="btn-ghost" disabled={!link || link.congestion === 0} onClick={() => inject({ type: 'set_congestion', linkId, level: 0 })}>
            Clear
          </button>
        </div>
      </section>

      <section>
        <h3 className="field-label flex items-center gap-1.5">
          <ServerCrash className="h-3.5 w-3.5" /> Router failure / recovery
        </h3>
        <select className="input mb-2" value={routerId} onChange={(e) => setRouterId(e.target.value)}>
          {routers.map((r) => (
            <option key={r.id} value={r.id}>
              {r.id} · {r.status === 'failed' ? 'FAILED' : 'online'}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-danger" disabled={!router || router.status === 'failed'} onClick={() => inject({ type: 'fail_router', routerId })}>
            <ServerCrash className="h-4 w-4" /> Fail Router
          </button>
          <button className="btn-success" disabled={!router || router.status !== 'failed'} onClick={() => inject({ type: 'restore_router', routerId })}>
            <ServerCog className="h-4 w-4" /> Restore Router
          </button>
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
          Recovery policy: a restored router brings back its attached links unless those links were failed independently.
        </p>
      </section>

      <section className="rounded-lg border border-ink-600 bg-ink-850 p-3">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-semibold text-slate-300">
            <HeartPulse className="h-3.5 w-3.5" /> Network health
          </span>
        </div>
        <div className="mb-2 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className={`font-mono text-lg ${failedLinks ? 'text-red-300' : 'text-slate-200'}`}>{failedLinks}</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">failed links</div>
          </div>
          <div>
            <div className={`font-mono text-lg ${failedRouters ? 'text-red-300' : 'text-slate-200'}`}>{failedRouters}</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">failed routers</div>
          </div>
          <div>
            <div className={`font-mono text-lg ${congested ? 'text-amber-300' : 'text-slate-200'}`}>{congested}</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">congested</div>
          </div>
        </div>
        <button className="btn-ghost w-full" onClick={restoreAll} disabled={!failedLinks && !failedRouters && !network.links.some((l) => l.congestion > 0)}>
          <Wrench className="h-4 w-4" /> Restore Entire Network
        </button>
      </section>
    </div>
  );
}
