import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './Button';
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null); const id = useId();
  useEffect(() => { const trigger = document.activeElement as HTMLElement | null; const dialog = ref.current!; dialog.showModal(); return () => { dialog.close(); trigger?.focus(); }; }, []);
  return <dialog ref={ref} className="ui-dialog" aria-labelledby={id} onCancel={e => { e.preventDefault(); onClose(); }}>
    <div className="dialog-heading"><h2 id={id}>{title}</h2><Button variant="icon" aria-label="关闭弹窗" onClick={onClose}>×</Button></div>{children}
  </dialog>;
}
