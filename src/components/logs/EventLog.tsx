import { Download, ScrollText, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getRunner, useSim } from '../../store/simulationStore';
import type { LogCategory, LogEntry } from '../../types/simulation';
import { downloadText, timestampSlug } from '../../utils/csvExport';
import { logCsv } from '../../utils/exporters';
import { ALGO_COLOR, ALGO_SHORT } from '../common/theme';

const CATEGORIES: { id: LogCategory; label: string; cls: string }[] = [
  { id: 'fault', label: 'Faults', cls: 'text-red-300 border-red-400/40' },
  { id: 'routing', label: 'Routing', cls: 'text-cyan-300 border-cyan-400/40' },
  { id: 'recovery', label: 'Recovery', cls: 'text-emerald-300 border-emerald-400/40' },
  { id: 'packet', label: 'Packets', cls: 'text-slate-300 border-slate-400/40' },
  { id: 'hop', label: 'Hops', cls: 'text-slate-400 border-slate-500/40' },
  { id: 'system', label: 'System', cls: 'text-amber-300 border-amber-400/40' },
];

const ROW_TONE: Record<string, string> = {
  link_failed: 'text-red-300',
  router_failed: 'text-red-300',
  packet_dropped: 'text-red-300/90',
  route_unreachable: 'text-red-300',
  congestion_changed: 'text-amber-300',
  route_recalculated: 'text-cyan-200',
  route_calculated: 'text-cyan-200',
  packet_rerouted: 'text-purple-300',
  packet_delivered: 'text-emerald-300/90',
  link_restored: 'text-emerald-300',
  router_restored: 'text-emerald-300',
  service_restored: 'text-emerald-300',
};

export function EventLog() {
  const logs = useSim((s) => s.logs);
  const mode = useSim((s) => s.mode);
  const clearLog = useSim((s) => s.clearLog);
  const clearedAt = useSim((s) => s.logClearedAt);
  const [enabled, setEnabled] = useState<Set<LogCategory>>(new Set(['fault', 'routing', 'recovery', 'packet', 'system']));
  const [algo, setAlgo] = useState<'all' | 'adaptive' | 'multipath'>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => logs.filter((l) => enabled.has(l.category) && (algo === 'all' || l.algorithm === algo)).slice(-600), [logs, enabled, algo]);

  useEffect(() => {
    if (autoScroll && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [filtered, autoScroll]);

  const toggle = (c: LogCategory) => {
    const n = new Set(enabled);
    if (n.has(c)) n.delete(c);
    else n.add(c);
    setEnabled(n);
  };

  const exportCsv = () => {
    const all: LogEntry[] = getRunner()
      .engines.flatMap((e) => e.log.filter((l) => l.id > clearedAt))
      .sort((a, b) => a.time - b.time || a.id - b.id);
    if (!all.length) return useSim.getState().toast('warning', 'The event log is empty; run a simulation first.');
    downloadText(`netroute-event-log-${timestampSlug()}.csv`, logCsv(all));
  };

  return (
    <section className="panel flex h-full min-h-0 flex-col">
      <div className="panel-header">
        <h2 className="panel-title">
          <ScrollText className="h-4 w-4 text-cyan-400" /> Event Log
          <span className="font-mono text-[11px] font-normal normal-case text-slate-500">{filtered.length} shown</span>
        </h2>
        <div className="flex items-center gap-1">
          <label className="mr-1 flex cursor-pointer items-center gap-1 text-[11px] text-slate-400">
            <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} className="accent-cyan-400" /> Auto-scroll
          </label>
          <button className="btn-icon h-7 w-7" title="Export full event log as CSV" aria-label="Export event log as CSV" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" />
          </button>
          <button className="btn-icon h-7 w-7" title="Clear log" aria-label="Clear event log" onClick={clearLog}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1 border-b border-ink-700/60 px-3 py-2">
        {CATEGORIES.map((c) => (
          <button key={c.id} onClick={() => toggle(c.id)} className={`chip transition-opacity ${c.cls} ${enabled.has(c.id) ? 'bg-ink-800' : 'opacity-35'}`} aria-pressed={enabled.has(c.id)}>
            {c.label}
          </button>
        ))}
        {mode === 'compare' && (
          <select className="input ml-auto w-auto px-2 py-0.5 text-[11px]" value={algo} onChange={(e) => setAlgo(e.target.value as typeof algo)} aria-label="Filter by algorithm">
            <option value="all">Both algorithms</option>
            <option value="adaptive">Adaptive only</option>
            <option value="multipath">Multipath only</option>
          </select>
        )}
      </div>
      <div ref={ref} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 py-1 font-mono text-[11px]" onWheel={() => autoScroll && setAutoScroll(false)}>
        {filtered.length === 0 ? (
          <div className="flex h-full min-h-[120px] items-center justify-center font-sans text-xs text-slate-500">No events yet. Start a simulation or inject a failure.</div>
        ) : (
          filtered.map((l) => (
            <div key={l.id} className="flex gap-2 border-b border-ink-800 py-[3px] leading-snug">
              <span className="w-16 shrink-0 text-right text-slate-500">{l.time.toFixed(1)}</span>
              {mode === 'compare' && (
                <span className="w-9 shrink-0 font-semibold" style={{ color: l.algorithm === 'system' ? '#94a3b8' : ALGO_COLOR[l.algorithm] }}>
                  {l.algorithm === 'system' ? 'SYS' : ALGO_SHORT[l.algorithm].slice(0, 4).toUpperCase()}
                </span>
              )}
              <span className={`min-w-0 flex-1 break-words ${ROW_TONE[l.type] ?? 'text-slate-300'}`}>{l.message}</span>
            </div>
          ))
        )}
      </div>
      <div className="border-t border-ink-700/60 px-3 py-1 text-[10px] text-slate-500">Times are simulated milliseconds. Hop-level events are hidden by default (toggle "Hops").</div>
    </section>
  );
}
