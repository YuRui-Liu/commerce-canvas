import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../src/db/open';
import { ProjectRepository } from '../src/projects/repository';
import { AssetRefSchema, AssetVersionSchema, FailureSchema, InputRoleSchema, ProjectSchema, RuntimeKindSchema, ThemeSchema } from '../../contracts/src';

describe('project storage in a real SQLite file', () => {
  let directory: string;
  let db: ReturnType<typeof openDatabase>;
  let repository: ProjectRepository;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'commercecanvas-projects-'));
    db = openDatabase(join(directory, 'projects.sqlite'));
    repository = new ProjectRepository(db);
  });
  afterEach(() => { db?.close(); rmSync(directory, { recursive: true, force: true }); });

  it('persists projects and facts across closing and reopening', () => {
    const created = repository.create('Spring collection');
    expect(created).toMatchObject({ name: 'Spring collection', revision: 1, facts: {} });
    const updated = repository.updateFacts(created.id, 1, { material: 'cotton', quote: "it's soft" });
    expect(updated.revision).toBe(2);
    db.close();
    db = openDatabase(join(directory, 'projects.sqlite'));
    repository = new ProjectRepository(db);
    expect(repository.get(created.id)).toEqual(updated);
    expect(repository.list()).toEqual([updated]);
  });

  it('rejects stale revision and keeps the successful update', () => {
    const project = repository.create('Shirt');
    repository.updateFacts(project.id, 1, { color: 'blue' });
    expect(() => repository.updateFacts(project.id, 1, { color: 'red' })).toThrowError(/REVISION_CONFLICT/);
    expect(repository.get(project.id)?.facts).toEqual({ color: 'blue' });
    expect(() => repository.updateFacts(randomUUID(), 1, {})).toThrowError(/NOT_FOUND/);
  });

  it('applies migrations once and enables foreign keys and WAL', () => {
    expect(db.prepare('SELECT version FROM schema_migrations').all()).toEqual([{ version: 1 }]);
    expect(db.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
    expect(db.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' });
    db.close();
    db = openDatabase(join(directory, 'projects.sqlite'));
    expect(db.prepare('SELECT version FROM schema_migrations').all()).toEqual([{ version: 1 }]);
  });

  it('updates project, SKU and brand atomically and supports scoped CRUD', () => {
    const project = repository.create('Shirt');
    const other = repository.create('Other');
    const skuId = randomUUID();
    const updated = repository.updateProduct(project.id, 1, {
      facts: { color: 'blue' },
      skus: [{ id: skuId, code: 'BLUE-S', name: 'Small blue', attributes: { size: 'S' } }],
      brand: { name: 'Acme', description: 'Everyday essentials', guidelines: { tone: 'warm' } },
    });
    expect(updated.revision).toBe(2);
    expect(repository.listSkus(project.id)).toMatchObject([{ id: skuId, projectId: project.id, code: 'BLUE-S' }]);
    expect(repository.getSku(project.id, skuId)?.attributes).toEqual({ size: 'S' });
    expect(repository.getSku(other.id, skuId)).toBeNull();
    expect(repository.listSkus(other.id)).toEqual([]);
    expect(repository.getBrandProfile(project.id)?.name).toBe('Acme');
    expect(repository.getBrandProfile(other.id)).toBeNull();
    repository.updateProduct(project.id, 2, { skus: [], brand: null });
    expect(repository.listSkus(project.id)).toEqual([]);
    expect(repository.getBrandProfile(project.id)).toBeNull();
    repository.rename(project.id, 3, 'New name');
    expect(repository.get(project.id)?.name).toBe('New name');
    repository.delete(project.id, 4);
    expect(repository.get(project.id)).toBeNull();
  });

  it('never leaves a partial project update after an invalid SKU or constraint failure', () => {
    const project = repository.create('Shirt');
    expect(() => repository.updateProduct(project.id, 1, {
      facts: { color: 'red' }, skus: [{ id: randomUUID(), code: '', name: 'Bad', attributes: {} }],
    })).toThrow();
    expect(repository.get(project.id)).toEqual(project);
    const other = repository.create('Other');
    const sharedId = randomUUID();
    repository.updateProduct(other.id, 1, { skus: [{ id: sharedId, code: 'OTHER', name: 'Other', attributes: {} }] });
    expect(() => repository.updateProduct(project.id, 1, {
      facts: { color: 'red' }, skus: [{ id: sharedId, code: 'RED', name: 'Red', attributes: {} }],
      brand: { name: 'Acme', description: '', guidelines: {} },
    })).toThrow();
    expect(repository.get(project.id)).toEqual(project);
    expect(repository.listSkus(project.id)).toEqual([]);
    expect(repository.getBrandProfile(project.id)).toBeNull();
    expect(repository.listSkus(other.id)).toHaveLength(1);
    expect(() => db.prepare('DELETE FROM projects WHERE id = ?').run(other.id)).not.toThrow();
    expect(repository.listSkus(other.id)).toEqual([]);
    expect(() => db.prepare('INSERT INTO skus (id, project_id, code, name, attributes) VALUES (?, ?, ?, ?, ?)')
      .run(randomUUID(), randomUUID(), 'A', 'Name', '{}')).toThrow(/FOREIGN KEY/);
    expect(() => db.prepare('INSERT INTO brand_profiles (project_id, name, description, guidelines) VALUES (?, ?, ?, ?)')
      .run(randomUUID(), 'Brand', '', '{}')).toThrow(/FOREIGN KEY/);
  });

  it('validates UUIDs, revisions, strings and record limits at runtime', () => {
    expect(() => repository.create('   ')).toThrow();
    expect(() => repository.create('x'.repeat(201))).toThrow();
    expect(() => repository.get('not-a-uuid')).toThrow();
    const project = repository.create('Valid');
    expect(() => repository.updateFacts(project.id, 0, {})).toThrow();
    expect(() => repository.updateFacts(project.id, 1, Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`f${i}`, 'value'])))).toThrow();
    expect(ProjectSchema.safeParse({ ...project, facts: { weight: 12 } }).success).toBe(false);
    expect(InputRoleSchema.safeParse('unknown').success).toBe(false);
    expect(RuntimeKindSchema.options).toEqual(['deepseek', 'codex', 'workbuddy']);
    expect(ThemeSchema.safeParse('unknown').success).toBe(false);
    expect(AssetRefSchema.safeParse({ assetId: randomUUID(), versionId: 'bad', role: 'product' }).success).toBe(false);
    expect(FailureSchema.safeParse({ code: 'REVISION_CONFLICT', message: 'Changed', retryable: false }).success).toBe(true);
    expect(FailureSchema.safeParse({ code: '', message: '', retryable: 'false' }).success).toBe(false);
    const asset = { id: randomUUID(), assetId: randomUUID(), projectId: project.id, kind: 'image', hash: 'a'.repeat(64), mime: 'image/png', relativePath: 'assets/image.png', text: null, width: 100, height: 100, createdAt: '2026-10-13T12:00:00.000Z' };
    expect(AssetVersionSchema.safeParse(asset).success).toBe(true);
    for (const invalid of [{ createdAt: '2026-02-30T12:00:00Z' }, { createdAt: 'yesterday' }, { width: -1 }, { relativePath: '../escape.png' }, { hash: 'short' }]) {
      expect(AssetVersionSchema.safeParse({ ...asset, ...invalid }).success).toBe(false);
    }
  });

  it('rolls back replacement of existing SKU and brand after a database constraint failure', () => {
    const project = repository.create('Original');
    const original = { id: randomUUID(), code: 'ORIGINAL', name: 'Original SKU', attributes: {} };
    repository.updateProduct(project.id, 1, {
      skus: [original], brand: { name: 'Original brand', description: '', guidelines: {} },
    });
    expect(() => repository.updateProduct(project.id, 2, {
      facts: { replacement: 'must rollback' },
      skus: [
        { id: randomUUID(), code: 'DUPLICATE', name: 'One', attributes: {} },
        { id: randomUUID(), code: 'DUPLICATE', name: 'Two', attributes: {} },
      ],
      brand: { name: 'New brand', description: '', guidelines: {} },
    })).toThrow();
    expect(repository.get(project.id)?.revision).toBe(2);
    expect(repository.get(project.id)?.facts).toEqual({});
    expect(repository.listSkus(project.id)).toEqual([{ ...original, projectId: project.id }]);
    expect(repository.getBrandProfile(project.id)?.name).toBe('Original brand');
    expect(() => repository.rename(project.id, 1, 'Stale')).toThrowError(/REVISION_CONFLICT/);
    expect(() => repository.delete(project.id, 1)).toThrowError(/REVISION_CONFLICT/);
    repository.delete(project.id, 2);
    expect(repository.listSkus(project.id)).toEqual([]);
    expect(repository.getBrandProfile(project.id)).toBeNull();
  });
});
