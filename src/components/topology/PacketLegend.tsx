import { COLORS, PATH_COLORS } from '../common/theme';

const Dot = ({ color }: { color: string }) => <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />;
const Line = ({ color, dashed }: { color: string; dashed?: boolean }) => (
  <svg width="18" height="6" className="shrink-0">
    <line x1="0" y1="3" x2="18" y2="3" stroke={color} strokeWidth="2.5" strokeDasharray={dashed ? '4 3' : undefined} />
  </svg>
);

export function PacketLegend({ multipath }: { multipath: boolean }) {
  return (
    <div className="absolute bottom-3 left-3 z-10 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-ink-600 bg-ink-900/90 px-3 py-2 text-[11px] text-slate-400 shadow-lg backdrop-blur">
      <div className="col-span-2 mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Legend</div>
      {multipath ? (
        <>
          <span className="flex items-center gap-1.5"><Dot color={PATH_COLORS[0]} /> Primary path pkt</span>
          <span className="flex items-center gap-1.5"><Dot color={PATH_COLORS[1]} /> Secondary path pkt</span>
          <span className="col-span-2 flex items-center gap-1.5"><Dot color={PATH_COLORS[2]} /><Dot color={PATH_COLORS[3]} /> Further multipath candidates</span>
        </>
      ) : (
        <span className="col-span-2 flex items-center gap-1.5"><Dot color={COLORS.cyan} /> Packet (adaptive route)</span>
      )}
      <span className="flex items-center gap-1.5"><Dot color={COLORS.amber} /> On congested link</span>
      <span className="flex items-center gap-1.5"><Dot color={COLORS.red} /> Dropped</span>
      <span className="flex items-center gap-1.5"><Line color="#3a4a6b" /> Active link</span>
      <span className="flex items-center gap-1.5"><Line color={COLORS.amber} /> Congested</span>
      <span className="flex items-center gap-1.5"><Line color={COLORS.red} dashed /> Failed / down</span>
      <span className="flex items-center gap-1.5"><Line color={multipath ? PATH_COLORS[0] : COLORS.cyan} dashed /> Route in use</span>
    </div>
  );
}
