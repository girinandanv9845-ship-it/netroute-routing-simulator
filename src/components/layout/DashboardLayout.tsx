import { ReactFlowProvider } from '@xyflow/react';
import { BarChart3, Download, FlaskConical, GitBranch, Info, Route, SlidersHorizontal, Table2, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSim } from '../../store/simulationStore';
import { LearnPanel } from '../common/LearnPanel';
import { SettingsModal } from '../common/SettingsModal';
import { Tabs } from '../common/Tabs';
import { Toasts } from '../common/Toasts';
import { EventLog } from '../logs/EventLog';
import { ComparisonPanel } from '../metrics/ComparisonPanel';
import { ExportPanel } from '../metrics/ExportPanel';
import { MetricCards } from '../metrics/MetricCards';
import { PerformanceCharts } from '../metrics/PerformanceCharts';
import { Inspector } from '../routing/Inspector';
import { PathDetails } from '../routing/PathDetails';
import { RoutingTable } from '../routing/RoutingTable';
import { EventInjectionPanel } from '../simulation/EventInjectionPanel';
import { ScenarioSelector } from '../simulation/ScenarioSelector';
import { SimulationControls } from '../simulation/SimulationControls';
import { NetworkCanvas } from '../topology/NetworkCanvas';
import { TopBar } from './TopBar';

type LeftTab = 'simulate' | 'scenarios' | 'events';
type RightTab = 'inspector' | 'routing' | 'paths';

export function DashboardLayout() {
  const [left, setLeft] = useState<LeftTab>('simulate');
  const [right, setRight] = useState<RightTab>('paths');
  const selection = useSim((s) => s.selection);
  const bottomTab = useSim((s) => s.bottomTab);
  const setBottomTab = useSim((s) => s.setBottomTab);
  const comparison = useSim((s) => s.comparison);

  useEffect(() => {
    if (selection) setRight((r) => (r === 'routing' && selection.type === 'router' ? r : 'inspector'));
  }, [selection]);

  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="mx-auto flex max-w-[1920px] flex-col gap-3 px-4 py-3">
        <MetricCards />

        <div className="grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[310px_minmax(0,1fr)_370px]">
          <aside className="panel flex min-h-0 flex-col lg:h-[calc(100vh-190px)] lg:min-h-[640px]">
            <div className="p-2">
              <Tabs<LeftTab>
                value={left}
                onChange={setLeft}
                items={[
                  { id: 'simulate', label: 'Simulate', icon: <SlidersHorizontal className="h-3.5 w-3.5" /> },
                  { id: 'scenarios', label: 'Scenarios', icon: <FlaskConical className="h-3.5 w-3.5" /> },
                  { id: 'events', label: 'Events', icon: <Zap className="h-3.5 w-3.5" /> },
                ]}
              />
            </div>
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-1">
              {left === 'simulate' && <SimulationControls />}
              {left === 'scenarios' && <ScenarioSelector />}
              {left === 'events' && <EventInjectionPanel />}
            </div>
          </aside>

          <section className="panel relative h-[620px] min-h-0 overflow-hidden lg:h-[calc(100vh-190px)] lg:min-h-[640px]" aria-label="Network topology workspace">
            <ReactFlowProvider>
              <NetworkCanvas />
            </ReactFlowProvider>
          </section>

          <aside className="panel flex min-h-0 flex-col lg:col-span-2 lg:h-[560px] 2xl:col-span-1 2xl:h-[calc(100vh-190px)] 2xl:min-h-[640px]">
            <div className="p-2">
              <Tabs<RightTab>
                value={right}
                onChange={setRight}
                items={[
                  { id: 'paths', label: 'Paths', icon: <GitBranch className="h-3.5 w-3.5" /> },
                  { id: 'routing', label: 'Routing', icon: <Table2 className="h-3.5 w-3.5" /> },
                  { id: 'inspector', label: 'Inspector', icon: <Info className="h-3.5 w-3.5" /> },
                ]}
              />
            </div>
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-1">
              {right === 'inspector' && <Inspector />}
              {right === 'routing' && <RoutingTable />}
              {right === 'paths' && <PathDetails />}
            </div>
          </aside>
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_440px]">
          <section className="panel min-w-0">
            <div className="panel-header flex-wrap">
              <h2 className="panel-title">
                <BarChart3 className="h-4 w-4 text-cyan-400" /> Performance Analysis
              </h2>
              <Tabs
                className="w-full sm:w-auto"
                value={bottomTab}
                onChange={setBottomTab}
                items={[
                  { id: 'performance', label: 'Performance', icon: <BarChart3 className="h-3.5 w-3.5" /> },
                  { id: 'comparison', label: 'Comparison', icon: <Route className="h-3.5 w-3.5" />, badge: comparison ? <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> : undefined },
                  { id: 'export', label: 'Export', icon: <Download className="h-3.5 w-3.5" /> },
                ]}
              />
            </div>
            <div className="p-3">
              {bottomTab === 'performance' && <PerformanceCharts />}
              {bottomTab === 'comparison' && <ComparisonPanel />}
              {bottomTab === 'export' && <ExportPanel />}
            </div>
          </section>
          <div className="h-[620px] xl:h-[760px]">
            <EventLog />
          </div>
        </div>

        <footer className="pb-2 pt-1 text-center text-[11px] text-slate-600">
          NETROUTE · Educational discrete-event simulation of adaptive and multipath routing · runs entirely in your browser · all metrics derived from simulated packet events
        </footer>
      </main>
      <LearnPanel />
      <SettingsModal />
      <Toasts />
    </div>
  );
}
