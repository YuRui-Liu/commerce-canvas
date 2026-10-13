CREATE TABLE image_runs (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  canvas_id TEXT NOT NULL, node_id TEXT NOT NULL,
  settings TEXT NOT NULL CHECK(json_valid(settings)), inputs TEXT NOT NULL CHECK(json_valid(inputs)),
  facts TEXT NOT NULL CHECK(json_valid(facts)), request TEXT NOT NULL CHECK(json_valid(request)),
  context_hash TEXT NOT NULL, approved_at TEXT,
  status TEXT NOT NULL CHECK(status IN ('queued','submitting','running','downloading','succeeded','failed','unknown','cancelled')),
  stop_requested INTEGER NOT NULL DEFAULT 0 CHECK(stop_requested IN (0,1)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE image_slots (
  run_id TEXT NOT NULL REFERENCES image_runs(id) ON DELETE CASCADE,
  slot_index INTEGER NOT NULL CHECK(slot_index BETWEEN 0 AND 3),
  attempt_id TEXT NOT NULL UNIQUE, output_asset_id TEXT NOT NULL UNIQUE, output_version_id TEXT NOT NULL UNIQUE,
  remote_id TEXT UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('queued','submitting','running','downloading','succeeded','failed','unknown','cancelled')),
  error TEXT, progress REAL CHECK(progress BETWEEN 0 AND 100),
  result_version_id TEXT REFERENCES asset_versions(id) ON DELETE RESTRICT,
  actual_width INTEGER, actual_height INTEGER,
  PRIMARY KEY(run_id,slot_index)
);
CREATE INDEX image_runs_project ON image_runs(project_id,created_at);
CREATE TRIGGER protect_active_image_runs BEFORE DELETE ON projects
WHEN EXISTS(SELECT 1 FROM image_runs WHERE project_id=OLD.id AND approved_at IS NOT NULL AND status IN ('queued','submitting','running','downloading','unknown'))
BEGIN SELECT RAISE(ABORT,'Active image runs prevent project deletion'); END;
