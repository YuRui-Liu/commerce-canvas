import type { AssetService, AssetVariant } from '../../../../packages/runtime/src/assets/import';
import { IdSchema } from '../../../../packages/contracts/src';

export const assetScheme = { scheme: 'commerce-asset', privileges: { standard: true, secure: true, supportFetchAPI: true } };
/** Register privileges before app.ready; bind the handler to the current trusted project. */
export function createAssetHandler(service: AssetService, currentProject: () => string | null) {
  return async (request: { url: string }): Promise<Response> => {
    // Parse the raw URL strictly, before URL normalization can discard traversal segments.
    const match = /^commerce-asset:\/\/asset\/([0-9a-f-]+)\/(original|thumbnail)$/.exec(request.url);
    if (!match || !IdSchema.safeParse(match[1]).success) return new Response('Invalid asset URL', { status: 400 });
    const projectId = currentProject(); if (!projectId) return new Response('No project', { status: 403 });
    try {
      const version = service.repository.get(match[1], projectId);
      const variant = match[2] as AssetVariant;
      const bytes = await service.read(version.id, variant, projectId);
      return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': variant === 'thumbnail' ? 'image/webp' : version.mime, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'", 'Cache-Control': 'no-store' } });
    } catch { return new Response('Asset unavailable', { status: 404 }); }
  };
}
export function registerAssetProtocol(protocol: { handle: (scheme: string, handler: (request: { url: string }) => Promise<Response>) => void }, service: AssetService, currentProject: () => string | null) {
  protocol.handle(assetScheme.scheme, createAssetHandler(service, currentProject));
}
