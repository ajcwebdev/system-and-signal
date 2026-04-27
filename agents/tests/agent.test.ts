import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { searchExplicitMemory } from "../src/agent/openclaw.ts"
import { createAppPaths, ensureAppScaffold, runProfile } from "../src/cli.ts"
import { initializeDatabase } from "../src/shared/session-database.ts"

import { TestModel } from "./test-model.ts"

const temporaryRoots: string[] = []

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "agents-demo-"))
  temporaryRoots.push(root)
  return root
}

async function seedFixtureTree(root: string): Promise<void> {
  await ensureAppScaffold(createAppPaths(root))
}

async function createTestApp() {
  const root = makeRoot()
  await seedFixtureTree(root)

  const paths = createAppPaths(root)
  const db = initializeDatabase(paths.databasePath)

  return {
    paths,
    db,
    model: new TestModel(),
    close() {
      db.close()
    },
  }
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop()
    if (root) {
      rmSync(root, { recursive: true, force: true })
    }
  }
})

test(
  "hermes learns a preference automatically while openclaw does not",
  async () => {
    const app = await createTestApp()

    try {
      await runProfile(app, {
        profileId: "openclaw",
        userId: "alice",
        sessionId: "prefs",
        message: "I prefer zsh for shell work",
      })

      const userAfterOpenClaw = await Bun.file(app.paths.userPath).text()
      expect(userAfterOpenClaw).not.toContain("zsh")

      await runProfile(app, {
        profileId: "hermes",
        userId: "alice",
        sessionId: "prefs",
        message: "I prefer zsh for shell work",
      })

      const userAfterHermes = await Bun.file(app.paths.userPath).text()
      expect(userAfterHermes).toContain("User prefers zsh for shell work.")

      const openclawFollowUp = await runProfile(app, {
        profileId: "openclaw",
        userId: "alice",
        sessionId: "prefs",
        message: "What shell do I prefer?",
      })

      const hermesFollowUp = await runProfile(app, {
        profileId: "hermes",
        userId: "alice",
        sessionId: "prefs",
        message: "What shell do I prefer?",
      })

      expect(openclawFollowUp.reply).not.toContain("zsh")
      // Hermes has it in assembled context (USER.md) without needing a search
      expect(hermesFollowUp.reply).toContain("zsh")
    } finally {
      app.close()
    }
  },
  { timeout: 60000 },
)

test(
  "openclaw can recall facts after an explicit remember command",
  async () => {
    const app = await createTestApp()

    try {
      await runProfile(app, {
        profileId: "openclaw",
        userId: "alice",
        sessionId: "explicit-memory",
        message: "Remember that I prefer zsh for shell work",
      })

      const memoryText = await Bun.file(app.paths.memoryPath).text()
      expect(memoryText).toContain("zsh")

      const followUp = await runProfile(app, {
        profileId: "openclaw",
        userId: "alice",
        sessionId: "explicit-memory",
        message: "What shell do I prefer?",
      })

      expect(followUp.reply).toContain("zsh")
    } finally {
      app.close()
    }
  },
  { timeout: 30000 },
)

test("openclaw explicit memory search normalizes punctuation inline", async () => {
  const app = await createTestApp()

  try {
    await runProfile(app, {
      profileId: "openclaw",
      userId: "alice",
      sessionId: "punctuation-memory",
      message: "Remember that I prefer zsh for shell work",
    })

    const hits = await searchExplicitMemory(app.paths, 'Do I prefer "zsh?"')

    expect(hits).toEqual([{ source: "MEMORY.md", content: "I prefer zsh for shell work." }])
  } finally {
    app.close()
  }
})

test(
  "compare shows openclaw using direct log search while hermes uses execute_code",
  async () => {
    const app = await createTestApp()

    try {
      const openclaw = await runProfile(app, {
        profileId: "openclaw",
        userId: "alice",
        sessionId: "logs",
        message: "search recent logs for timeout failures",
      })

      const hermes = await runProfile(app, {
        profileId: "hermes",
        userId: "alice",
        sessionId: "logs",
        message: "search recent logs for timeout failures",
      })

      // OpenClaw uses direct log search
      expect(openclaw.toolResults.some((r) => r.name === "search_logs")).toBe(true)
      expect(openclaw.debug.modelDecisions.some((d) => d.includes("search_logs"))).toBe(true)
      // Hermes uses a sandboxed tool (execute_code or run_command) rather than direct search_logs
      const hermesTool = hermes.toolResults[0]?.name
      expect(hermesTool === "execute_code" || hermesTool === "run_command").toBe(true)
      expect(hermes.debug.modelDecisions.some((d) => d.includes("execute_code") || d.includes("run_command"))).toBe(true)
    } finally {
      app.close()
    }
  },
  { timeout: 60000 },
)

test(
  "openclaw returns needs_approval for non-allowlisted commands",
  async () => {
    const app = await createTestApp()

    try {
      const turn = await runProfile(app, {
        profileId: "openclaw",
        userId: "alice",
        sessionId: "commands",
        message: "run command: grep timeout data/logs/demo.log",
      })

      expect(turn.toolResults.some((r) => r.content.includes("needs_approval"))).toBe(true)
      expect(turn.debug.permissionDecisions[0]).toContain("needs_approval")
    } finally {
      app.close()
    }
  },
  { timeout: 30000 },
)

test(
  "hermes sandbox blocks host file access",
  async () => {
    const app = await createTestApp()

    try {
      const turn = await runProfile(app, {
        profileId: "hermes",
        userId: "alice",
        sessionId: "sandbox",
        message: "run command: cat /etc/hosts",
      })

      expect(turn.toolResults.some((r) => r.content.includes("Operation not permitted"))).toBe(true)
      expect(turn.debug.permissionDecisions[0]).toContain("sandboxed")
    } finally {
      app.close()
    }
  },
  { timeout: 30000 },
)

test(
  "hermes generates a reusable skill note that shows up in assembled context later",
  async () => {
    const app = await createTestApp()

    try {
      const turn = await runProfile(app, {
        profileId: "hermes",
        userId: "alice",
        sessionId: "skills",
        message: "search recent logs for timeout failures",
      })

      const skillFiles = readdirSync(app.paths.skillsDir).filter((file) => file.endsWith(".md"))
      const followUp = await runProfile(app, {
        profileId: "hermes",
        userId: "alice",
        sessionId: "skills",
        message: "What happened with timeout failures?",
      })

      expect(turn.debug.generatedSkills.length).toBe(1)
      expect(skillFiles.length).toBe(1)
      // Skill note for the task should appear in assembled context
      expect(followUp.systemPrompt).toContain("search recent logs for timeout failures")
    } finally {
      app.close()
    }
  },
  { timeout: 30000 },
)
