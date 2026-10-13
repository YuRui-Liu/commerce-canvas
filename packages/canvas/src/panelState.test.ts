import { expect, it } from 'vitest';
import { emptyPanel, PanelStateSchema, CanvasDocumentSchema, type CanvasDocument } from '../../contracts/src/canvas';
import { recordRequirement } from '../../../apps/desktop/src/renderer/workspace/panelState';
it('captures input references at save time independently of later selection and graph edits', () => {
  const document: CanvasDocument = { id: 'canvas', projectId: null, revision: 1, nodes: [{ id: 'one', kind: 'agent', position: { x: 1, y: 2 } }, { id: 'two', kind: 'agent', position: { x: 3, y: 4 } }], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
  const panel = recordRequirement({ ...emptyPanel(), selectedIds: ['one'], chatDraft: 'Requirement' }, document);
  panel.selectedIds = ['two']; document.nodes[0].position.x = 999;
  expect(panel.messages[0].selectedNodes).toEqual([{ id: 'one', kind: 'agent', position: { x: 1, y: 2 } }]);
  expect(panel.messages[0].role).toBe('user');
  expect(PanelStateSchema.safeParse({ ...panel, apiToken: 'secret' }).success).toBe(false);
  expect(CanvasDocumentSchema.safeParse({ ...document, productFullText: 'embedded facts' }).success).toBe(false);
});
