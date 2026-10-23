export type PacketStatus = 'created' | 'queued' | 'in_transit' | 'delivered' | 'dropped';

export type DropReason =
  | 'no_route'
  | 'source_offline'
  | 'link_failed_in_transit'
  | 'router_failed'
  | 'next_hop_down'
  | 'buffer_overflow'
  | 'congestion_loss';

export const DROP_REASON_LABEL: Record<DropReason, string> = {
  no_route: 'Destination unreachable (no route)',
  source_offline: 'Source router offline',
  link_failed_in_transit: 'Link failed while packet was in transit',
  router_failed: 'Router failed while holding the packet',
  next_hop_down: 'Next-hop link down before routing converged',
  buffer_overflow: 'Output queue (buffer) overflow',
  congestion_loss: 'Lost on a heavily congested link',
};

export interface Packet {
  id: string;
  seq: number;
  source: string;
  destination: string;
  /** Planned router sequence; may be replaced when the packet is rerouted. */
  route: string[];
  /** Route assigned at creation (used for per-path statistics). */
  assignedPath: string[];
  /** Index into `route` of the router the packet is at / has last left. */
  hop: number;
  /** Index of the multipath candidate this packet was assigned to (0 for adaptive). */
  pathIndex: number;
  status: PacketStatus;
  /** Simulated creation time (ms). */
  createdAt: number;
  /** Wall-clock creation time (epoch ms) – informational only. */
  createdAtWall: number;
  arrivedAt: number | null;
  dropReason: DropReason | null;
  droppedAt: number | null;
  /** Router where the packet was dropped / is located. */
  location: string;
  /** Link currently being traversed (in_transit), kept after a drop for rendering. */
  linkId: string | null;
  /** Directed output queue the packet is waiting in (queued). */
  queueKey: string | null;
  /** Router the packet left when it started traversing `linkId`. */
  fromRouter: string | null;
  departAt: number;
  arriveAt: number;
  /** True while traversing a congested link. */
  congested: boolean;
  rerouted: number;
  hopsTaken: number;
  /** Route revision of the control plane used to compute `route`. */
  routeRev: number;
  /** Increments whenever a scheduled event for this packet becomes stale. */
  token: number;
}
