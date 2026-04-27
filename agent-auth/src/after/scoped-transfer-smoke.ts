#!/usr/bin/env bun

import { $ } from "bun"
import { err } from "../helpers/log"
import { waitForServer } from "../helpers/wait-for-server"

async function main() {
  await $`bun run src/seed.ts`.quiet()

  const server = Bun.spawn(["bun", "run", "src/server.ts"], {
    stdout: "inherit",
    stderr: "inherit",
  })

  try {
    await waitForServer({
      url: "http://localhost:3000/.well-known/agent-configuration",
      label: "Auth server (:3000)",
    })

    const scopedTransfer = Bun.spawn(
      ["bun", "run", "src/after/scoped-transfer-agent.ts"],
      {
        stdout: "inherit",
        stderr: "inherit",
      },
    )

    const exitCode = await scopedTransfer.exited
    if (exitCode !== 0) {
      throw new Error(
        `Scoped Transfer Agent exited with code ${exitCode ?? "unknown"}`,
      )
    }
  } finally {
    server.kill()
    await server.exited
  }
}

main().catch((error) => {
  err("Fatal error:", error)
  process.exit(1)
})
