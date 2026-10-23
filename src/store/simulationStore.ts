import { create } from 'zustand';
import { DEFAULT_CONFIG } from '../engine/config';
import { dijkstra } from '../engine/dijkstra';
import { cloneNetwork } from '../engine/graph';
import { discoverPaths } from '../engine/multipath';
import { getScenario } from '../engine/scenarios';
import { SimulationRunner, algorithmsFor, runComparison } from '../engine/simulationClock';
import {
  addLink as addLinkOp,
  addRouter as addRouterOp,
  createDefaultNetwork,
  editLink as editLinkOp,
  moveRouter as moveRouterOp,
  removeLink as removeLinkOp,
  removeRouter as removeRouterOp,
  type NewLinkParams,
} from '../engine/topology';
import type { Network, Path, Position } from '../types/network';
import type {
  Algorithm,
  ExperimentResult,
  LinkStat,
  LogEntry,
  Metrics,
  PathStat,
  RecoveryRecord,
  RerouteRecord,
  RoutingMode,
  SeriesPoint,
  SimConfig,
  SimStatus,
  SpeedKey,
  TopologyAction,
} from '../types/simulation';

export interface EngineSnapshot {
  algorithm: Algorithm;
  metrics: Metrics;
  pathStats: PathStat[];
  currentPaths: Path[];
  linkStats: LinkStat[];
  reroutes: RerouteRecord[];
  recoveries: RecoveryRecord[];
  series: SeriesPoint[];
  controlNetwork: Network;
  converging: boolean;
}

export type Selection = { type: 'router'; id: string } | { type: 'link'; id: string } | null;
export type Tool = 'select' | 'add_router' | 'add_link';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export interface ComparisonState {
  source: 'experiment' | 'live';
  title: string;
  config: SimConfig;
  results: ExperimentResult[];
  failureEvents: { time: number; description: string }[];
  ranAt: string;
}

interface State {
  network: Network;
  config: SimConfig;
  mode: RoutingMode;
  speed: SpeedKey;
  status: SimStatus;
  simTime: number;
  engines: EngineSnapshot[];
  logs: LogEntry[];
  logClearedAt: number;
  /** Routes the engine would use right now (shown before a run starts). */
  previewPaths: Path[];
  selection: Selection;
  tool: Tool;
  linkDraftSource: string | null;
  canvasAlgorithm: Algorithm;
  scenarioId: string | null;
  comparison: ComparisonState | null;
  toasts: Toast[];
  panels: { learn: boolean; settings: boolean };
  bottomTab: 'performance' | 'comparison' | 'export';
  fitViewNonce: number;

  // simulation control
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  step: () => void;
  reset: () => void;
  tick: (simDeltaMs: number) => void;
  sync: () => void;

  // configuration
  setMode: (m: RoutingMode) => void;
  setSpeed: (s: SpeedKey) => void;
  updateConfig: (patch: Partial<SimConfig>) => void;
  setCanvasAlgorithm: (a: Algorithm) => void;

  // topology & events
  inject: (action: TopologyAction) => void;
  restoreAll: () => void;
  addRouter: (pos: Position) => void;
  removeRouter: (id: string) => void;
  addLink: (a: string, b: string, params?: NewLinkParams) => void;
  removeLink: (id: string) => void;
  editLink: (id: string, params: NewLinkParams) => void;
  moveRouter: (id: string, pos: Position) => void;
  resetLayout: () => void;
  resetTopology: () => void;
  loadNetwork: (net: Network, label: string) => void;

  // scenarios & comparison
  loadScenario: (id: string) => void;
  runScenario: (id: string) => void;
  runExperiment: (scenarioId: string | null) => void;

  // UI
  select: (s: Selection) => void;
  setTool: (t: Tool) => void;
  setLinkDraftSource: (id: string | null) => void;
  toast: (kind: Toast['kind'], message: string) => void;
  dismissToast: (id: number) => void;
  togglePanel: (p: 'learn' | 'settings', open?: boolean) => void;
  setBottomTab: (t: State['bottomTab']) => void;
  clearLog: () => void;
  requestFitView: () => void;
}

/* The runner lives outside React state; the store mirrors what the UI needs. */
let runner = new SimulationRunner(createDefaultNetwork(), { ...DEFAULT_CONFIG }, 'adaptive');
export const getRunner = () => runner;

let toastSeq = 0;
const DEFAULT_LINK: NewLinkParams = { baseCost: 2, bandwidthMbps: 8, delayMs: 6 };

function computePreview(net: Network, config: SimConfig, mode: RoutingMode, alg: Algorithm): Path[] {
  const useMultipath = mode === 'multipath' || (mode === 'compare' && alg === 'multipath');
  if (config.source === config.destination) return [];
  if (useMultipath) return discoverPaths(net, config.source, config.destination, config.maxPaths, config.pathDiscovery);
  const p = dijkstra(net, config.source, config.destination);
  return p ? [p] : [];
}

function snapshotEngines(): EngineSnapshot[] {
  return runner.engines.map((e) => ({
    algorithm: e.algorithm,
    metrics: e.getMetrics(),
    pathStats: e.getPathStats(),
    currentPaths: e.currentPaths(),
    linkStats: e.getLinkStats(),
    reroutes: [...e.reroutes],
    recoveries: e.recoveries.map((r) => ({ ...r })),
    series: e.series.slice(),
    controlNetwork: e.control,
    converging: pendingConvergence(e.control, e.physical),
  }));
}

/** True when the routing view differs from the physical network in a routing-relevant way. */
function pendingConvergence(control: Network, physical: Network): boolean {
  if (control.links.length !== physical.links.length || control.routers.length !== physical.routers.length) return true;
  const cl = new Map(control.links.map((l) => [l.id, l]));
  for (const l of physical.links) {
    const c = cl.get(l.id);
    if (!c || c.status !== l.status || c.congestion !== l.congestion || c.baseCost !== l.baseCost) return true;
  }
  const cr = new Map(control.routers.map((r) => [r.id, r.status]));
  return physical.routers.some((r) => cr.get(r.id) !== r.status);
}

function mergedLogs(clearedAt: number): LogEntry[] {
  const all = runner.engines.flatMap((e) => e.log.filter((l) => l.id > clearedAt));
  all.sort((a, b) => a.time - b.time || a.id - b.id);
  return all.slice(-1500);
}

export const useSim = create<State>((set, get) => {
  /** Pull the latest state from the runner into the store. */
  const syncAll = () => {
    const s = get();
    set({
      network: runner.network,
      status: runner.status,
      simTime: runner.time,
      engines: snapshotEngines(),
      logs: mergedLogs(s.logClearedAt),
      previewPaths: computePreview(runner.network, s.config, s.mode, s.canvasAlgorithm),
    });
  };

  const guardIdle = (what: string): boolean => {
    if (runner.started) {
      get().toast('warning', `${what} is locked while a simulation exists. Reset the simulation first.`);
      return false;
    }
    return true;
  };

  const report = (error: string | null, okMessage?: string) => {
    if (error) get().toast('error', error);
    else if (okMessage) get().toast('info', okMessage);
    syncAll();
    // Clear selections that no longer exist.
    const sel = get().selection;
    const net = runner.network;
    if (sel?.type === 'router' && !net.routers.some((r) => r.id === sel.id)) set({ selection: null });
    if (sel?.type === 'link' && !net.links.some((l) => l.id === sel.id)) set({ selection: null });
  };

  let lastLiveCompareKey = '';

  return {
    network: runner.network,
    config: { ...DEFAULT_CONFIG },
    mode: 'adaptive',
    speed: 'normal',
    status: 'ready',
    simTime: 0,
    engines: [],
    logs: [],
    logClearedAt: 0,
    previewPaths: computePreview(runner.network, DEFAULT_CONFIG, 'adaptive', 'adaptive'),
    selection: null,
    tool: 'select',
    linkDraftSource: null,
    canvasAlgorithm: 'adaptive',
    scenarioId: null,
    comparison: null,
    toasts: [],
    panels: { learn: false, settings: false },
    bottomTab: 'performance',
    fitViewNonce: 0,

    start: () => {
      const s = get();
      if (runner.status === 'paused') return get().resume();
      if (runner.started) runner.reset();
      runner.config = { ...s.config };
      runner.mode = s.mode;
      if (!s.scenarioId) runner.setScript([]);
      const err = runner.start();
      if (err) return report(err);
      set({ logClearedAt: 0, canvasAlgorithm: algorithmsFor(s.mode).includes(s.canvasAlgorithm) ? s.canvasAlgorithm : algorithmsFor(s.mode)[0] });
      syncAll();
    },
    pause: () => {
      runner.pause();
      syncAll();
    },
    resume: () => {
      runner.resume();
      syncAll();
    },
    stop: () => {
      runner.stop();
      get().toast('info', 'Packet generation stopped. In-flight packets will finish (drain policy).');
      syncAll();
    },
    step: () => {
      if (runner.status === 'ready') {
        get().start();
        runner.pause();
      }
      runner.step(2);
      syncAll();
    },
    reset: () => {
      runner.reset();
      set({ logClearedAt: 0 });
      syncAll();
    },
    tick: (dt) => {
      const before = runner.status;
      const nv = runner.networkVersion;
      runner.advance(dt);
      if (runner.networkVersion !== nv || runner.status !== before) get().sync();
    },
    sync: () => {
      syncAll();
      const s = get();
      // Keep the comparison panel fed by a live compare run once it completes.
      if (s.mode === 'compare' && runner.status === 'completed' && runner.engines.length === 2) {
        const key = `${runner.engines[0].packets.length}-${runner.time}`;
        if (key !== lastLiveCompareKey) {
          lastLiveCompareKey = key;
          set({
            comparison: {
              source: 'live',
              title: s.scenarioId ? getScenario(s.scenarioId)?.title ?? 'Live comparison' : 'Live comparison (manual events)',
              config: { ...runner.config },
              results: runner.results(),
              failureEvents: [...runner.appliedEvents],
              ranAt: new Date().toISOString(),
            },
          });
        }
      }
    },

    setMode: (m) => {
      if (!guardIdle('Routing mode')) return;
      set({ mode: m, canvasAlgorithm: m === 'compare' ? get().canvasAlgorithm : m });
      runner.mode = m;
      syncAll();
    },
    setSpeed: (speed) => set({ speed }),
    updateConfig: (patch) => {
      const routingKeys: (keyof SimConfig)[] = ['source', 'destination', 'packetCount', 'payloadBytes', 'packetRatePps', 'convergenceDelayMs', 'bufferPackets', 'maxPaths', 'pathDiscovery', 'distribution', 'seed'];
      if (Object.keys(patch).some((k) => routingKeys.includes(k as keyof SimConfig)) && !guardIdle('Simulation configuration')) return;
      const next = { ...get().config, ...patch };
      if (next.source === next.destination) {
        get().toast('error', 'Source and destination must be different routers.');
        return;
      }
      set({ config: next });
      runner.config = { ...next };
      syncAll();
    },
    setCanvasAlgorithm: (a) => {
      set({ canvasAlgorithm: a });
      syncAll();
    },

    inject: (action) => report(runner.applyAction(action)),
    restoreAll: () => {
      const net = runner.network;
      let n = 0;
      for (const r of net.routers) if (r.status === 'failed' && !runner.applyAction({ type: 'restore_router', routerId: r.id })) n++;
      for (const l of runner.network.links) {
        if (l.status === 'failed' && !runner.applyAction({ type: 'restore_link', linkId: l.id })) n++;
        if (l.congestion > 0 && !runner.applyAction({ type: 'set_congestion', linkId: l.id, level: 0 })) n++;
      }
      report(null, n ? `Restored ${n} component(s) to normal operation.` : 'Nothing to restore: every component is healthy.');
    },
    addRouter: (pos) => {
      const r = addRouterOp(runner.network, pos);
      report(runner.applyMutation(r), `Router ${r.routerId} added. Use the link tool to connect it.`);
      set({ selection: { type: 'router', id: r.routerId } });
    },
    removeRouter: (id) => {
      const { config } = get();
      if (id === config.source || id === config.destination) {
        get().toast('error', `${id} is the current ${id === config.source ? 'source' : 'destination'}. Choose a different endpoint before removing it.`);
        return;
      }
      report(runner.applyMutation(removeRouterOp(runner.network, id)), `Router ${id} and its links were removed.`);
    },
    addLink: (a, b, params = DEFAULT_LINK) => {
      const r = addLinkOp(runner.network, a, b, params);
      report(runner.applyMutation(r), r.error ? undefined : `Link ${a}–${b} added (cost ${params.baseCost}, ${params.bandwidthMbps} Mbps, ${params.delayMs} ms).`);
      if (r.linkId) set({ selection: { type: 'link', id: r.linkId } });
    },
    removeLink: (id) => report(runner.applyMutation(removeLinkOp(runner.network, id)), `Link ${id.replace('-', '–')} removed.`),
    editLink: (id, params) => report(runner.applyMutation(editLinkOp(runner.network, id, params)), 'Link parameters updated.'),
    moveRouter: (id, pos) => {
      runner.setNetworkSilently(moveRouterOp(runner.network, id, pos));
      set({ network: runner.network });
    },
    resetLayout: () => {
      const def = new Map(createDefaultNetwork().routers.map((r) => [r.id, r.position]));
      let net = runner.network;
      net.routers.forEach((r, i) => {
        const p = def.get(r.id) ?? { x: 100 + (i % 5) * 180, y: 700 + Math.floor(i / 5) * 120 };
        net = moveRouterOp(net, r.id, p);
      });
      runner.setNetworkSilently(net);
      set({ network: net, fitViewNonce: get().fitViewNonce + 1 });
    },
    resetTopology: () => {
      runner.reset();
      runner.network = createDefaultNetwork();
      runner.networkVersion++;
      runner.setScript([]);
      set({ scenarioId: null, selection: null, logClearedAt: 0, config: { ...get().config, source: 'R1', destination: 'R12' }, fitViewNonce: get().fitViewNonce + 1 });
      runner.config = { ...get().config };
      report(null, 'Default 12-router topology restored.');
    },
    loadNetwork: (net, label) => {
      runner.reset();
      runner.network = net;
      runner.networkVersion++;
      runner.setScript([]);
      const ids = net.routers.map((r) => r.id);
      const cfg = get().config;
      const source = ids.includes(cfg.source) ? cfg.source : ids[0];
      const destination = ids.includes(cfg.destination) && cfg.destination !== source ? cfg.destination : ids.find((i) => i !== source)!;
      set({ scenarioId: null, selection: null, config: { ...cfg, source, destination }, fitViewNonce: get().fitViewNonce + 1 });
      runner.config = { ...get().config };
      report(null, `${label} loaded (${net.routers.length} routers, ${net.links.length} links).`);
    },

    loadScenario: (id) => {
      const sc = getScenario(id);
      if (!sc) return;
      runner.reset();
      const { network, config } = sc.setup(createDefaultNetwork());
      runner.network = network;
      runner.networkVersion++;
      runner.setScript(sc.script);
      const next = { ...get().config, ...config };
      if (!config?.distribution) next.distribution = get().config.distribution;
      runner.config = { ...next };
      runner.mode = sc.recommendedMode;
      set({ scenarioId: id, config: next, mode: sc.recommendedMode, canvasAlgorithm: sc.recommendedMode === 'compare' ? 'adaptive' : sc.recommendedMode, selection: null, logClearedAt: 0 });
      report(null, `Scenario loaded: ${sc.title}. Press Start (or Run Scenario) to begin.`);
    },
    runScenario: (id) => {
      get().loadScenario(id);
      get().start();
    },
    runExperiment: (scenarioId) => {
      const s = get();
      const sc = scenarioId ? getScenario(scenarioId) : null;
      let network: Network;
      let config: SimConfig;
      let script = sc?.script ?? [];
      if (sc) {
        const setup = sc.setup(createDefaultNetwork());
        network = setup.network;
        config = { ...s.config, ...setup.config };
      } else {
        network = cloneNetwork(runner.network);
        config = { ...s.config };
        script = [];
      }
      if (!network.routers.some((r) => r.id === config.source) || !network.routers.some((r) => r.id === config.destination)) {
        get().toast('error', 'The selected source/destination does not exist in this topology.');
        return;
      }
      const t0 = performance.now();
      const results = runComparison(network, config, script);
      const ms = performance.now() - t0;
      set({
        comparison: {
          source: 'experiment',
          title: sc ? sc.title : 'Current topology (no scripted events)',
          config,
          results,
          failureEvents: script.map((a) => ({ time: a.at, description: describeAction(a.action) })),
          ranAt: new Date().toISOString(),
        },
        bottomTab: 'comparison',
      });
      get().toast('success', `Experiment finished: both algorithms simulated on isolated copies in ${ms.toFixed(0)} ms.`);
    },

    select: (selection) => set({ selection }),
    setTool: (tool) => set({ tool, linkDraftSource: null }),
    setLinkDraftSource: (linkDraftSource) => set({ linkDraftSource }),
    toast: (kind, message) => {
      const id = ++toastSeq;
      set({ toasts: [...get().toasts.slice(-3), { id, kind, message }] });
      setTimeout(() => get().dismissToast(id), kind === 'error' ? 6000 : 4000);
    },
    dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
    togglePanel: (p, open) => set({ panels: { ...get().panels, [p]: open ?? !get().panels[p] } }),
    setBottomTab: (bottomTab) => set({ bottomTab }),
    clearLog: () => {
      const maxId = Math.max(0, ...runner.engines.flatMap((e) => e.log.map((l) => l.id)));
      set({ logClearedAt: maxId, logs: [] });
    },
    requestFitView: () => set({ fitViewNonce: get().fitViewNonce + 1 }),
  };
});

export function describeAction(a: TopologyAction): string {
  switch (a.type) {
    case 'fail_link':
      return `Link ${a.linkId.replace('-', '–')} fails`;
    case 'restore_link':
      return `Link ${a.linkId.replace('-', '–')} restored`;
    case 'fail_router':
      return `Router ${a.routerId} fails`;
    case 'restore_router':
      return `Router ${a.routerId} restored`;
    case 'set_congestion':
      return `Congestion on ${a.linkId.replace('-', '–')} set to ${Math.round(a.level * 100)}%`;
  }
}

/** Snapshot of the engine shown on the canvas. */
export function useCanvasEngine(): EngineSnapshot | undefined {
  return useSim((s) => s.engines.find((e) => e.algorithm === s.canvasAlgorithm) ?? s.engines[0]);
}
