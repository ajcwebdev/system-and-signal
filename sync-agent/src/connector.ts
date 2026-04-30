import {
  type AbstractPowerSyncDatabase,
  type PowerSyncBackendConnector,
  UpdateType,
} from "@powersync/node"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const ALLOWED_TABLES: Record<string, Set<string>> = {
  projects: new Set(["name", "owner_id", "created_at"]),
  tasks: new Set([
    "project_id",
    "title",
    "description",
    "status",
    "assigned_to",
    "priority",
    "created_at",
    "completed_at",
  ]),
}

const execFileAsync = promisify(execFile)

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}

function sqlLiteral(value: unknown) {
  if (value === null || value === undefined) return "NULL"
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Invalid numeric SQL value")
    return String(value)
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE"
  return `'${String(value).replaceAll("'", "''")}'`
}

async function executePostgres(statements: string[]) {
  if (statements.length === 0) return

  const sql = ["BEGIN;", ...statements, "COMMIT;"].join("\n")
  try {
    await execFileAsync(
      "docker",
      [
        "compose",
        "exec",
        "-T",
        "postgres",
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-q",
        "-c",
        sql,
      ],
      { cwd: process.cwd(), maxBuffer: 1024 * 1024 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Postgres upload failed via docker compose: ${message}`)
  }
}

export class Connector implements PowerSyncBackendConnector {
  async fetchCredentials() {
    const endpoint = process.env.POWERSYNC_URL
    const token = process.env.POWERSYNC_TOKEN

    if (!endpoint || !token) {
      throw new Error(
        "POWERSYNC_URL and POWERSYNC_TOKEN must be set. Run \"bun setup\" first.",
      )
    }

    return {
      endpoint,
      token,
    }
  }

  async uploadData(database: AbstractPowerSyncDatabase) {
    const batch = await database.getCrudBatch()
    if (!batch) return

    const statements: string[] = []

    for (const op of batch.crud) {
      const allowedCols = ALLOWED_TABLES[op.table]
      if (!allowedCols) {
        throw new Error(`Upload rejected: unknown table "${op.table}"`)
      }

      const table = quoteIdentifier(op.table)

      switch (op.op) {
        case UpdateType.PUT: {
          const data = op.opData ?? {}
          const cols = Object.keys(data).filter((c) => allowedCols.has(c))
          const columnList = ["id", ...cols].map(quoteIdentifier).join(", ")
          const values = [op.id, ...cols.map((c) => data[c])]
            .map(sqlLiteral)
            .join(", ")
          const conflict = cols.length
            ? `DO UPDATE SET ${cols
                .map((c) => `${quoteIdentifier(c)} = EXCLUDED.${quoteIdentifier(c)}`)
                .join(", ")}`
            : "DO NOTHING"
          statements.push(
            `INSERT INTO ${table} (${columnList}) VALUES (${values}) ON CONFLICT ("id") ${conflict};`,
          )
          break
        }
        case UpdateType.PATCH: {
          const data = op.opData ?? {}
          const cols = Object.keys(data).filter((c) => allowedCols.has(c))
          if (cols.length === 0) break
          const sets = cols
            .map((c) => `${quoteIdentifier(c)} = ${sqlLiteral(data[c])}`)
            .join(", ")
          statements.push(
            `UPDATE ${table} SET ${sets} WHERE "id" = ${sqlLiteral(op.id)};`,
          )
          break
        }
        case UpdateType.DELETE: {
          statements.push(`DELETE FROM ${table} WHERE "id" = ${sqlLiteral(op.id)};`)
          break
        }
      }
    }

    await executePostgres(statements)
    await batch.complete()
  }
}
