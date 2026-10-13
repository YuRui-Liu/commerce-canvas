ALTER TABLE image_slots ADD COLUMN result_url TEXT;
ALTER TABLE image_slots ADD COLUMN warning TEXT;
CREATE TABLE generation_outputs (
  version_id TEXT PRIMARY KEY REFERENCES asset_versions(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES image_runs(id) ON DELETE CASCADE,
  slot_index INTEGER NOT NULL,
  derivative_key TEXT NOT NULL UNIQUE,
  source_version_id TEXT REFERENCES asset_versions(id) ON DELETE CASCADE,
  fit TEXT, background TEXT, width INTEGER NOT NULL, height INTEGER NOT NULL,
  FOREIGN KEY(run_id,slot_index) REFERENCES image_slots(run_id,slot_index)
);
