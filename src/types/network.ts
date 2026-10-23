/** Graph model G = (V, E): routers are vertices, links are undirected edges. */

export type RouterStatus = 'online' | 'failed';
/** Administrative status of a link. Congestion is modelled separately by `congestion`. */
export type LinkStatus = 'active' | 'failed';
/** Status shown in the UI, derived from link status, congestion and endpoint routers. */
export type LinkDisplayStatus = 'active' | 'congested' | 'failed' | 'down';

export interface Position {
  x: number;
  y: number;
}

export interface Router {
  id: string;
  name: string;
  position: Position;
  status: RouterStatus;
}

export interface Link {
  id: string;
  source: string;
  target: string;
  /** Positive routing weight (dimensionless). */
  baseCost: number;
  /** Capacity in Mbit/s. */
  bandwidthMbps: number;
  /** One-way propagation delay in simulated milliseconds. */
  delayMs: number;
  status: LinkStatus;
  /** Background congestion level c in [0, 0.95]. */
  congestion: number;
}

export interface Network {
  routers: Router[];
  links: Link[];
}

export interface Path {
  /** Ordered router IDs from source to destination (loop-free). */
  nodes: string[];
  /** Link IDs traversed, length = nodes.length - 1. */
  links: string[];
  /** Sum of effective link costs. */
  cost: number;
}
