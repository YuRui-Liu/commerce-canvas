import type {AssetVersion} from '../../contracts/src/domain';
import {Dialog} from './Dialog';
import {ImageViewport} from './ImageViewer';
export function ImageCompare({assets,onClose}:{assets:[AssetVersion,AssetVersion];onClose:()=>void}){return <Dialog title="图片对比" onClose={onClose}><ImageViewport assets={assets} compare/></Dialog>;}
