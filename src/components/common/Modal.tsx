import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

export function Modal({ open, onClose, title, icon, children, wide }: { open: boolean; onClose: () => void; title: string; icon?: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`panel flex max-h-[90vh] w-full animate-fadeIn flex-col ${wide ? 'max-w-4xl' : 'max-w-xl'}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="panel-header">
          <h2 className="panel-title">
            {icon}
            {title}
          </h2>
          <button className="btn-icon h-7 w-7" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="scroll-thin overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
