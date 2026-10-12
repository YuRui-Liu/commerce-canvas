import { probeRuntime } from '../../../../packages/runtime/src/index';
void probeRuntime().then((result) => process.parentPort?.postMessage(result));
