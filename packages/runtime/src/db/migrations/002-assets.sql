CREATE TABLE assets (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  trashed_at TEXT,
  UNIQUE(id, project_id)
);
CREATE TABLE asset_versions (
  id TEXT PRIMARY KEY NOT NULL,
  asset_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  hash TEXT NOT NULL CHECK(length(hash) = 64),
  metadata TEXT NOT NULL CHECK(json_valid(metadata)),
  orientation TEXT NOT NULL CHECK(json_valid(orientation)),
  FOREIGN KEY(asset_id, project_id) REFERENCES assets(id, project_id) ON DELETE CASCADE,
  UNIQUE(id, project_id)
);
CREATE INDEX asset_versions_hash ON asset_versions(hash);
CREATE TABLE asset_references (
  project_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('canvas', 'run')),
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  PRIMARY KEY(project_id, version_id, owner_id),
  FOREIGN KEY(version_id, project_id) REFERENCES asset_versions(id, project_id) ON DELETE CASCADE
);
