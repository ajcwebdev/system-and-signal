#!/usr/bin/env bun

import { err, l } from "./helpers/log"
import { waitForServer } from "./helpers/wait-for-server"

async function main() {
  const server = Bun.spawn(["bun", "run", "src/server.ts"], {
    stdout: "inherit",
    stderr: "inherit",
  })
  const discoveryUrl = "http://localhost:3000/.well-known/agent-configuration"

  try {
    await waitForServer({ url: discoveryUrl, label: "Auth server (:3000)" })
    const body = await fetch(discoveryUrl).then(async (response) => {
      if (!response.ok) {
        throw new Error(
          `Discovery request failed with ${response.status} ${response.statusText}`,
        )
      }

      return response.json()
    })
    l(JSON.stringify(body, null, 2))
  } finally {
    server.kill()
    await server.exited
  }
}

main().catch((error) => {
  err("Fatal error:", error)
  process.exit(1)
})
