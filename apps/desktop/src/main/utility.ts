import { RuntimeService } from '../../../../packages/runtime/src/service';
import { RpcRequestSchema } from '../../../../packages/contracts/src/bridge';
import { DomainError } from '../../../../packages/contracts/src/errors';
const service = new RuntimeService(process.argv[2]);
let queue = Promise.resolve();
process.parentPort?.on('message', ({ data }) => {
  queue = queue.then(async () => {
    const parsed = RpcRequestSchema.safeParse(data);
    if (!parsed.success) return;
    const request = parsed.data;
    try {
      if (request.method === 'shutdown') { await service.close(); process.parentPort?.postMessage({ id: request.id, ok: true, result: null }); process.exit(0); }
      const result = await service.dispatch(request); process.parentPort?.postMessage({ id: request.id, ok: true, result });
    } catch (error) { process.parentPort?.postMessage({ id: request.id, ok: false, code: error instanceof DomainError ? error.code : 'RUNTIME_ERROR' }); }
  });
});
