import { z } from 'zod';

export const FailureSchema = z.object({
  code: z.string().min(1).max(100).regex(/^[A-Z][A-Z0-9_]*$/),
  message: z.string().min(1).max(4000),
  retryable: z.boolean(),
}).strict();
export type Failure = z.infer<typeof FailureSchema>;

export class DomainError extends Error implements Failure {
  constructor(public readonly code: string, message: string, public readonly retryable = false) {
    super(`${code}: ${message}`);
    this.name = 'DomainError';
  }
  toFailure(): Failure {
    return FailureSchema.parse({ code: this.code, message: this.message, retryable: this.retryable });
  }
}
