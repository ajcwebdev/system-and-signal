import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { expect, test } from "bun:test"

import { createCliProgram } from "../src/cli.ts"

const repoRoot = fileURLToPath(new URL("../", import.meta.url))

function createCliEnv() {
  const { OPENAI_API_KEY: _openaiApiKey, ...env } = process.env
  return env
}

function runCli(args: string[]) {
  return spawnSync(process.execPath, ["run", "src/cli.ts", ...args], {
    cwd: repoRoot,
    env: createCliEnv(),
    encoding: "utf8",
  })
}

function runAh(args: string[]) {
  return spawnSync(process.execPath, ["ah", ...args], {
    cwd: repoRoot,
    env: createCliEnv(),
    encoding: "utf8",
  })
}

test("createCliProgram help includes the top-level options", () => {
  const program = createCliProgram()
  const help = program.helpInformation()

  expect(help).toContain("Usage: bun ah [options]")
  expect(help).toContain("--profile <profile>")
  expect(help).toContain("--message <text>")
})

test("cli shows top-level help with no args without requiring OPENAI_API_KEY", () => {
  const result = runCli([])

  expect(result.status).toBe(0)
  expect(result.stdout).toContain("Usage: bun ah [options]")
  expect(result.stdout).toContain("--profile <profile>")
  expect(result.stdout).toContain('bun ah --profile openclaw --message "What shell do I prefer?"')
  expect(result.stderr).toBe("")
})

test("package ah script forwards options without requiring an extra separator", () => {
  const result = runAh(["--help"])

  expect(result.status).toBe(0)
  expect(result.stdout).toContain("Usage: bun ah [options]")
  expect(result.stdout).toContain("--profile <profile>")
  expect(result.stdout).toContain("--message <text>")
})

test("cli reports a missing message before runtime bootstrapping even with the legacy run token", () => {
  const result = runCli(["run", "--profile", "openclaw"])

  expect(result.status).toBe(1)
  expect(result.stderr).toContain("error: required option '--message <text>' not specified")
  expect(result.stderr).toContain("Usage: bun ah [options]")
  expect(result.stderr).not.toContain("OPENAI_API_KEY")
})

test("cli rejects invalid profile values before runtime bootstrapping", () => {
  const result = runCli(["run", "--profile", "invalid", "--message", "hi"])

  expect(result.status).toBe(1)
  expect(result.stderr).toContain("Allowed choices are openclaw, hermes.")
  expect(result.stderr).toContain("--profile <profile>")
  expect(result.stderr).not.toContain("OPENAI_API_KEY")
})
