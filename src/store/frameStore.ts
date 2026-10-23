import { create } from 'zustand';

/** Animation frame counter, kept separate so per-frame updates only re-render the packet layer. */
export const useFrame = create<{ frame: number }>(() => ({ frame: 0 }));
export const bumpFrame = () => useFrame.setState((s) => ({ frame: s.frame + 1 }));
