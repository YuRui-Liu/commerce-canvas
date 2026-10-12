import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  BrandProfileSchema, DomainError, FactsSchema, IdSchema, NameSchema, ProductUpdateSchema,
  ProjectSchema, RevisionSchema, SkuSchema,
  type BrandProfile, type ProductUpdate, type Project, type Sku,
} from '../../../contracts/src';

/** Owns no connection: the runtime must close its database on shutdown. All mutations are synchronous. */
export class ProjectRepository {
  constructor(private readonly db: DatabaseSync) {}

  create(name: string): Project {
    const project = ProjectSchema.parse({ id: randomUUID(), name, revision: 1, facts: {} });
    this.db.prepare('INSERT INTO projects (id, name, revision, facts) VALUES (?, ?, ?, ?)')
      .run(project.id, project.name, project.revision, JSON.stringify(project.facts));
    return project;
  }

  get(id: string): Project | null {
    const row = this.db.prepare('SELECT id, name, revision, facts FROM projects WHERE id = ?').get(IdSchema.parse(id));
    return row ? ProjectSchema.parse({ ...row, facts: JSON.parse(String(row.facts)) }) : null;
  }

  list(): Project[] {
    return this.db.prepare('SELECT id, name, revision, facts FROM projects ORDER BY name, id').all()
      .map(row => ProjectSchema.parse({ ...row, facts: JSON.parse(String(row.facts)) }));
  }

  updateFacts(id: string, expectedRevision: number, facts: Record<string, string>): Project {
    return this.updateProduct(id, expectedRevision, { facts: FactsSchema.parse(facts) });
  }

  /** Replaces supplied SKU list / brand only; omitted fields stay unchanged. Revision protects the entire aggregate. */
  updateProduct(id: string, expectedRevision: number, update: ProductUpdate): Project {
    IdSchema.parse(id);
    RevisionSchema.parse(expectedRevision);
    const parsed = ProductUpdateSchema.parse(update);
    return this.transaction(() => {
      const existing = this.requireRevision(id, expectedRevision);
      const changed = this.db.prepare('UPDATE projects SET facts = ?, revision = revision + 1 WHERE id = ? AND revision = ?')
        .run(JSON.stringify(parsed.facts ?? existing.facts), id, expectedRevision);
      if (changed.changes !== 1) throw new DomainError('REVISION_CONFLICT', 'Project revision changed');
      if (parsed.skus !== undefined) {
        this.db.prepare('DELETE FROM skus WHERE project_id = ?').run(id);
        const insert = this.db.prepare('INSERT INTO skus (id, project_id, code, name, attributes) VALUES (?, ?, ?, ?, ?)');
        for (const sku of parsed.skus) insert.run(sku.id, id, sku.code, sku.name, JSON.stringify(sku.attributes));
      }
      if (parsed.brand !== undefined) {
        this.db.prepare('DELETE FROM brand_profiles WHERE project_id = ?').run(id);
        if (parsed.brand !== null) {
          this.db.prepare('INSERT INTO brand_profiles (project_id, name, description, guidelines) VALUES (?, ?, ?, ?)')
            .run(id, parsed.brand.name, parsed.brand.description, JSON.stringify(parsed.brand.guidelines));
        }
      }
      return this.get(id)!;
    });
  }

  rename(id: string, expectedRevision: number, name: string): Project {
    IdSchema.parse(id);
    RevisionSchema.parse(expectedRevision);
    const parsedName = NameSchema.parse(name);
    return this.transaction(() => {
      this.requireRevision(id, expectedRevision);
      this.db.prepare('UPDATE projects SET name = ?, revision = revision + 1 WHERE id = ? AND revision = ?').run(parsedName, id, expectedRevision);
      return this.get(id)!;
    });
  }

  delete(id: string, expectedRevision: number): void {
    IdSchema.parse(id);
    RevisionSchema.parse(expectedRevision);
    this.transaction(() => {
      this.requireRevision(id, expectedRevision);
      this.db.prepare('DELETE FROM projects WHERE id = ? AND revision = ?').run(id, expectedRevision);
    });
  }

  listSkus(projectId: string): Sku[] {
    return this.db.prepare('SELECT id, project_id AS projectId, code, name, attributes FROM skus WHERE project_id = ? ORDER BY code, id')
      .all(IdSchema.parse(projectId)).map(row => SkuSchema.parse({ ...row, attributes: JSON.parse(String(row.attributes)) }));
  }

  getSku(projectId: string, skuId: string): Sku | null {
    const row = this.db.prepare('SELECT id, project_id AS projectId, code, name, attributes FROM skus WHERE project_id = ? AND id = ?')
      .get(IdSchema.parse(projectId), IdSchema.parse(skuId));
    return row ? SkuSchema.parse({ ...row, attributes: JSON.parse(String(row.attributes)) }) : null;
  }

  getBrandProfile(projectId: string): BrandProfile | null {
    const row = this.db.prepare('SELECT project_id AS projectId, name, description, guidelines FROM brand_profiles WHERE project_id = ?')
      .get(IdSchema.parse(projectId));
    return row ? BrandProfileSchema.parse({ ...row, guidelines: JSON.parse(String(row.guidelines)) }) : null;
  }

  private requireRevision(id: string, revision: number): Project {
    const project = this.get(id);
    if (!project) throw new DomainError('NOT_FOUND', 'Project does not exist');
    if (project.revision !== revision) throw new DomainError('REVISION_CONFLICT', 'Project revision changed');
    return project;
  }

  private transaction<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
