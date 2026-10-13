CREATE TABLE canvases (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision >= 1),
  document TEXT NOT NULL CHECK(json_valid(document)),
  panel TEXT NOT NULL CHECK(json_valid(panel)),
  UNIQUE(id, project_id)
);
CREATE TABLE canvas_selection (
  project_id TEXT PRIMARY KEY NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  canvas_id TEXT NOT NULL,
  FOREIGN KEY(canvas_id, project_id) REFERENCES canvases(id, project_id) ON DELETE CASCADE
);
