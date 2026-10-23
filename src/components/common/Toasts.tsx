import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useSim } from '../../store/simulationStore';

const STYLE = {
  info: { icon: Info, cls: 'border-cyan-400/40 text-cyan-100' },
  success: { icon: CheckCircle2, cls: 'border-emerald-400/40 text-emerald-100' },
  warning: { icon: AlertTriangle, cls: 'border-amber-400/40 text-amber-100' },
  error: { icon: XCircle, cls: 'border-red-400/50 text-red-100' },
};

export function Toasts() {
  const toasts = useSim((s) => s.toasts);
  const dismiss = useSim((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => {
        const { icon: Icon, cls } = STYLE[t.kind];
        return (
          <div key={t.id} className={`pointer-events-auto flex animate-fadeIn items-start gap-2 rounded-lg border bg-ink-800/95 px-3 py-2.5 text-sm shadow-2xl backdrop-blur ${cls}`}>
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1 leading-snug">{t.message}</span>
            <button className="text-slate-400 hover:text-white" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
