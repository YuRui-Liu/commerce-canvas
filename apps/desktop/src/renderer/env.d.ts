import type { RuntimeHealth } from '../../../../packages/runtime/src/index';
declare global { interface Window { commerceCanvas: { health(): Promise<RuntimeHealth> } } }
