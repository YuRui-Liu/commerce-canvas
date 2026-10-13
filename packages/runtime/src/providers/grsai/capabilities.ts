import { z } from 'zod';
import type { ImageCapabilities } from '../../../../contracts/src/imageProvider';
export const capabilities: readonly ImageCapabilities[] = ['gpt-image-2', 'gpt-image-2-vip'].map(model => ({ model: model as ImageCapabilities['model'], referenceImages: true, mask: false, transparentBackground: false, cancellation: false, idempotency: false }));
// Conservative local limits, not claims about the upstream limits.
const reference = z.string().max(20 * 1024 * 1024).refine(value => /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value) || /^https:\/\/[^\s]+$/.test(value));
export const imageRequestSchema = z.object({ model: z.enum(['gpt-image-2', 'gpt-image-2-vip']), prompt: z.string().trim().min(1).max(12000), aspectRatio: z.string(), quality: z.enum(['auto', 'medium']), images: z.array(reference).min(1).max(4).optional() }).strict().superRefine((request, context) => {
  const valid = request.model === 'gpt-image-2'
    ? request.quality === 'auto' && ['1024x1024','1090x1443','1443x1090','1024x1536','1536x1024','941x1672','1672x941', '1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9'].includes(request.aspectRatio)
    : (() => { const match = /^(\d+)x(\d+)$/.exec(request.aspectRatio); if (!match || request.quality !== 'medium') return false; const [w,h] = match.slice(1).map(Number); return w > 0 && h > 0 && w <= 3840 && h <= 3840 && w % 16 === 0 && h % 16 === 0 && Math.max(w/h,h/w) <= 3 && w*h >= 655360 && w*h <= 8294400; })();
  if (!valid) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Unsupported model parameters' });
});
