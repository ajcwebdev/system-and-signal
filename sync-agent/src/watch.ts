import { db } from "./db.ts";
import type { TaskRecord } from "./schema.ts";

export async function watchNewTasks(userId: string) {
  console.log(`Watching for tasks assigned to ${userId}...`);
  const seen = new Set<string>();

  // Seed the set with tasks already in the database
  const existing = await db.getAll<TaskRecord>(
    "SELECT id FROM tasks WHERE assigned_to = ?",
    [userId],
  );
  for (const row of existing) seen.add(row.id);

  for await (const result of db.watch(
    "SELECT * FROM tasks WHERE assigned_to = ?",
    [userId],
  )) {
    const rows = (result.rows?._array ?? []) as TaskRecord[];
    for (const task of rows) {
      if (!seen.has(task.id)) {
        seen.add(task.id);
        console.log(
          `\n[sync] New task assigned: "${task.title}" (${task.status}, priority ${task.priority})`,
        );
      }
    }
  }
}
