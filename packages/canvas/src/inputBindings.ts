export function isEditing(target:EventTarget|null):boolean{
 return target instanceof HTMLElement&&(target.isContentEditable||!!target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])'));
}
export const ASSET_DRAG_TYPE='application/x-commercecanvas-asset-version';
