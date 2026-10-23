import { useReactFlow } from '@xyflow/react';
import { Cable, LayoutGrid, Maximize, MousePointer2, PlusCircle, RotateCcw, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSim, type Tool } from '../../store/simulationStore';

function ToolButton({ label, active, onClick, children, danger, disabled }: { label: string; active?: boolean; onClick: () => void; children: ReactNode; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:opacity-30 ${
        active ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/50' : danger ? 'text-red-300 hover:bg-red-500/15' : 'text-slate-300 hover:bg-ink-700 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

export function TopologyToolbar() {
  const rf = useReactFlow();
  const tool = useSim((s) => s.tool);
  const selection = useSim((s) => s.selection);
  const { setTool, resetLayout, resetTopology, removeLink, removeRouter } = useSim.getState();

  const tools: { id: Tool; label: string; icon: ReactNode }[] = [
    { id: 'select', label: 'Select / drag routers', icon: <MousePointer2 className="h-4 w-4" /> },
    { id: 'add_router', label: 'Add router (click on canvas)', icon: <PlusCircle className="h-4 w-4" /> },
    { id: 'add_link', label: 'Add link (click two routers)', icon: <Cable className="h-4 w-4" /> },
  ];

  const removeSelected = () => {
    if (!selection) return;
    if (selection.type === 'router' && window.confirm(`Remove router ${selection.id} and all of its links?`)) removeRouter(selection.id);
    if (selection.type === 'link' && window.confirm(`Remove link ${selection.id.replace('-', '–')}?`)) removeLink(selection.id);
  };

  return (
    <div className="absolute left-3 top-3 z-10 flex items-center gap-0.5 rounded-lg border border-ink-600 bg-ink-900/90 p-1 shadow-lg backdrop-blur">
      {tools.map((t) => (
        <ToolButton key={t.id} label={t.label} active={tool === t.id} onClick={() => setTool(t.id)}>
          {t.icon}
        </ToolButton>
      ))}
      <div className="mx-1 h-5 w-px bg-ink-600" />
      <ToolButton label="Zoom in" onClick={() => rf.zoomIn({ duration: 200 })}>
        <ZoomIn className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Zoom out" onClick={() => rf.zoomOut({ duration: 200 })}>
        <ZoomOut className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Fit network to screen" onClick={() => rf.fitView({ padding: 0.12, duration: 300 })}>
        <Maximize className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Reset router layout" onClick={resetLayout}>
        <LayoutGrid className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        label="Reset to default topology"
        onClick={() => window.confirm('Discard all topology changes and restore the default 12-router network?') && resetTopology()}
      >
        <RotateCcw className="h-4 w-4" />
      </ToolButton>
      <div className="mx-1 h-5 w-px bg-ink-600" />
      <ToolButton label="Remove selected router/link (Del)" onClick={removeSelected} disabled={!selection} danger>
        <Trash2 className="h-4 w-4" />
      </ToolButton>
    </div>
  );
}
