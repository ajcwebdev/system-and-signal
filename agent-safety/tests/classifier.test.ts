import { describe, expect, test } from "bun:test"

import { classifyCommand, classifyDomain, classifyPath } from "../src/classifier.ts"
import { getProfile } from "../src/policies.ts"

describe("command classification", () => {
  const profile = getProfile("guarded-dev")

  test("denies destructive commands", () => {
    expect(classifyCommand(profile, "terraform apply -auto-approve").decision).toBe("deny")
    expect(classifyCommand(profile, "git push --force origin main").decision).toBe("deny")
    expect(classifyCommand(profile, "rm -rf dist").decision).toBe("deny")
  })

  test("prompts for production-adjacent tools", () => {
    expect(classifyCommand(profile, "psql $DATABASE_URL").decision).toBe("prompt")
    expect(classifyCommand(profile, "aws s3 ls").decision).toBe("prompt")
    expect(classifyCommand(profile, "bun install").decision).toBe("prompt")
  })

  test("allows ordinary local checks", () => {
    const result = classifyCommand(profile, "bun test")
    expect(result.decision).toBe("allow")
    expect(result.ruleId).toBe("local-test-script")
  })
})

describe("path classification", () => {
  const profile = getProfile("guarded-dev")

  test("denies secret paths without blocking templates", () => {
    expect(classifyPath(profile, ".env").decision).toBe("deny")
    expect(classifyPath(profile, "config/.env.production").decision).toBe("deny")
    expect(classifyPath(profile, ".env.example").decision).toBe("allow")
  })

  test("prompts for migrations and lockfiles", () => {
    expect(classifyPath(profile, "db/migrations/001_init.sql").decision).toBe("prompt")
    expect(classifyPath(profile, "bun.lock").decision).toBe("prompt")
  })
})

describe("domain classification", () => {
  test("allows configured net-limited domains", () => {
    const profile = getProfile("net-limited")
    expect(classifyDomain(profile, "https://github.com/org/repo").decision).toBe("allow")
    expect(classifyDomain(profile, "registry.npmjs.org").decision).toBe("allow")
  })

  test("denies domains outside the net-limited allowlist", () => {
    expect(classifyDomain(getProfile("net-limited"), "example.com").decision).toBe("deny")
  })

  test("prompts for network in guarded development", () => {
    expect(classifyDomain(getProfile("guarded-dev"), "github.com").decision).toBe("prompt")
  })
})
