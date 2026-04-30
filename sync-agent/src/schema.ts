import { column, Schema, Table } from "@powersync/node";

const projects = new Table({
  name: column.text,
  owner_id: column.text,
  created_at: column.text,
});

const tasks = new Table(
  {
    project_id: column.text,
    title: column.text,
    description: column.text,
    status: column.text,
    assigned_to: column.text,
    priority: column.integer,
    created_at: column.text,
    completed_at: column.text,
  },
  { indexes: { project: ["project_id"], status: ["status"] } },
);

export const AppSchema = new Schema({ projects, tasks });

export type Database = (typeof AppSchema)["types"];
export type ProjectRecord = Database["projects"];
export type TaskRecord = Database["tasks"];
