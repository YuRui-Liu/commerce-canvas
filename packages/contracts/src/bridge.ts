import { z } from 'zod';
import { IdSchema, NameSchema, RevisionSchema, ProductUpdateSchema, ThemeSchema, type Project, type AssetVersion, type Sku, type BrandProfile } from './domain';
import type { RuntimeHealth } from '../../runtime/src/index';
import { CanvasDocumentSchema, PanelStateSchema, type CanvasRecord, type CanvasSummary } from './canvas';
import type { GenerationRun } from './imageGeneration';
const empty = z.object({}).strict();
const project = z.object({ projectId: IdSchema }).strict();
const run = z.object({projectId:IdSchema,runId:IdSchema}).strict();
const slot = run.extend({slotIndex:z.number().int().min(0).max(3)}).strict();
export const remoteTaskIdSchema=z.string().min(1).max(200).regex(/^[A-Za-z0-9_.:-]+$/);
export const CredentialServiceSchema = z.enum(['grsai', 'deepseek']);
export type CredentialService = z.infer<typeof CredentialServiceSchema>;
export const CredentialMetadataSchema = z.object({ credentialId: IdSchema, service: CredentialServiceSchema, maskedTail: z.string().max(8) }).strict();
export type CredentialMetadata = z.infer<typeof CredentialMetadataSchema>;
export type AssetImportResult = { name: string; ok: true; version: AssetVersion } | { name: string; ok: false; error: 'INVALID_IMAGE' | 'IMPORT_FAILED' | 'TOO_MANY_FILES' };
export const requestSchemas = {
  prepareImageGeneration:z.object({projectId:IdSchema,canvasId:z.string().min(1).max(200),nodeId:z.string().min(1).max(200)}).strict(),
  confirmImageGeneration:run,
  listImageGenerations:z.object({projectId:IdSchema,canvasId:z.string().min(1).max(200)}).strict(),
  stopImageGeneration:run,
  resumeImageGeneration:run,
  bindImageGenerationTask:slot.extend({remoteId:remoteTaskIdSchema}).strict(),
  adaptImageGenerationOutput:slot.extend({fit:z.enum(['contain','cover']).default('contain'),background:z.string().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/).transform(s=>s.toLowerCase()).default('#ffffff')}).strict(),
  listCanvases: project,
  createCanvas: z.object({ projectId: IdSchema, name: NameSchema }).strict(),
  loadCanvas: z.object({ projectId: IdSchema, canvasId: z.string().min(1).max(200) }).strict(),
  saveCanvas: z.object({ projectId: IdSchema, document: CanvasDocumentSchema, panel: PanelStateSchema, expectedRevision: RevisionSchema }).strict(),
  getSelectedCanvas: project,
  selectCanvas: z.object({ projectId: IdSchema, canvasId: z.string().min(1).max(200) }).strict(),
  health: empty, listProjects: empty, createProject: z.object({ name: NameSchema }).strict(),
  getProject: project,
  updateProject: z.object({ projectId: IdSchema, expectedRevision: RevisionSchema, update: ProductUpdateSchema }).strict(),
  renameProject: z.object({ projectId: IdSchema, expectedRevision: RevisionSchema, name: NameSchema }).strict(),
  deleteProject: z.object({ projectId: IdSchema, expectedRevision: RevisionSchema }).strict(),
  importAssets: project,
  importAssetsBatch: project,
  importImages: z.object({ projectId: IdSchema, files: z.array(z.object({ name: NameSchema, bytes: z.instanceof(Uint8Array) }).strict()).max(100) }).strict(),
  importImageBytes: z.object({ projectId: IdSchema, bytes: z.instanceof(Uint8Array).refine(b => b.byteLength > 0 && b.byteLength <= 50 * 1024 * 1024), name: NameSchema }).strict(),
  saveText: z.object({ projectId: IdSchema, text: z.string().max(1_000_000) }).strict(),
  saveTextVersion: z.object({ projectId: IdSchema, assetId: IdSchema, text: z.string().max(1_000_000) }).strict(),
  listAssets: project,
  trashAsset: z.object({ projectId: IdSchema, assetId: IdSchema }).strict(),
  restoreAsset: z.object({ projectId: IdSchema, assetId: IdSchema }).strict(),
  getCurrentProject: empty, setCurrentProject: z.object({ projectId: IdSchema.nullable() }).strict(),
  getTheme: empty, setTheme: z.object({ theme: ThemeSchema }).strict(), getSettings: empty,
  storeCredential: z.object({ service: CredentialServiceSchema, secret: z.string().min(1).max(8192) }).strict(),
  listCredentialMetadata: empty, removeCredential: z.object({ credentialId: IdSchema }).strict(),
};
export type Method = keyof typeof requestSchemas;
export function parseRequest(method: unknown, payload: unknown) {
  if (typeof method !== 'string' || !Object.prototype.hasOwnProperty.call(requestSchemas, method)) throw new Error('INVALID_REQUEST');
  const parsed = requestSchemas[method as Method].safeParse(payload);
  if (!parsed.success) throw new Error('INVALID_REQUEST');
  return parsed.data;
}
export interface Results {
  prepareImageGeneration:GenerationRun;confirmImageGeneration:GenerationRun;listImageGenerations:GenerationRun[];
  stopImageGeneration:GenerationRun;resumeImageGeneration:GenerationRun;bindImageGenerationTask:GenerationRun;adaptImageGenerationOutput:AssetVersion;
  listCanvases: CanvasSummary[]; createCanvas: CanvasRecord; loadCanvas: CanvasRecord; saveCanvas: CanvasRecord;
  getSelectedCanvas: string | null; selectCanvas: string;
  health: RuntimeHealth; listProjects: Project[]; createProject: Project;
  getProject: { project: Project; skus: Sku[]; brand: BrandProfile | null } | null;
  updateProject: Project; renameProject: Project; deleteProject: null;
  importAssets: AssetVersion[]; importImageBytes: AssetVersion; saveText: AssetVersion; listAssets: AssetVersion[];
  importAssetsBatch: AssetImportResult[]; importImages: AssetImportResult[]; saveTextVersion: AssetVersion;
  trashAsset: null; restoreAsset: null; getCurrentProject: string | null; setCurrentProject: string | null;
  getTheme: 'studio' | 'editorial'; setTheme: 'studio' | 'editorial';
  getSettings: { theme: 'studio' | 'editorial'; credentials: CredentialMetadata[] };
  storeCredential: CredentialMetadata; listCredentialMetadata: CredentialMetadata[]; removeCredential: null;
}
export type DesktopBridge = { [K in Method]: keyof z.input<(typeof requestSchemas)[K]> extends never
  ? (payload?: z.input<(typeof requestSchemas)[K]>) => Promise<Results[K]>
  : (payload: z.input<(typeof requestSchemas)[K]>) => Promise<Results[K]> } & {
    onFlushRequested: (handler: () => Promise<void>) => () => void;
  };
export const internalSchemas = {
  ...requestSchemas,
  generationGet:run,
  generationRecover:empty,
  generationRecoverable:empty,
  generationClaim:slot,
  generationRecordRemote:slot.extend({remoteId:remoteTaskIdSchema}).strict(),
  generationUpdateSlot:slot.extend({status:z.enum(['running','downloading','failed','unknown']),progress:z.number().min(0).max(100).optional(),error:z.string().max(2000).optional()}).strict(),
  generationRecordResult:slot.extend({url:z.string().url().max(8192)}).strict(),
  generationResultUrl:slot,
  generationBind:slot.extend({remoteId:remoteTaskIdSchema}).strict(),
  generationArchive:slot.extend({bytes:z.instanceof(Uint8Array).refine(b=>b.byteLength>0&&b.byteLength<=50*1024*1024)}).strict(),
  generationRecoverOutput:slot,
  generationInputBytes:run,
  getAssetResponse: z.object({ projectId: IdSchema, versionId: IdSchema, variant: z.enum(['original', 'thumbnail']) }).strict(),
  setCredentialMetadata: z.object({ credentials: z.array(CredentialMetadataSchema).max(100) }).strict(),
  shutdown: empty,
};
export const RpcRequestSchema = z.object({ id: IdSchema, method: z.string().max(100), payload: z.unknown() }).strict().superRefine((r, ctx) => {
  if (!Object.prototype.hasOwnProperty.call(internalSchemas, r.method) || !internalSchemas[r.method as keyof typeof internalSchemas].safeParse(r.payload).success) ctx.addIssue({ code: 'custom', message: 'INVALID_REQUEST' });
});
