import { z } from 'zod';

export const IdSchema = z.string().uuid();
export const NameSchema = z.string().trim().min(1).max(200);
export const RevisionSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER - 1);
export const FactsSchema = z.record(z.string().trim().min(1).max(100), z.string().max(4000))
  .refine(value => Object.keys(value).length <= 100, 'At most 100 entries are allowed');
export const InputRoleSchema = z.enum(['product', 'scene', 'style', 'facts', 'instruction', 'copy']);
export const RuntimeKindSchema = z.enum(['deepseek', 'codex', 'workbuddy']);
export const ThemeSchema = z.enum(['studio', 'editorial']);
export const AssetRefSchema = z.object({ assetId: IdSchema, versionId: IdSchema, role: InputRoleSchema }).strict();
export const ProjectSchema = z.object({ id: IdSchema, name: NameSchema, revision: RevisionSchema, facts: FactsSchema }).strict();

const RelativePathSchema = z.string().min(1).max(1024).refine(path =>
  !path.startsWith('/') && !path.includes('\\') && !path.includes(':') && !path.includes('\0') &&
  path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..'), 'Expected a safe relative path');
export const AssetVersionSchema = z.object({
  id: IdSchema, assetId: IdSchema, projectId: IdSchema,
  kind: z.enum(['image', 'text']), hash: z.string().regex(/^[a-f0-9]{64}$/),
  mime: z.string().min(3).max(200).regex(/^[\w.+-]+\/[\w.+-]+$/),
  relativePath: RelativePathSchema.nullable(), text: z.string().max(1_000_000).nullable(),
  width: z.number().int().positive().max(100_000).nullable(),
  height: z.number().int().positive().max(100_000).nullable(),
  createdAt: z.string().datetime({ offset: false }),
}).strict().superRefine((asset, context) => {
  if (asset.kind === 'image' && (asset.relativePath === null || asset.text !== null || asset.width === null || asset.height === null || !asset.mime.startsWith('image/'))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Images require path, dimensions and image MIME, with no text' });
  }
  if (asset.kind === 'text' && (asset.text === null || asset.width !== null || asset.height !== null || !asset.mime.startsWith('text/'))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Text assets require text and text MIME, with no dimensions' });
  }
});

export const SkuInputSchema = z.object({ id: IdSchema, code: z.string().trim().min(1).max(100), name: NameSchema, attributes: FactsSchema }).strict();
export const SkuSchema = SkuInputSchema.extend({ projectId: IdSchema });
export const BrandProfileInputSchema = z.object({ name: NameSchema, description: z.string().max(10_000), guidelines: FactsSchema }).strict();
export const BrandProfileSchema = BrandProfileInputSchema.extend({ projectId: IdSchema });
export const ProductUpdateSchema = z.object({
  facts: FactsSchema.optional(),
  skus: z.array(SkuInputSchema).max(1000).optional(),
  brand: BrandProfileInputSchema.nullable().optional(),
}).strict().refine(value => value.facts !== undefined || value.skus !== undefined || value.brand !== undefined, 'Provide at least one update');

export type InputRole = z.infer<typeof InputRoleSchema>;
export type RuntimeKind = z.infer<typeof RuntimeKindSchema>;
export type Theme = z.infer<typeof ThemeSchema>;
export type AssetRef = z.infer<typeof AssetRefSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type AssetVersion = z.infer<typeof AssetVersionSchema>;
export type Sku = z.infer<typeof SkuSchema>;
export type SkuInput = z.infer<typeof SkuInputSchema>;
export type BrandProfile = z.infer<typeof BrandProfileSchema>;
export type BrandProfileInput = z.infer<typeof BrandProfileInputSchema>;
export type ProductUpdate = z.infer<typeof ProductUpdateSchema>;
