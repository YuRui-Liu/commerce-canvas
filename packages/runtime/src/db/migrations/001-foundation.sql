CREATE TABLE projects (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
  revision INTEGER NOT NULL CHECK(revision >= 1),
  facts TEXT NOT NULL CHECK(json_valid(facts))
);
CREATE TABLE skus (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code TEXT NOT NULL CHECK(length(trim(code)) BETWEEN 1 AND 100),
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
  attributes TEXT NOT NULL CHECK(json_valid(attributes)),
  UNIQUE(project_id, code)
);
CREATE TABLE brand_profiles (
  project_id TEXT PRIMARY KEY NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
  description TEXT NOT NULL,
  guidelines TEXT NOT NULL CHECK(json_valid(guidelines))
);
