import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Router as RouterIcon, XOctagon } from 'lucide-react';
import { memo } from 'react';
import type { Router } from '../../types/network';

export type RouterNodeData = {
  router: Router;
  role: 'source' | 'destination' | null;
  isSelected: boolean;
  onPath: string | null; // colour of the highlighted route through this router
  isDraftSource: boolean;
};

export type RouterFlowNode = Node<RouterNodeData, 'router'>;

const handleStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 1, height: 1, minWidth: 1, minHeight: 1, opacity: 0, border: 'none', background: 'transparent' };

function RouterNodeView({ data }: NodeProps<RouterFlowNode>) {
  const { router, role, isSelected, onPath, isDraftSource } = data;
  const failed = router.status === 'failed';
  const ring = failed ? '#ef4444' : role === 'source' ? '#22d3ee' : role === 'destination' ? '#22c55e' : onPath ?? '#3a4a6b';
  const roleLabel = role === 'source' ? 'Source' : role === 'destination' ? 'Destination' : failed ? 'Failed' : 'Router';

  return (
    <div className="relative h-[58px] w-[58px]" title={`${router.name} (${router.id}) — ${failed ? 'FAILED' : 'online'}${role ? ` — ${roleLabel}` : ''}`}>
      <Handle type="target" position={Position.Top} style={handleStyle} isConnectable={false} />
      <Handle type="source" position={Position.Top} style={handleStyle} isConnectable={false} />

      {(isSelected || isDraftSource) && (
        <div className={`absolute -inset-[7px] rounded-full border-2 border-dashed ${isDraftSource ? 'border-amber-300' : 'border-cyan-300'} animate-[spin_8s_linear_infinite]`} />
      )}
      {role && !failed && <div className="absolute inset-0 animate-pulseRing rounded-full" style={{ boxShadow: `0 0 0 2px ${ring}` }} />}

      <div
        className="absolute inset-0 flex flex-col items-center justify-center rounded-full transition-colors"
        style={{
          background: failed ? 'radial-gradient(circle at 35% 30%, #3b1219, #1a0a0e)' : 'radial-gradient(circle at 35% 30%, #1e2b48, #0d1424)',
          border: `2px solid ${ring}`,
          boxShadow: failed ? '0 0 18px rgba(239,68,68,0.35)' : onPath || role ? `0 0 16px ${ring}55` : '0 4px 14px rgba(0,0,0,0.5)',
        }}
      >
        {failed ? <XOctagon className="h-4 w-4 text-red-400" /> : <RouterIcon className="h-4 w-4" style={{ color: role ? ring : '#94a3b8' }} />}
        <span className={`font-mono text-[13px] font-semibold leading-tight ${failed ? 'text-red-300 line-through' : 'text-slate-100'}`}>{router.id}</span>
      </div>

      {(role || failed) && <div className="pointer-events-none absolute left-1/2 top-[64px] -translate-x-1/2 whitespace-nowrap">
        <span
          className={`rounded px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wider ${
            failed
              ? 'bg-red-500/15 text-red-300'
              : role === 'source'
                ? 'bg-cyan-500/15 text-cyan-300'
                : role === 'destination'
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'text-slate-500'
          }`}
        >
          {roleLabel}
        </span>
      </div>}
    </div>
  );
}

export const RouterNode = memo(RouterNodeView);
