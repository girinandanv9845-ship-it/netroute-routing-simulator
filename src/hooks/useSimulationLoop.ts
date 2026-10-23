import { useEffect } from 'react';
import { bumpFrame } from '../store/frameStore';
import { getRunner, useSim } from '../store/simulationStore';
import { SPEEDS } from '../types/simulation';

const SYNC_INTERVAL_MS = 200;

/**
 * Single requestAnimationFrame loop driving the simulation clock.
 * Real elapsed time × speed factor = simulated time advanced. Paused/ready states do not
 * advance simulated time. UI snapshots (metrics, charts, logs) are throttled to 5 Hz.
 */
export function useSimulationLoop() {
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastSync = 0;
    const loop = (now: number) => {
      const realDt = Math.min(100, now - last); // clamp after tab switches
      last = now;
      const { status, speed, tick, sync } = useSim.getState();
      if (status === 'running') {
        tick((realDt / 1000) * SPEEDS[speed].simMsPerSecond);
        bumpFrame();
        if (now - lastSync > SYNC_INTERVAL_MS || getRunner().status !== 'running') {
          lastSync = now;
          sync();
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
}
