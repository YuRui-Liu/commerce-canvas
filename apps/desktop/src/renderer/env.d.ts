import type { DesktopBridge } from '../../../../packages/contracts/src/bridge';
declare global { interface Window { commerceCanvas: DesktopBridge } }
