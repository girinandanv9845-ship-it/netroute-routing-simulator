import type { SimConfig } from '../types/simulation';
import { DEFAULT_DESTINATION, DEFAULT_SOURCE } from './topology';

export const DEFAULT_CONFIG: SimConfig = {
  source: DEFAULT_SOURCE,
  destination: DEFAULT_DESTINATION,
  packetCount: 100,
  payloadBytes: 1000,
  packetRatePps: 200,
  convergenceDelayMs: 15,
  bufferPackets: 20,
  maxPaths: 3,
  pathDiscovery: 'edge_disjoint',
  distribution: 'round_robin',
  seed: 42,
};

export const PACKET_COUNT_OPTIONS = [20, 50, 100, 200, 500];
