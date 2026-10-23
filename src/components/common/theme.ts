import type { Algorithm } from '../../types/simulation';

/** Path colours: primary = green, secondary multipath routes = purple shades. */
// Validated (dataviz validator, dark surface): lightness band, CVD separation, normal-vision floor.
export const PATH_COLORS = ['#16a34a', '#a855f7', '#ec4899', '#6366f1', '#0d9488'];
export const pathColor = (i: number) => PATH_COLORS[i % PATH_COLORS.length];

export const COLORS = {
  cyan: '#22d3ee',
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
  purple: '#a855f7',
  slate: '#3a4a6b',
  grid: '#1a2540',
  axis: '#64748b',
};

export const ALGO_COLOR: Record<Algorithm, string> = { adaptive: '#0ea5c4', multipath: '#9d5cf0' };
export const ALGO_LABEL: Record<Algorithm, string> = { adaptive: 'Adaptive single-path', multipath: 'Multipath' };
export const ALGO_SHORT: Record<Algorithm, string> = { adaptive: 'Adaptive', multipath: 'Multipath' };
