export type ImageModel = 'gpt-image-2' | 'gpt-image-2-vip';
export interface ImageRequest { model: ImageModel; prompt: string; aspectRatio: string; quality: 'auto' | 'medium'; images?: string[] }
export interface ImageTask { id: string; status: 'running' | 'succeeded' | 'failed' | 'violation'; progress?: number; results?: { url: string }[] }
export interface ImageCapabilities { model: ImageModel; referenceImages: true; mask: false; transparentBackground: false; cancellation: false; idempotency: false }
export interface ImageProviderPort { submit(request: ImageRequest): Promise<ImageTask>; get(id: string): Promise<ImageTask> }
