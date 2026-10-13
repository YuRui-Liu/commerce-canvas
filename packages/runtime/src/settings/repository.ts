import type { DatabaseSync } from 'node:sqlite';
import { ThemeSchema, type Theme } from '../../../contracts/src/domain';
import { internalSchemas, type CredentialMetadata } from '../../../contracts/src/bridge';
export class SettingsRepository {
  constructor(private readonly db: DatabaseSync) {}
  private get(key: string) { const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key); return row ? JSON.parse(String(row.value)) : undefined; }
  private set(key: string, value: unknown) { this.db.prepare('INSERT INTO settings VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value)); }
  getTheme(): Theme { return ThemeSchema.parse(this.get('theme') ?? 'studio'); }
  setTheme(theme: Theme) { this.set('theme', ThemeSchema.parse(theme)); return theme; }
  setCredentials(credentials: CredentialMetadata[]) { this.set('credentials', internalSchemas.setCredentialMetadata.parse({ credentials }).credentials); }
  getSettings() { return { theme: this.getTheme(), credentials: internalSchemas.setCredentialMetadata.parse({ credentials: this.get('credentials') ?? [] }).credentials }; }
}
