import type { CanvasDocument } from '../../contracts/src/canvas';
export type History={past:CanvasDocument[];present:CanvasDocument;future:CanvasDocument[]};
export const createHistory=(present:CanvasDocument):History=>({past:[],present,future:[]});
// Only layout documents enter history. Execution status lives outside this type.
export function commit(h:History,present:CanvasDocument):History {
  if(JSON.stringify(h.present)===JSON.stringify(present))return h;
  return {past:[...h.past.slice(-99),h.present],present,future:[]};
}
export function undo(h:History):History {const present=h.past.at(-1);return present?{past:h.past.slice(0,-1),present,future:[h.present,...h.future]}:h;}
export function redo(h:History):History {const present=h.future[0];return present?{past:[...h.past,h.present],present,future:h.future.slice(1)}:h;}
