-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  created_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
);

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  assigned_to TEXT,
  priority INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
  completed_at TEXT
);

-- PowerSync requires a publication for logical replication
CREATE PUBLICATION powersync FOR TABLE projects, tasks;

-- Seed projects
INSERT INTO projects (id, name, owner_id) VALUES
  ('proj-001', 'Website Redesign', 'agent-001'),
  ('proj-002', 'Mobile App', 'agent-001'),
  ('proj-003', 'Data Pipeline', 'agent-001');

-- Seed tasks
INSERT INTO tasks (id, project_id, title, description, status, assigned_to, priority) VALUES
  ('task-001', 'proj-001', 'Design homepage mockup', 'Create wireframes and visual design for the new homepage', 'in_progress', 'agent-001', 2),
  ('task-002', 'proj-001', 'Implement responsive layout', 'Use CSS Grid and flexbox for responsive design across breakpoints', 'todo', 'agent-001', 1),
  ('task-003', 'proj-001', 'Set up CI/CD pipeline', 'Configure GitHub Actions for automated testing and deployment', 'done', 'agent-001', 0),
  ('task-004', 'proj-002', 'User authentication flow', 'Implement login, signup, and password reset screens', 'todo', 'agent-001', 3),
  ('task-005', 'proj-002', 'Push notifications', 'Set up FCM for push notifications on Android and iOS', 'todo', NULL, 1),
  ('task-006', 'proj-003', 'ETL job scheduler', 'Build cron-based ETL scheduler for nightly data imports', 'in_progress', 'agent-001', 2),
  ('task-007', 'proj-003', 'Data validation layer', 'Add JSON schema validation for all incoming pipeline data', 'todo', NULL, 1);
