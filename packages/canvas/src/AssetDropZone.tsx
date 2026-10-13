import type {DragEvent,ClipboardEvent} from 'react';
import {ASSET_DRAG_TYPE,isEditing} from './inputBindings';
export type AssetInput={files?:File[];text?:string;versionId?:string};
export function droppedInput(event:DragEvent):AssetInput|null{
 if(isEditing(event.target))return null;
 const versionId=event.dataTransfer.getData(ASSET_DRAG_TYPE);if(versionId)return {versionId};
 const files=Array.from(event.dataTransfer.files);if(files.length)return {files};
 const text=event.dataTransfer.getData('text/plain');return text?{text}:null;
}
export function pastedInput(event:ClipboardEvent):AssetInput|null{
 if(isEditing(event.target))return null;
 const files=Array.from(event.clipboardData.files);if(files.length)return {files};
 const text=event.clipboardData.getData('text/plain');return text?{text}:null;
}
