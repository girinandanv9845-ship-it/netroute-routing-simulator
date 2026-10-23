export const fmt = (v: number | null | undefined, digits = 1, unit = ''): string =>
  v === null || v === undefined || !Number.isFinite(v) ? 'N/A' : `${v.toFixed(digits)}${unit}`;

export const fmtPct = (v: number | null | undefined, digits = 1) => fmt(v, digits, '%');

export const fmtMs = (v: number | null | undefined, digits = 1) => fmt(v, digits, ' ms');

export function fmtKbps(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return 'N/A';
  return v >= 1000 ? `${(v / 1000).toFixed(2)} Mbps` : `${v.toFixed(0)} kbps`;
}

export const fmtTime = (ms: number) => `${ms.toFixed(1)} ms`;
