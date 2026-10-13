import type { CanvasDocument, PanelState } from '../../../../../packages/contracts/src/canvas';

/** Snapshot references at the action boundary, never read later from live selection. */
export function recordRequirement(panel: PanelState, document: CanvasDocument): PanelState {
  if (!panel.chatDraft.trim()) return panel;
  const chosen = new Set(panel.selectedIds);
  return { ...panel, chatDraft: '', messages: [...panel.messages, {
    id: crypto.randomUUID(), role: 'user', text: panel.chatDraft,
    selectedNodes: structuredClone(document.nodes.filter(node => chosen.has(node.id))),
    createdAt: new Date().toISOString(),
  }] };
}
