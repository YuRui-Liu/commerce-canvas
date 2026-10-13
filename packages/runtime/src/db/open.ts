/// <reference types="vite/client" />
import { DatabaseSync } from 'node:sqlite';
import foundationSql from './migrations/001-foundation.sql?raw';
import assetsSql from './migrations/002-assets.sql?raw';
import settingsSql from './migrations/003-settings.sql?raw';
import canvasesSql from './migrations/004-canvases.sql?raw';

// Vite/Vitest inline the SQL so packaged apps do not need the source tree.
const migrations = [{ version: 1, sql: foundationSql }, { version: 2, sql: assetsSql }, { version: 3, sql: settingsSql }, { version: 4, sql: canvasesSql }];

export function openDatabase(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  try {
    db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY NOT NULL)');
      for (const migration of migrations) {
        if (!db.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(migration.version)) {
          db.exec(migration.sql);
          db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(migration.version);
        }
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
