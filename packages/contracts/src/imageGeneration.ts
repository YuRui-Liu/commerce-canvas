import { z } from 'zod';
import type { InputRole } from './domain';
export const PhotographySchema=z.object({
  lighting:z.enum(['auto','softbox','window','highkey','hard','side','rim','jewelry']),
  direction:z.enum(['auto','front','left45','right45','side','top','back']),
  softness:z.enum(['auto','soft','hard']),temperature:z.enum(['auto','warm','neutral','cool']),shadow:z.enum(['auto','light','medium','strong']),
  camera:z.enum(['auto','fullframe','mediumformat','phone','cinema','custom']),customCamera:z.string().trim().min(1).max(200).optional(),
  lens:z.enum(['auto','standard','macro','wide','telephoto']),focalLength:z.number().finite().min(8).max(300).nullable(),
  aperture:z.enum(['auto','f1.4','f2','f2.8','f4','f5.6','f8','f11','f16']),angle:z.enum(['auto','front','45','side','top','low']),framing:z.enum(['auto','full','close','detail']),
}).strict().superRefine((p,c)=>{if(p.camera==='custom'&&!p.customCamera)c.addIssue({code:'custom',message:'Describe the custom camera'});});
export const GenerationSettingsSchema=z.object({
  prompt:z.string().trim().max(6000),model:z.enum(['gpt-image-2','gpt-image-2-vip']),ratio:z.enum(['1:1','3:4','4:3','2:3','3:2','9:16','16:9']),
  resolution:z.enum(['1K','2K','4K','custom']),width:z.number().int().positive().optional(),height:z.number().int().positive().optional(),count:z.number().int().min(1).max(4),photography:PhotographySchema,
}).strict();
export type GenerationSettings=z.infer<typeof GenerationSettingsSchema>;
export type Photography=z.infer<typeof PhotographySchema>;
export const defaultPhotography=():Photography=>({lighting:'auto',direction:'auto',softness:'auto',temperature:'auto',shadow:'auto',camera:'auto',lens:'auto',focalLength:null,aperture:'auto',angle:'auto',framing:'auto'});
export const defaultGenerationSettings=():GenerationSettings=>({prompt:'',model:'gpt-image-2',ratio:'1:1',resolution:'1K',count:1,photography:defaultPhotography()});
export const photographyPresets:Record<'white-product'|'lifestyle'|'macro',Partial<Photography>>={
  'white-product':{lighting:'softbox',softness:'soft',temperature:'neutral',shadow:'light',framing:'full'},
  lifestyle:{lighting:'window',softness:'soft',temperature:'warm',framing:'full'},
  macro:{lighting:'softbox',lens:'macro',aperture:'f8',framing:'detail'},
};
export interface GenerationBinding {role:InputRole;assetId:string;versionId:string;kind:'image'|'text';text?:string;imageIndex?:number;hash?:string}
export interface ResolvedGenerationSettings {model:GenerationSettings['model'];quality:'auto'|'medium';width:number;height:number;aspectRatio:string}
export type GenerationStatus='queued'|'submitting'|'running'|'downloading'|'succeeded'|'failed'|'unknown'|'cancelled';
export interface GenerationSlot {runId:string;slotIndex:number;attemptId:string;outputAssetId:string;outputVersionId:string;remoteId:string|null;status:GenerationStatus;error:string|null;progress:number|null;actualWidth:number|null;actualHeight:number|null;resultVersionId:string|null}
export interface GenerationRun {id:string;projectId:string;canvasId:string;nodeId:string;settings:GenerationSettings;inputs:GenerationBinding[];facts:Record<string,string>;request:ResolvedGenerationSettings & {prompt:string};contextHash:string;approvedAt:string|null;status:GenerationStatus;stopRequested:boolean;createdAt:string;updatedAt:string;slots:GenerationSlot[]}
export interface GenerationDerivative {versionId:string;sourceVersionId:string;fit:'contain'|'cover';background:string;width:number;height:number}
export interface GenerationSlot {warning:string|null;derivatives:GenerationDerivative[]}
