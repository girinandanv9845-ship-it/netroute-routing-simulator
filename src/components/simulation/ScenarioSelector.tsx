import { FlaskConical, Play, RotateCcw, Zap } from 'lucide-react';
import { useState } from 'react';
import { SCENARIOS } from '../../engine/scenarios';
import { describeAction, useSim } from '../../store/simulationStore';

const MODE_LABEL = { adaptive: 'Adaptive', multipath: 'Multipath', compare: 'Compare Both' };

export function ScenarioSelector() {
  const scenarioId = useSim((s) => s.scenarioId);
  const status = useSim((s) => s.status);
  const { loadScenario, runScenario, runExperiment } = useSim.getState();
  const [picked, setPicked] = useState(scenarioId ?? SCENARIOS[1].id);
  const sc = SCENARIOS.find((s) => s.id === picked)!;
  const running = status === 'running' || status === 'paused';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        {SCENARIOS.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setPicked(s.id)}
            className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[13px] transition-colors ${
              picked === s.id ? 'border-cyan-400/50 bg-cyan-500/10 text-cyan-100' : 'border-transparent text-slate-300 hover:bg-ink-800'
            }`}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-ink-700 font-mono text-[10px] text-slate-400">{i + 1}</span>
            <span className="flex-1 font-medium">{s.title}</span>
            {scenarioId === s.id && <span className="chip border-emerald-400/40 text-emerald-300">loaded</span>}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-ink-600 bg-ink-850 p-3 text-xs leading-relaxed">
        <div className="mb-1 text-sm font-semibold text-white">{sc.title}</div>
        <p className="mb-2 text-slate-400">{sc.description}</p>
        <dl className="space-y-1.5">
          <div>
            <dt className="font-semibold uppercase tracking-wider text-slate-500">Starting conditions</dt>
            <dd className="text-slate-300">{sc.startingConditions}</dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wider text-slate-500">Trigger</dt>
            <dd className="text-slate-300">{sc.trigger}</dd>
            {sc.script.length > 0 && (
              <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-amber-200/80">
                {sc.script.map((a, i) => (
                  <li key={i}>
                    t={a.at} ms · {describeAction(a.action)}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wider text-slate-500">Expected behaviour (hypothesis)</dt>
            <dd className="text-slate-300">{sc.expected}</dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wider text-slate-500">Recommended mode</dt>
            <dd className="text-slate-300">{MODE_LABEL[sc.recommendedMode]}</dd>
          </div>
        </dl>
        <p className="mt-2 text-[11px] italic text-slate-500">Expected behaviour is a hypothesis; measured results appear in the metrics and comparison panels.</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button className="btn-success col-span-2" onClick={() => runScenario(sc.id)} disabled={running}>
          <Play className="h-4 w-4" /> Run Scenario (live)
        </button>
        <button className="btn-ghost" onClick={() => loadScenario(sc.id)} disabled={running} title="Load the starting topology and script without starting">
          <Zap className="h-4 w-4" /> Load only
        </button>
        <button className="btn-ghost" onClick={() => loadScenario(sc.id)} title="Clear the run and restore the scenario's starting conditions">
          <RotateCcw className="h-4 w-4" /> Reset Scenario
        </button>
        <button className="btn-primary col-span-2" onClick={() => runExperiment(sc.id)} title="Simulate both algorithms instantly on isolated copies and open the comparison">
          <FlaskConical className="h-4 w-4" /> Run A/B Experiment (instant)
        </button>
      </div>
    </div>
  );
}
