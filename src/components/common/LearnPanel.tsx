import { BookOpen, Radio } from 'lucide-react';
import { useState } from 'react';
import { formatPath } from '../../engine/graph';
import { useCanvasEngine, useSim } from '../../store/simulationStore';
import { DROP_REASON_LABEL, type DropReason } from '../../types/packet';
import { fmtKbps, fmtMs, fmtPct } from '../../utils/formatting';
import { explainReroute } from '../routing/PathDetails';
import { Modal } from './Modal';

const CONCEPTS: { title: string; body: string }[] = [
  { title: 'Network topology', body: 'The arrangement of routers and links, modelled as a graph G = (V, E): routers are vertices V, links are edges E. NETROUTE uses an undirected weighted graph; every link carries traffic in both directions.' },
  { title: 'Router and link', body: 'A router forwards packets toward their destination using a routing table (destination → next hop). A link connects two routers and has a cost, a bandwidth (Mbps) and a propagation delay (ms). A failed router cannot forward anything, so all of its links become unusable.' },
  { title: 'Link cost', body: 'A positive weight the routing algorithm minimises. Here effectiveCost = baseCost × M(c) with M(c) = 1 + 4c, where c is the congestion level (0–95 %). A link at 50 % congestion costs three times its base cost.' },
  { title: "Dijkstra's shortest-path algorithm", body: "Starting from the source with distance 0, Dijkstra repeatedly takes the unvisited router with the smallest known distance and relaxes its neighbours (dist[v] = min(dist[v], dist[u] + cost(u,v))). With positive costs, the first time a router is taken its distance is final. Failed links and routers are simply absent from the graph, so they can never be selected." },
  { title: 'Adaptive routing', body: 'Routes are not fixed: whenever the topology or link costs change, the routing engine recomputes the shortest path from its link-state view. NETROUTE models a convergence delay (default 15 ms) between a physical change and the moment routers use the new routes. Packets in flight are re-evaluated at their next router.' },
  { title: 'Multipath routing', body: 'Instead of one best route, the source keeps several loop-free paths. NETROUTE discovers them by repeated Dijkstra with exclusion of already-used links (edge-disjoint) or with Yen\'s k-shortest-paths algorithm, then distributes packets by round-robin or by a load-aware weight 1/D² (D = estimated path delay including queue backlog).' },
  { title: 'Congestion', body: 'When a link is busy, its available bandwidth falls to B(1−c), queueing delay grows as 4 ms × c/(1−c), and above 60 % packets may be lost with probability 0.3 × (c−0.6)/0.35. The higher effective cost makes routing avoid the link when alternatives exist.' },
  { title: 'Link failure', body: 'The link stops carrying traffic immediately. Packets on it are lost. Until routing reconverges, routers keep forwarding into the dead link and those packets are dropped ("next-hop down"). After convergence, traffic follows new routes.' },
  { title: 'Router failure', body: 'All links attached to the router become unusable, packets queued in the router are lost, and every route through it must be recalculated. Restoring the router brings back its links unless they were failed separately.' },
  { title: 'Packet loss', body: 'A packet is dropped when its link or router fails, when the next hop is down before convergence, when no route exists, when an output buffer is full, or by congestion loss. Each packet is either delivered once or dropped once — never both.' },
  { title: 'Packet delivery ratio (PDR)', body: 'PDR = delivered ÷ sent × 100, where "sent" = packets generated at the source. Loss rate = dropped ÷ sent × 100. While packets are in flight, PDR + loss < 100 %.' },
  { title: 'End-to-end delay', body: 'Arrival time − creation time for each delivered packet, averaged. Each hop adds transmission delay (payload bits ÷ available bandwidth), propagation delay, congestion queueing, and waiting time behind earlier packets in the output queue.' },
  { title: 'Throughput', body: 'Delivered payload bits ÷ measurement duration (from the first packet creation to completion or the current time). Reported in kbit/s or Mbit/s with a 1,000-byte default payload.' },
  { title: 'Recovery time', body: 'The simulated time from a failure to the first successful delivery of a packet created at or after the failure. If nothing is delivered afterwards, recovery is reported as "not recovered" — never invented.' },
  { title: 'Path diversity', body: 'How many independent (non-overlapping) paths exist between two routers. Edge-disjoint paths share no links, so a single link failure can break at most one of them. More diversity = more resilience.' },
  { title: 'Single-path vs multipath trade-offs', body: 'Single-path routing always uses the cheapest route: lowest delay, in-order delivery, but every packet is exposed to one failure point until reconvergence. Multipath spreads traffic: a failure only hurts the share on the broken path and capacity is aggregated, but longer paths raise average delay and packets can arrive out of order.' },
];

function LiveExplanation() {
  const engine = useCanvasEngine();
  const config = useSim((s) => s.config);
  const status = useSim((s) => s.status);
  const preview = useSim((s) => s.previewPaths);
  const mode = useSim((s) => s.mode);

  if (!engine || status === 'ready') {
    return (
      <p className="text-sm leading-relaxed text-slate-300">
        No simulation is running. In <b>{mode === 'compare' ? 'compare' : mode}</b> mode the routing engine would currently use{' '}
        {preview.length ? preview.map((p) => `${formatPath(p.nodes)} (cost ${p.cost.toFixed(1)})`).join(', ') : 'no path — the destination is unreachable'} from {config.source} to {config.destination}. Start a run to see live explanations.
      </p>
    );
  }
  const m = engine.metrics;
  const multipath = engine.algorithm === 'multipath';
  const last = engine.reroutes[engine.reroutes.length - 1];
  const drops = Object.entries(m.dropsByReason) as [DropReason, number][];
  return (
    <div className="space-y-3 text-sm leading-relaxed text-slate-300">
      <p>
        <b>{multipath ? 'Multipath' : 'Adaptive single-path'}</b> routing at t = {m.simTime.toFixed(1)} ms. {m.sent} packets sent, {m.delivered} delivered, {m.dropped} dropped, {m.inFlight} in flight. PDR {fmtPct(m.pdr)}, average delay {fmtMs(m.avgDelayMs)}, throughput{' '}
        {fmtKbps(m.throughputKbps)}.
      </p>
      <p>
        {engine.currentPaths.length === 0
          ? `There is currently no operational path from ${config.source} to ${config.destination}, so the destination is unreachable and new packets are dropped.`
          : multipath
            ? `The source is spreading traffic over ${engine.currentPaths.length} path(s): ${engine.currentPaths.map((p, i) => `P${i + 1} ${formatPath(p.nodes)} (cost ${p.cost.toFixed(1)})`).join('; ')}.`
            : `Every new packet follows the minimum-cost route ${formatPath(engine.currentPaths[0].nodes)} with total cost ${engine.currentPaths[0].cost.toFixed(1)}.`}
      </p>
      {last && <p className="rounded-lg border border-cyan-400/30 bg-cyan-500/5 p-3">{explainReroute(last, multipath, config.source, config.destination)}</p>}
      {drops.length > 0 && (
        <p>
          Packet losses so far: {drops.map(([r, n]) => `${n} × ${DROP_REASON_LABEL[r].toLowerCase()}`).join('; ')}.
        </p>
      )}
      {multipath && m.reorderedPackets > 0 && <p>{m.reorderedPackets} packet(s) arrived out of order because their paths have different delays — a known cost of multipath routing.</p>}
      {engine.converging && <p className="text-amber-200">The topology has just changed and routers have not converged yet: packets may still be sent towards the failed component.</p>}
    </div>
  );
}

export function LearnPanel() {
  const open = useSim((s) => s.panels.learn);
  const togglePanel = useSim((s) => s.togglePanel);
  const [active, setActive] = useState(0);
  return (
    <Modal open={open} onClose={() => togglePanel('learn', false)} title="Learn — Routing Concepts" icon={<BookOpen className="h-4 w-4 text-cyan-400" />} wide>
      <div className="mb-5 rounded-xl border border-emerald-400/30 bg-emerald-500/5 p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-300">
          <Radio className="h-3.5 w-3.5" /> Explain the current simulation
        </div>
        <LiveExplanation />
      </div>
      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <nav className="flex flex-col gap-0.5">
          {CONCEPTS.map((c, i) => (
            <button key={c.title} onClick={() => setActive(i)} className={`rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${active === i ? 'bg-cyan-500/15 text-cyan-200' : 'text-slate-400 hover:bg-ink-800 hover:text-slate-200'}`}>
              {c.title}
            </button>
          ))}
        </nav>
        <article className="rounded-lg border border-ink-600 bg-ink-850 p-5">
          <h3 className="mb-2 text-lg font-semibold text-white">{CONCEPTS[active].title}</h3>
          <p className="text-sm leading-relaxed text-slate-300">{CONCEPTS[active].body}</p>
        </article>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        NETROUTE is an educational, graph-based routing model. It reproduces the behaviour of link-state adaptive routing and multipath forwarding; it does not implement OSPF, BGP, MPLS or ECMP protocol messages, and no real network traffic is generated.
      </p>
    </Modal>
  );
}
