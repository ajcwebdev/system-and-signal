import { db } from "./db.ts";
import type { ProjectRecord, TaskRecord } from "./schema.ts";

// -- Tool implementations: thin wrappers around local SQLite queries ----------

async function listProjects(): Promise<ProjectRecord[]> {
  return db.getAll<ProjectRecord>("SELECT * FROM projects ORDER BY name");
}

async function listTasks(filters: {
  project_id?: string;
  status?: string;
  assigned_to?: string;
}): Promise<TaskRecord[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters.project_id) {
    clauses.push("project_id = ?");
    params.push(filters.project_id);
  }
  if (filters.status) {
    clauses.push("status = ?");
    params.push(filters.status);
  }
  if (filters.assigned_to) {
    clauses.push("assigned_to = ?");
    params.push(filters.assigned_to);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db.getAll<TaskRecord>(
    `SELECT * FROM tasks ${where} ORDER BY priority DESC, created_at`,
    params,
  );
}

async function createTask(args: {
  project_id: string;
  title: string;
  description?: string;
  priority?: number;
}): Promise<{ id: string }> {
  const result = await db.execute(
    `INSERT INTO tasks (id, project_id, title, description, status, priority, created_at)
     VALUES (uuid(), ?, ?, ?, 'todo', ?, datetime('now'))
     RETURNING id`,
    [
      args.project_id,
      args.title,
      args.description ?? null,
      args.priority ?? 0,
    ],
  );
  const id = result.rows?.item(0)?.id as string;
  return { id };
}

async function updateTask(args: {
  task_id: string;
  status?: string;
  priority?: number;
  assigned_to?: string;
  description?: string;
}): Promise<{ success: boolean }> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (args.status !== undefined) {
    sets.push("status = ?");
    params.push(args.status);
  }
  if (args.priority !== undefined) {
    sets.push("priority = ?");
    params.push(args.priority);
  }
  if (args.assigned_to !== undefined) {
    sets.push("assigned_to = ?");
    params.push(args.assigned_to);
  }
  if (args.description !== undefined) {
    sets.push("description = ?");
    params.push(args.description);
  }
  if (sets.length === 0) return { success: false };
  params.push(args.task_id);
  const result = await db.execute(
    `UPDATE tasks SET ${sets.join(", ")} WHERE id = ? RETURNING id`,
    params,
  );
  return { success: (result.rows?.length ?? 0) > 0 };
}

async function completeTask(args: {
  task_id: string;
}): Promise<{ success: boolean }> {
  const result = await db.execute(
    `UPDATE tasks SET status = 'done', completed_at = datetime('now') WHERE id = ? RETURNING id`,
    [args.task_id],
  );
  return { success: (result.rows?.length ?? 0) > 0 };
}

async function searchTasks(args: { query: string }): Promise<TaskRecord[]> {
  const pattern = `%${args.query}%`;
  return db.getAll<TaskRecord>(
    `SELECT * FROM tasks WHERE title LIKE ? OR description LIKE ? ORDER BY priority DESC`,
    [pattern, pattern],
  );
}

async function getProjectSummary(args: {
  project_id: string;
}): Promise<{
  project_name: string;
  total: number;
  by_status: Record<string, number>;
  high_priority: number;
}> {
  const project = await db.get<ProjectRecord>(
    "SELECT * FROM projects WHERE id = ?",
    [args.project_id],
  );
  const tasks = await db.getAll<{ status: string; cnt: number }>(
    "SELECT status, count(*) as cnt FROM tasks WHERE project_id = ? GROUP BY status",
    [args.project_id],
  );
  const highPri = await db.get<{ cnt: number }>(
    "SELECT count(*) as cnt FROM tasks WHERE project_id = ? AND priority >= 2",
    [args.project_id],
  );
  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const row of tasks) {
    byStatus[row.status] = row.cnt;
    total += row.cnt;
  }
  return {
    project_name: project.name ?? "",
    total,
    by_status: byStatus,
    high_priority: highPri.cnt,
  };
}

// -- Tool schema for LLM function calling ------------------------------------

export const toolDefinitions = [
  {
    name: "list_projects",
    description: "List all projects",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "list_tasks",
    description:
      "List tasks, optionally filtered by project_id, status, or assigned_to",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Filter by project ID" },
        status: {
          type: "string",
          enum: ["todo", "in_progress", "done"],
          description: "Filter by status",
        },
        assigned_to: { type: "string", description: "Filter by assignee ID" },
      },
    },
  },
  {
    name: "create_task",
    description: "Create a new task in a project",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Project to add task to" },
        title: { type: "string", description: "Task title" },
        description: { type: "string", description: "Task description" },
        priority: {
          type: "integer",
          description: "Priority (0=low, 1=medium, 2=high, 3=critical)",
        },
      },
      required: ["project_id", "title"],
    },
  },
  {
    name: "update_task",
    description: "Update an existing task's status, priority, assignee, or description",
    input_schema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "Task ID to update" },
        status: { type: "string", enum: ["todo", "in_progress", "done"] },
        priority: { type: "integer" },
        assigned_to: { type: "string" },
        description: { type: "string" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "complete_task",
    description: "Mark a task as done",
    input_schema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "Task ID to complete" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "search_tasks",
    description: "Search tasks by title or description",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_project_summary",
    description:
      "Get a summary of a project: task counts by status, high-priority count",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Project ID" },
      },
      required: ["project_id"],
    },
  },
];

// -- Tool dispatcher ----------------------------------------------------------

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "list_projects":
      return listProjects();
    case "list_tasks":
      return listTasks(input as Parameters<typeof listTasks>[0]);
    case "create_task":
      return createTask(input as Parameters<typeof createTask>[0]);
    case "update_task":
      return updateTask(input as Parameters<typeof updateTask>[0]);
    case "complete_task":
      return completeTask(input as Parameters<typeof completeTask>[0]);
    case "search_tasks":
      return searchTasks(input as Parameters<typeof searchTasks>[0]);
    case "get_project_summary":
      return getProjectSummary(
        input as Parameters<typeof getProjectSummary>[0],
      );
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
