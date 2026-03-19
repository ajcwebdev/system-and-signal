import { mkdirSync } from "node:fs"
import { join } from "node:path"
import type { Database } from "bun:sqlite"
import { file, write } from "bun"

import type { AppPaths, ModelAdapter } from "./types.ts"

export type AppRuntime = {
  paths: AppPaths
  db: Database
  model: ModelAdapter
}

export function createAppPaths(rootDir = process.cwd()): AppPaths {
  const configDir = join(rootDir, "config")
  const dataDir = join(rootDir, "data")

  return {
    rootDir,
    configDir,
    dataDir,
    logsDir: join(dataDir, "logs"),
    skillsDir: join(dataDir, "skills"),
    soulPath: join(configDir, "SOUL.md"),
    memoryPath: join(dataDir, "MEMORY.md"),
    userPath: join(dataDir, "USER.md"),
    databasePath: join(dataDir, "sessions.sqlite"),
    hermesSandboxDir: join(dataDir, "sandboxes", "hermes"),
    hermesSandboxLogsDir: join(dataDir, "sandboxes", "hermes", "data", "logs"),
    hermesSandboxReportsDir: join(dataDir, "sandboxes", "hermes", "reports"),
  }
}

async function ensureFile(path: string, contents: string): Promise<void> {
  if (!(await file(path).exists())) {
    await write(path, contents)
  }
}

export async function ensureAppScaffold(paths: AppPaths): Promise<void> {
  mkdirSync(paths.configDir, { recursive: true })
  mkdirSync(paths.dataDir, { recursive: true })
  mkdirSync(paths.logsDir, { recursive: true })
  mkdirSync(paths.skillsDir, { recursive: true })

  await ensureFile(
    paths.soulPath,
    "# SOUL\n\nYou are the OpenClaw-style demo harness.\n- Stay concise.\n- Respect explicit user-authored identity.\n- Do not silently rewrite long-term memory.\n- Use tools when the request clearly requires them.\n",
  )
  await ensureFile(paths.memoryPath, "# MEMORY\n\n- The demo project is a Bun companion implementation for the article.\n")
  await ensureFile(paths.userPath, "# USER\n\n- No learned user facts yet.\n")
  await ensureFile(
    join(paths.logsDir, "demo.log"),
    "2026-03-14T18:01:12Z INFO boot complete\n2026-03-14T18:03:44Z ERROR request failed: timeout while contacting model gateway\n2026-03-14T18:05:15Z ERROR worker crashed after repeated timeout failures\n2026-03-14T18:09:31Z INFO recovery complete\n",
  )
}
