import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './Button';
export function Dialog({ title, onClose, children, anchor }: { title: string; onClose: () => void; children: ReactNode; anchor?:DOMRect }) {
  const ref = useRef<HTMLDialogElement>(null); const id = useId();
  useEffect(() => { const trigger = document.activeElement as HTMLElement | null; const dialog = ref.current!; dialog.showModal();
    if(anchor){const bounds=dialog.getBoundingClientRect();dialog.style.margin='0';dialog.style.left=`${Math.max(12,Math.min(anchor.left,innerWidth-bounds.width-12))}px`;dialog.style.top=`${Math.max(12,Math.min(anchor.bottom+8,innerHeight-bounds.height-12))}px`;}
    return () => { dialog.close(); trigger?.focus(); }; }, []);
  return <dialog ref={ref} className={`ui-dialog${anchor?' parameter-popover':''}`} aria-labelledby={id} onKeyDownCapture={e=>{if(e.key==='Escape'&&!e.nativeEvent.isComposing&&(e.target as Element).closest('dialog')===ref.current){e.preventDefault();e.stopPropagation();onClose();}}} onKeyDown={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()} onCancel={e => { e.preventDefault();e.stopPropagation();onClose(); }}>
    <div className="dialog-heading"><h2 id={id}>{title}</h2><Button variant="icon" aria-label="关闭弹窗" onClick={onClose}>×</Button></div>{children}
  </dialog>;
}
