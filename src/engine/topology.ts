import type { Link, Network, Position, Router } from '../types/network';
import type { TopologyAction, TopologyEvent } from '../types/simulation';
import { clampCongestion, findLink, isLinkUsable, linkLabel, routerMap } from './graph';

/* ----------------------------- Default topology ----------------------------- */

const R = (id: string, x: number, y: number): Router => ({ id, name: `Router ${id.slice(1)}`, position: { x, y }, status: 'online' });

const L = (a: string, b: string, cost: number, bw: number, delay: number): Link => ({
  id: `${a}-${b}`,
  source: a,
  target: b,
  baseCost: cost,
  bandwidthMbps: bw,
  delayMs: delay,
  status: 'active',
  congestion: 0,
});

export const DEFAULT_SOURCE = 'R1';
export const DEFAULT_DESTINATION = 'R12';

/** 12-router mesh with several alternate routes between R1 (left) and R12 (right). */
export function createDefaultNetwork(): Network {
  return {
    routers: [
      R('R1', 0, 300),
      R('R2', 220, 110),
      R('R3', 220, 300),
      R('R4', 220, 490),
      R('R5', 450, 20),
      R('R6', 450, 205),
      R('R7', 450, 395),
      R('R8', 450, 580),
      R('R9', 680, 110),
      R('R10', 680, 300),
      R('R11', 680, 490),
      R('R12', 900, 300),
    ],
    links: [
      L('R1', 'R2', 2, 10, 6),
      L('R1', 'R3', 2, 8, 6),
      L('R1', 'R4', 2, 10, 6),
      L('R2', 'R3', 2, 6, 5),
      L('R3', 'R4', 2, 6, 5),
      L('R2', 'R5', 3, 8, 8),
      L('R2', 'R6', 2, 10, 6),
      L('R3', 'R6', 3, 6, 7),
      L('R3', 'R7', 2, 10, 6),
      L('R4', 'R7', 3, 6, 8),
      L('R4', 'R8', 2, 10, 6),
      L('R5', 'R6', 2, 6, 5),
      L('R6', 'R7', 2, 6, 5),
      L('R7', 'R8', 2, 6, 5),
      L('R5', 'R9', 3, 8, 8),
      L('R6', 'R9', 3, 8, 7),
      L('R6', 'R10', 3, 6, 8),
      L('R7', 'R10', 2, 10, 6),
      L('R7', 'R11', 3, 6, 8),
      L('R8', 'R11', 2, 8, 6),
      L('R9', 'R10', 2, 6, 5),
      L('R10', 'R11', 2, 6, 5),
      L('R9', 'R12', 3, 10, 8),
      L('R10', 'R12', 2, 10, 6),
      L('R11', 'R12', 4, 10, 9),
    ],
  };
}

/* --------------------------------- Mutations -------------------------------- */

export interface MutationResult {
  network: Network;
  /** null when nothing relevant to routing changed. */
  event: TopologyEvent | null;
  error?: string;
}

function usableLinkIds(net: Network): Set<string> {
  const rm = routerMap(net);
  return new Set(net.links.filter((l) => isLinkUsable(net, l, rm)).map((l) => l.id));
}

function makeEvent(
  before: Network,
  after: Network,
  kind: TopologyEvent['kind'],
  subject: string,
  description: string,
): TopologyEvent {
  const ub = usableLinkIds(before);
  const ua = usableLinkIds(after);
  const downLinks = [...ub].filter((id) => !ua.has(id));
  const onlineAfter = new Set(after.routers.filter((r) => r.status === 'online').map((r) => r.id));
  const downRouters = before.routers.filter((r) => r.status === 'online' && !onlineAfter.has(r.id)).map((r) => r.id);
  return {
    kind,
    subject,
    description,
    isFailure: downLinks.length > 0 || downRouters.length > 0,
    downLinks,
    downRouters,
  };
}

const err = (net: Network, error: string): MutationResult => ({ network: net, event: null, error });

function updateLink(net: Network, id: string, patch: Partial<Link>): Network {
  return { ...net, links: net.links.map((l) => (l.id === id ? { ...l, ...patch } : l)) };
}

function updateRouter(net: Network, id: string, patch: Partial<Router>): Network {
  return { ...net, routers: net.routers.map((r) => (r.id === id ? { ...r, ...patch } : r)) };
}

export function applyAction(net: Network, action: TopologyAction): MutationResult {
  switch (action.type) {
    case 'fail_link': {
      const l = net.links.find((x) => x.id === action.linkId);
      if (!l) return err(net, `Link ${action.linkId} does not exist`);
      if (l.status === 'failed') return err(net, `Link ${linkLabel(l)} is already failed`);
      const next = updateLink(net, l.id, { status: 'failed' });
      return { network: next, event: makeEvent(net, next, 'link_failed', l.id, `Link ${linkLabel(l)} failed`) };
    }
    case 'restore_link': {
      const l = net.links.find((x) => x.id === action.linkId);
      if (!l) return err(net, `Link ${action.linkId} does not exist`);
      if (l.status === 'active') return err(net, `Link ${linkLabel(l)} is already active`);
      const next = updateLink(net, l.id, { status: 'active' });
      return { network: next, event: makeEvent(net, next, 'link_restored', l.id, `Link ${linkLabel(l)} restored`) };
    }
    case 'fail_router': {
      const r = net.routers.find((x) => x.id === action.routerId);
      if (!r) return err(net, `Router ${action.routerId} does not exist`);
      if (r.status === 'failed') return err(net, `Router ${r.id} is already failed`);
      const next = updateRouter(net, r.id, { status: 'failed' });
      return { network: next, event: makeEvent(net, next, 'router_failed', r.id, `Router ${r.id} failed`) };
    }
    case 'restore_router': {
      const r = net.routers.find((x) => x.id === action.routerId);
      if (!r) return err(net, `Router ${action.routerId} does not exist`);
      if (r.status === 'online') return err(net, `Router ${r.id} is already online`);
      const next = updateRouter(net, r.id, { status: 'online' });
      return { network: next, event: makeEvent(net, next, 'router_restored', r.id, `Router ${r.id} restored`) };
    }
    case 'set_congestion': {
      const l = net.links.find((x) => x.id === action.linkId);
      if (!l) return err(net, `Link ${action.linkId} does not exist`);
      const level = clampCongestion(action.level);
      if (Math.abs(level - l.congestion) < 1e-9) return { network: net, event: null };
      const next = updateLink(net, l.id, { congestion: level });
      const desc =
        level > l.congestion
          ? `Congestion on ${linkLabel(l)} increased to ${Math.round(level * 100)}%`
          : `Congestion on ${linkLabel(l)} reduced to ${Math.round(level * 100)}%`;
      return { network: next, event: makeEvent(net, next, 'congestion_changed', l.id, desc) };
    }
  }
}

export function nextRouterId(net: Network): string {
  let max = 0;
  for (const r of net.routers) {
    const n = parseInt(r.id.replace(/\D/g, ''), 10);
    if (!Number.isNaN(n)) max = Math.max(max, n);
  }
  return `R${max + 1}`;
}

export function addRouter(net: Network, position: Position): MutationResult & { routerId: string } {
  const id = nextRouterId(net);
  const next = { ...net, routers: [...net.routers, { id, name: `Router ${id.slice(1)}`, position, status: 'online' as const }] };
  return { network: next, routerId: id, event: makeEvent(net, next, 'router_added', id, `Router ${id} added`) };
}

export function removeRouter(net: Network, id: string): MutationResult {
  if (!net.routers.some((r) => r.id === id)) return err(net, `Router ${id} does not exist`);
  const removedLinks = net.links.filter((l) => l.source === id || l.target === id);
  const next: Network = {
    routers: net.routers.filter((r) => r.id !== id),
    links: net.links.filter((l) => l.source !== id && l.target !== id),
  };
  const desc = `Router ${id} removed${removedLinks.length ? ` along with ${removedLinks.length} attached link(s)` : ''}`;
  return { network: next, event: makeEvent(net, next, 'router_removed', id, desc) };
}

export interface NewLinkParams {
  baseCost: number;
  bandwidthMbps: number;
  delayMs: number;
}

export function validateLinkParams(p: NewLinkParams): string | null {
  if (!(p.baseCost > 0) || !Number.isFinite(p.baseCost)) return 'Cost must be a positive number';
  if (!(p.bandwidthMbps > 0) || !Number.isFinite(p.bandwidthMbps)) return 'Bandwidth must be a positive number';
  if (!(p.delayMs > 0) || !Number.isFinite(p.delayMs)) return 'Delay must be a positive number';
  return null;
}

export function addLink(net: Network, a: string, b: string, params: NewLinkParams): MutationResult & { linkId?: string } {
  if (a === b) return err(net, 'A link cannot connect a router to itself');
  if (!net.routers.some((r) => r.id === a) || !net.routers.some((r) => r.id === b)) return err(net, 'Both routers must exist');
  if (findLink(net, a, b)) return err(net, `A link between ${a} and ${b} already exists`);
  const invalid = validateLinkParams(params);
  if (invalid) return err(net, invalid);
  const id = `${a}-${b}`;
  const link: Link = { id, source: a, target: b, ...params, status: 'active', congestion: 0 };
  const next = { ...net, links: [...net.links, link] };
  return { network: next, linkId: id, event: makeEvent(net, next, 'link_added', id, `Link ${a}–${b} added (cost ${params.baseCost})`) };
}

export function removeLink(net: Network, id: string): MutationResult {
  const l = net.links.find((x) => x.id === id);
  if (!l) return err(net, `Link ${id} does not exist`);
  const next = { ...net, links: net.links.filter((x) => x.id !== id) };
  return { network: next, event: makeEvent(net, next, 'link_removed', id, `Link ${linkLabel(l)} removed`) };
}

export function editLink(net: Network, id: string, params: NewLinkParams): MutationResult {
  const l = net.links.find((x) => x.id === id);
  if (!l) return err(net, `Link ${id} does not exist`);
  const invalid = validateLinkParams(params);
  if (invalid) return err(net, invalid);
  const next = updateLink(net, id, params);
  return {
    network: next,
    event: makeEvent(net, next, 'link_edited', id, `Link ${linkLabel(l)} reconfigured (cost ${params.baseCost}, ${params.bandwidthMbps} Mbps, ${params.delayMs} ms)`),
  };
}

export function moveRouter(net: Network, id: string, position: Position): Network {
  return updateRouter(net, id, { position });
}
