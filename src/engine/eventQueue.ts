/** Deterministic PRNG (mulberry32) so experiments are reproducible from a seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Time-ordered event queue (binary heap). Equal times keep insertion (FIFO) order. */
export class EventQueue<T> {
  private heap: { time: number; seq: number; item: T }[] = [];
  private seq = 0;

  get size() {
    return this.heap.length;
  }

  peekTime(): number {
    return this.heap.length ? this.heap[0].time : Infinity;
  }

  push(time: number, item: T) {
    const h = this.heap;
    h.push({ time, seq: this.seq++, item });
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.less(i, p)) {
        [h[i], h[p]] = [h[p], h[i]];
        i = p;
      } else break;
    }
  }

  pop(): { time: number; item: T } | undefined {
    const h = this.heap;
    if (!h.length) return undefined;
    const top = h[0];
    const last = h.pop()!;
    if (h.length) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < h.length && this.less(l, m)) m = l;
        if (r < h.length && this.less(r, m)) m = r;
        if (m === i) break;
        [h[i], h[m]] = [h[m], h[i]];
        i = m;
      }
    }
    return { time: top.time, item: top.item };
  }

  clear() {
    this.heap = [];
  }

  private less(i: number, j: number) {
    const a = this.heap[i];
    const b = this.heap[j];
    return a.time < b.time || (a.time === b.time && a.seq < b.seq);
  }
}
