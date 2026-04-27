#!/usr/bin/env bun

import { err, l } from "../helpers/log"
import { beforeAuthHeaders, beforeJson } from "../helpers/before-client"
import { waitForServer } from "../helpers/wait-for-server"
import { BEFORE_BASE } from "./shared"

async function main() {
  const server = Bun.spawn(["bun", "run", "src/before/api.ts"], {
    stdout: "inherit",
    stderr: "inherit",
  })

  try {
    await waitForServer({
      url: `${BEFORE_BASE}/audit-log`,
      label: "Before API (:3001)",
      headers: beforeAuthHeaders,
    })

    const accounts = await beforeJson("/accounts")
    l(JSON.stringify(accounts, null, 2))
  } finally {
    server.kill()
    await server.exited
  }
}

main().catch((error) => {
  err("Fatal error:", error)
  process.exit(1)
})
