import { describe, expect, test } from "bun:test"

import { renderConfig } from "../src/renderers.ts"

describe("Codex renderer", () => {
  test("renders guarded development workspace and secret boundaries", () => {
    const rendered = renderConfig("codex", "guarded-dev")

    expect(rendered.filename).toBe("config.toml")
    expect(rendered.body).toContain('sandbox_mode = "workspace-write"')
    expect(rendered.body).toContain("network_access = false")
    expect(rendered.body).toContain('"**/.env.*" = "none"')
  })

  test("renders net-limited domain allowlist", () => {
    const rendered = renderConfig("codex", "net-limited")

    expect(rendered.body).toContain("network_access = true")
    expect(rendered.body).toContain('mode = "limited"')
    expect(rendered.body).toContain('"github.com" = "allow"')
    expect(rendered.body).toContain('"*" = "deny"')
  })
})

describe("Claude renderer", () => {
  test("renders valid JSON permissions", () => {
    const rendered = renderConfig("claude", "safe-review")
    const parsed = JSON.parse(rendered.body)

    expect(rendered.filename).toBe("settings.json")
    expect(parsed.permissions.allow).toContain("Read(./**)")
    expect(parsed.permissions.deny).toContain("Read(./.env)")
    expect(parsed.permissions.deny).toContain("Bash(terraform destroy *)")
  })
})
