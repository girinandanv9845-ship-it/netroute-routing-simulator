import { FileJson, FileSpreadsheet, FileUp, Network, Package, ScrollText } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { getScenario } from '../../engine/scenarios';
import { getRunner, useSim } from '../../store/simulationStore';
import { downloadText, timestampSlug } from '../../utils/csvExport';
import { logCsv, packetsCsv, parseTopology, resultsCsv, summaryJson, topologyJson } from '../../utils/exporters';

function ExportButton({ icon, title, desc, onClick, disabled }: { icon: ReactNode; title: string; desc: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="flex items-start gap-3 rounded-lg border border-ink-600 bg-ink-850 p-3 text-left transition-colors hover:border-cyan-400/50 hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-40">
      <span className="mt-0.5 text-cyan-300">{icon}</span>
      <span>
        <span className="block text-sm font-semibold text-slate-100">{title}</span>
        <span className="block text-xs leading-snug text-slate-400">{desc}</span>
      </span>
    </button>
  );
}

export function ExportPanel() {
  const engines = useSim((s) => s.engines);
  const comparison = useSim((s) => s.comparison);
  const scenarioId = useSim((s) => s.scenarioId);
  const status = useSim((s) => s.status);
  const { toast, loadNetwork } = useSim.getState();
  const fileRef = useRef<HTMLInputElement>(null);
  const runner = getRunner();
  const scenarioName = scenarioId ? getScenario(scenarioId)?.title ?? scenarioId : 'Manual';
  const slug = `${(scenarioId ?? 'manual').replace(/_/g, '-')}-${timestampSlug()}`;
  const hasRun = engines.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs leading-relaxed text-slate-400">
        Exports contain the actual values recorded by the simulator for the current run{comparison ? ' and the latest comparison experiment' : ''}. CSV files are RFC 4180-escaped and open directly in Excel or Google Sheets.
        {status === 'running' && <span className="text-amber-300"> The run is still in progress: exports are a snapshot of the current state.</span>}
      </p>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <ExportButton
          icon={<FileSpreadsheet className="h-5 w-5" />}
          title="Experiment results (CSV)"
          desc="One row per algorithm: PDR, loss, delay, throughput, recovery, recalculations, parameters and failure events."
          disabled={!hasRun}
          onClick={() => downloadText(`netroute-results-${slug}.csv`, resultsCsv(runner.results(), runner.config, scenarioName, runner.appliedEvents))}
        />
        <ExportButton
          icon={<FileSpreadsheet className="h-5 w-5" />}
          title="Comparison experiment (CSV)"
          desc="Adaptive vs multipath rows from the latest A/B experiment or completed live compare run."
          disabled={!comparison}
          onClick={() => comparison && downloadText(`netroute-comparison-${slug}.csv`, resultsCsv(comparison.results, comparison.config, comparison.title, comparison.failureEvents))}
        />
        <ExportButton
          icon={<Package className="h-5 w-5" />}
          title="Packet-level statistics (CSV)"
          desc="Every packet: status, creation/arrival time, delay, drop reason and location, hops, assigned and final route."
          disabled={!hasRun}
          onClick={() => downloadText(`netroute-packets-${slug}.csv`, packetsCsv(runner))}
        />
        <ExportButton
          icon={<ScrollText className="h-5 w-5" />}
          title="Event log (CSV)"
          desc="Chronological simulated events with timestamps, categories, subjects and explanations."
          disabled={!hasRun}
          onClick={() => downloadText(`netroute-event-log-${slug}.csv`, logCsv(runner.engines.flatMap((e) => e.log).sort((a, b) => a.time - b.time || a.id - b.id)))}
        />
        <ExportButton
          icon={<FileJson className="h-5 w-5" />}
          title="Experiment summary (JSON)"
          desc="Parameters, model formulas, metrics, paths, reroutes, recoveries, comparison and topology in one file."
          disabled={!hasRun && !comparison}
          onClick={() => downloadText(`netroute-summary-${slug}.json`, JSON.stringify(summaryJson(runner, scenarioId, comparison), null, 2), 'application/json')}
        />
        <ExportButton
          icon={<Network className="h-5 w-5" />}
          title="Topology snapshot (JSON)"
          desc="Routers, positions, link costs, bandwidth, delay, status and congestion. Can be re-imported."
          onClick={() => downloadText(`netroute-topology-${timestampSlug()}.json`, JSON.stringify(topologyJson(runner.network), null, 2), 'application/json')}
        />
      </div>
      <div className="flex items-center gap-3 rounded-lg border border-dashed border-ink-600 p-3">
        <FileUp className="h-5 w-5 text-slate-400" />
        <div className="flex-1 text-xs text-slate-400">Import a topology JSON (exported by NETROUTE). Self-loops, duplicates and non-positive costs are rejected.</div>
        <button className="btn-ghost text-xs" onClick={() => fileRef.current?.click()}>
          Import topology
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            const res = parseTopology(await f.text());
            if (typeof res === 'string') toast('error', `Import failed: ${res}`);
            else loadNetwork(res, `Topology "${f.name}"`);
          }}
        />
      </div>
    </div>
  );
}
