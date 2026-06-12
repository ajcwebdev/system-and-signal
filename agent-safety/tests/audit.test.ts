import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { auditWorkspace } from "../src/audit.ts"

const tempDirs: string[] = []

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true })
  }
})

async function makeTempWorkspace(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "agent-safety-"))
  tempDirs.push(dir)
  return dir
}

describe("workspace audit", () => {
  test("reports secret paths without leaking secret contents", async () => {
    const workspace = await makeTempWorkspace()
    await writeFile(join(workspace, ".env"), "SECRET_VALUE=should-not-appear\n")
    await writeFile(
      join(workspace, "package.json"),
      JSON.stringify({
        scripts: {
          test: "bun test",
          infra: "terraform apply -auto-approve",
        },
      }),
    )

    const report = await auditWorkspace({ target: workspace })
    const serialized = JSON.stringify(report)

    expect(report.findings.some((finding) => finding.category === "secret-file")).toBe(true)
    expect(report.findings.some((finding) => finding.path.endsWith("#scripts.infra"))).toBe(true)
    expect(serialized).not.toContain("should-not-appear")
  })

  test("accepts clean local manifests and env templates", async () => {
    const workspace = await makeTempWorkspace()
    await writeFile(join(workspace, ".env.example"), "API_KEY=\n")
    await writeFile(
      join(workspace, "package.json"),
      JSON.stringify({
        scripts: {
          check: "bunx tsc --noEmit",
          test: "bun test",
        },
      }),
    )

    const report = await auditWorkspace({ target: workspace })
    expect(report.findings).toEqual([])
  })
})

