import {
  Background,
  BackgroundVariant,
  ReactFlow,
  applyNodeChanges,
  useReactFlow,
  type NodeChange,
  type NodeMouseHandler,
  type EdgeMouseHandler,
} from '@xyflow/react';
import { AlertOctagon, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { formatPath, linkDisplayStatus, routerMap } from '../../engine/graph';
import { useCanvasEngine, useSim } from '../../store/simulationStore';
import { ALGO_COLOR, ALGO_SHORT, pathColor } from '../common/theme';
import { NetworkEdge, type LinkFlowEdge } from './NetworkEdge';
import { PacketLayer } from './PacketLayer';
import { PacketLegend } from './PacketLegend';
import { RouterNode, type RouterFlowNode } from './RouterNode';
import { TopologyToolbar } from './TopologyToolbar';

const nodeTypes = { router: RouterNode };
const edgeTypes = { link: NetworkEdge };

export function NetworkCanvas() {
  const network = useSim((s) => s.network);
  const config = useSim((s) => s.config);
  const selection = useSim((s) => s.selection);
  const tool = useSim((s) => s.tool);
  const draft = useSim((s) => s.linkDraftSource);
  const status = useSim((s) => s.status);
  const mode = useSim((s) => s.mode);
  const preview = useSim((s) => s.previewPaths);
  const canvasAlgorithm = useSim((s) => s.canvasAlgorithm);
  const fitNonce = useSim((s) => s.fitViewNonce);
  const engine = useCanvasEngine();
  const { select, setTool, setLinkDraftSource, addLink, addRouter, moveRouter, removeLink, removeRouter, setCanvasAlgorithm, toast } = useSim.getState();
  const rf = useReactFlow();

  const started = status !== 'ready' && !!engine;
  const paths = started ? engine!.currentPaths : preview;
  const isMultipath = started ? engine!.algorithm === 'multipath' : mode === 'multipath' || (mode === 'compare' && canvasAlgorithm === 'multipath');

  const routeColor = useCallback((i: number) => (isMultipath ? pathColor(i) : '#22d3ee'), [isMultipath]);

  /* ---------------------------- Nodes (routers) ---------------------------- */
  const derivedNodes = useMemo<RouterFlowNode[]>(() => {
    const onPath = new Map<string, string>();
    paths.forEach((p, i) => p.nodes.forEach((n) => !onPath.has(n) && onPath.set(n, routeColor(i))));
    return network.routers.map((r) => ({
      id: r.id,
      type: 'router' as const,
      position: r.position,
      data: {
        router: r,
        role: r.id === config.source ? 'source' : r.id === config.destination ? 'destination' : null,
        isSelected: selection?.type === 'router' && selection.id === r.id,
        onPath: onPath.get(r.id) ?? null,
        isDraftSource: draft === r.id,
      },
    }));
  }, [network, config.source, config.destination, selection, paths, draft, routeColor]);

  const [nodes, setNodes] = useState<RouterFlowNode[]>(derivedNodes);
  useEffect(() => {
    setNodes((prev) => {
      const old = new Map(prev.map((n) => [n.id, n]));
      return derivedNodes.map((n) => ({ ...old.get(n.id), ...n }));
    });
  }, [derivedNodes]);

  const onNodesChange = useCallback(
    (changes: NodeChange<RouterFlowNode>[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
      for (const c of changes) if (c.type === 'position' && c.position) moveRouter(c.id, c.position);
    },
    [moveRouter],
  );

  /* ------------------------------ Edges (links) ----------------------------- */
  const linkStats = engine?.linkStats;
  const measurement = engine?.metrics.measurementMs ?? 0;
  const edges = useMemo<LinkFlowEdge[]>(() => {
    const rm = routerMap(network);
    const stats = new Map((linkStats ?? []).map((s) => [s.linkId, s]));
    const hl = new Map<string, { color: string; reverse: boolean }[]>();
    paths.forEach((p, i) =>
      p.nodes.slice(0, -1).forEach((n, j) => {
        const id = p.links[j];
        const link = network.links.find((l) => l.id === id);
        if (!link) return;
        const arr = hl.get(id) ?? [];
        arr.push({ color: routeColor(i), reverse: link.source !== n });
        hl.set(id, arr);
      }),
    );
    return network.links.map((l) => {
      const st = stats.get(l.id);
      return {
        id: l.id,
        source: l.source,
        target: l.target,
        type: 'link' as const,
        data: {
          link: l,
          status: linkDisplayStatus(network, l, rm),
          highlights: hl.get(l.id) ?? [],
          isSelected: selection?.type === 'link' && selection.id === l.id,
          utilization: st && measurement > 0 ? Math.min(1, st.busyMs / measurement) : null,
          packets: st?.packets ?? 0,
          animate: status === 'running',
        },
      };
    });
  }, [network, paths, selection, linkStats, measurement, status, routeColor]);

  /* ------------------------------ Interaction ------------------------------ */
  const onNodeClick: NodeMouseHandler<RouterFlowNode> = useCallback(
    (_e, node) => {
      if (tool === 'add_link') {
        if (!draft) {
          setLinkDraftSource(node.id);
          toast('info', `Link source: ${node.id}. Now click the router to connect it to.`);
        } else if (draft === node.id) {
          setLinkDraftSource(null);
        } else {
          addLink(draft, node.id);
          setLinkDraftSource(null);
        }
        return;
      }
      select({ type: 'router', id: node.id });
    },
    [tool, draft, select, setLinkDraftSource, addLink, toast],
  );

  const onEdgeClick: EdgeMouseHandler<LinkFlowEdge> = useCallback((_e, edge) => select({ type: 'link', id: edge.id }), [select]);

  const onPaneClick = useCallback(
    (e: MouseEvent) => {
      if (tool === 'add_router') {
        const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        addRouter({ x: Math.round(p.x), y: Math.round(p.y) });
        return;
      }
      if (tool === 'add_link') setLinkDraftSource(null);
      select(null);
    },
    [tool, rf, addRouter, select, setLinkDraftSource],
  );

  useEffect(() => {
    if (fitNonce > 0) rf.fitView({ padding: 0.12, duration: 400 });
  }, [fitNonce, rf]);

  // Keyboard: Delete removes the selection (with confirmation), Escape cancels tools.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'Escape') {
        setTool('select');
        select(null);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection) {
        if (selection.type === 'router' && window.confirm(`Remove router ${selection.id} and all of its links?`)) removeRouter(selection.id);
        if (selection.type === 'link' && window.confirm(`Remove link ${selection.id.replace('-', '–')}?`)) removeLink(selection.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection, setTool, select, removeRouter, removeLink]);

  const unreachable = started ? engine!.currentPaths.length === 0 : preview.length === 0;

  return (
    <div className={`relative h-full w-full tool-${tool} ${status === 'paused' ? 'paused' : ''}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        nodeOrigin={[0.5, 0.5]}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.3}
        maxZoom={2.5}
        elementsSelectable={false}
        nodesConnectable={false}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: false }}
        colorMode="dark"
        style={{ background: 'transparent' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="#1f2b45" />
        <PacketLayer />
      </ReactFlow>

      <TopologyToolbar />

      {mode === 'compare' && (
        <div className="absolute right-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-ink-600 bg-ink-900/90 p-1 text-xs shadow-lg backdrop-blur">
          <span className="px-2 font-semibold uppercase tracking-wider text-slate-500">Canvas shows</span>
          {(['adaptive', 'multipath'] as const).map((a) => (
            <button
              key={a}
              onClick={() => setCanvasAlgorithm(a)}
              className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${canvasAlgorithm === a ? 'bg-ink-700' : 'text-slate-400 hover:text-slate-200'}`}
              style={canvasAlgorithm === a ? { color: ALGO_COLOR[a] } : undefined}
            >
              {ALGO_SHORT[a]}
            </button>
          ))}
        </div>
      )}

      <PacketLegend multipath={isMultipath} />

      <div className="pointer-events-none absolute bottom-3 right-3 z-10 flex max-w-[calc(100%-300px)] flex-col items-end gap-1.5">
        {started && engine!.converging && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-950/80 px-3 py-1 text-xs font-medium text-amber-200 shadow-lg backdrop-blur">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Topology changed — routing is reconverging ({config.convergenceDelayMs} ms detection delay)
          </div>
        )}
        {unreachable ? (
          <div className="flex items-center gap-2 rounded-lg border border-red-400/50 bg-red-950/85 px-3 py-1.5 text-sm font-semibold text-red-200 shadow-lg backdrop-blur">
            <AlertOctagon className="h-4 w-4" /> Destination {config.destination} unreachable from {config.source}: no operational path
          </div>
        ) : (
          <div className="rounded-lg border border-ink-600 bg-ink-900/90 px-3 py-1.5 text-xs text-slate-300 shadow-lg backdrop-blur">
            <span className="mr-2 font-semibold uppercase tracking-wider text-slate-500">{started ? (isMultipath ? 'Active paths' : 'Active route') : isMultipath ? 'Planned paths' : 'Planned route'}</span>
            {paths.map((p, i) => (
              <span key={i} className="mr-3 font-mono" style={{ color: routeColor(i) }}>
                {isMultipath && `P${i + 1} `}
                {formatPath(p.nodes)} <span className="text-slate-500">(cost {p.cost.toFixed(1)})</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {tool !== 'select' && (
        <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-lg border border-cyan-400/40 bg-ink-900/95 px-3 py-1.5 text-xs text-cyan-200 shadow-lg">
          {tool === 'add_router' ? 'Click on empty canvas space to place a new router' : draft ? `Connecting from ${draft}: click the target router` : 'Click the first router of the new link'}
          <span className="ml-2 text-slate-500">
            <span className="kbd">Esc</span> to cancel
          </span>
        </div>
      )}
    </div>
  );
}
