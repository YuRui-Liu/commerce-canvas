import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CredentialMetadataSchema, requestSchemas, type CredentialMetadata, type CredentialService } from '../../../../packages/contracts/src/bridge';
interface SecureStorage { isEncryptionAvailable(): boolean; encryptString(secret: string): Buffer; getSelectedStorageBackend?(): string }
const entriesSchema = z.array(CredentialMetadataSchema.extend({ ciphertext: z.string().min(1) }).strict()).max(100);
export class CredentialStore {
  private readonly file: string;
  constructor(directory: string, private readonly secure: SecureStorage) { mkdirSync(directory, { recursive: true, mode: 0o700 }); this.file = join(directory, 'credentials.json'); }
  private read() { return existsSync(this.file) ? entriesSchema.parse(JSON.parse(readFileSync(this.file, 'utf8'))) : []; }
  private write(entries: z.infer<typeof entriesSchema>) {
    const temp = `${this.file}.${randomUUID()}.tmp`;
    try { writeFileSync(temp, JSON.stringify(entries), { flag: 'wx', mode: 0o600 }); renameSync(temp, this.file); }
    finally { rmSync(temp, { force: true }); }
  }
  list(): CredentialMetadata[] { return this.read().map(({ credentialId, service, maskedTail }) => ({ credentialId, service, maskedTail })); }
  store(service: CredentialService, secret: string): CredentialMetadata {
    if (!requestSchemas.storeCredential.safeParse({ service, secret }).success) throw new Error('INVALID_REQUEST');
    if (!this.secure.isEncryptionAvailable() || this.secure.getSelectedStorageBackend?.() === 'basic_text') throw new Error('SECURE_STORAGE_UNAVAILABLE');
    const metadata = { credentialId: randomUUID(), service, maskedTail: secret.length > 4 ? `••••${secret.slice(-4)}` : '••••' };
    try {
      const ciphertext = this.secure.encryptString(secret).toString('base64');
      const entries = this.read().filter(entry => entry.service !== service);
      this.write([...entries, { ...metadata, ciphertext }]); return metadata;
    } catch { throw new Error('CREDENTIAL_STORAGE_FAILED'); }
  }
  remove(credentialId: string) { requestSchemas.removeCredential.parse({ credentialId }); this.write(this.read().filter(entry => entry.credentialId !== credentialId)); }
}
