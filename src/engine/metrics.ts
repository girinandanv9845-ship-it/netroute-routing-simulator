/**
 * Pure metric formulas. "Packets sent" = packets generated and injected at the source.
 * Every sent packet ends in exactly one terminal state: delivered or dropped.
 */

/** PDR = delivered / sent × 100 (null when nothing was sent). */
export function deliveryRatio(sent: number, delivered: number): number | null {
  return sent > 0 ? (delivered / sent) * 100 : null;
}

/** Packet loss rate = dropped / sent × 100 (null when nothing was sent). */
export function lossRate(sent: number, dropped: number): number | null {
  return sent > 0 ? (dropped / sent) * 100 : null;
}

/** Average end-to-end delay = Σ delays / delivered (ms); null if nothing delivered. */
export function averageDelay(delaySumMs: number, delivered: number): number | null {
  return delivered > 0 ? delaySumMs / delivered : null;
}

/** Population standard deviation of delay (jitter indicator), ms. */
export function delayStdDev(delaySumMs: number, delaySqSumMs: number, delivered: number): number | null {
  if (delivered === 0) return null;
  const mean = delaySumMs / delivered;
  return Math.sqrt(Math.max(0, delaySqSumMs / delivered - mean * mean));
}

/**
 * Throughput = delivered payload bits / measurement duration.
 * bits per millisecond equals kbit/s, so the result is in kbit/s.
 */
export function throughputKbps(deliveredPackets: number, payloadBytes: number, durationMs: number): number | null {
  if (durationMs <= 0) return null;
  return (deliveredPackets * payloadBytes * 8) / durationMs;
}

/**
 * Simulated recovery time: time from a failure event to the first successful delivery
 * of a packet created at or after the failure. null if no such delivery happened.
 */
export function recoveryTime(
  failureTime: number,
  deliveries: { createdAt: number; arrivedAt: number }[],
): number | null {
  let first: number | null = null;
  for (const d of deliveries) {
    if (d.createdAt >= failureTime && (first === null || d.arrivedAt < first)) first = d.arrivedAt;
  }
  return first === null ? null : first - failureTime;
}
