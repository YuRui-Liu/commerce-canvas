import { it, expect } from 'vitest';
import { mkdtempSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CredentialStore } from '../../apps/desktop/src/main/credentials';
it('refuses unavailable and plaintext storage, persists ciphertext and returns metadata only', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cc-credentials-'));
  try {
    const backend = { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(s.split('').reverse().join('')), decryptString: (s: Buffer) => s.toString().split('').reverse().join(''), getSelectedStorageBackend: () => 'keychain' };
    const store = new CredentialStore(directory, backend);
    const result = store.store('grsai', 'super-secret-key-1234');
    expect(result.maskedTail).toBe('••••1234');
    expect(JSON.stringify(store.list())).not.toContain('super-secret');
    expect(readFileSync(join(directory, 'credentials.json'), 'utf8')).not.toContain('super-secret');
    expect(statSync(join(directory, 'credentials.json')).mode & 0o777).toBe(0o600);
    expect(new CredentialStore(directory, backend).list()).toEqual(store.list());
    expect(store.resolveGrsai(result.credentialId)).toBe('super-secret-key-1234');
    expect(() => store.resolveGrsai('missing')).toThrow('CREDENTIAL_NOT_FOUND');
    expect(() => new CredentialStore(directory, { ...backend, decryptString: () => { throw Error('private secret'); } }).resolveGrsai()).toThrow('CREDENTIAL_DECRYPT_FAILED');
    expect(() => new CredentialStore(directory, { ...backend, getSelectedStorageBackend: () => 'basic_text' }).resolveGrsai()).toThrow('SECURE_STORAGE_UNAVAILABLE');
    for (const override of [{ isEncryptionAvailable: () => false }, { getSelectedStorageBackend: () => 'basic_text' }]) expect(() => new CredentialStore(directory, { ...backend, ...override }).store('grsai', 'secret')).toThrow('SECURE_STORAGE_UNAVAILABLE');
    store.remove(result.credentialId); expect(store.list()).toEqual([]);
    expect(store.store('grsai', 'tiny').maskedTail).toBe('••••');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
