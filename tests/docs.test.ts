import { fileURLToPath } from "node:url"
import { expect, test } from "bun:test"

const readmePath = fileURLToPath(new URL("../README.md", import.meta.url))
const articlePath = fileURLToPath(new URL("../blog/agents-claude-opus-4-6-draft.md", import.meta.url))

test("README provider references match the current OpenAI runtime", async () => {
  const readme = await Bun.file(readmePath).text()

  expect(readme).toContain("OPENAI_API_KEY")
  expect(readme).toContain("same OpenAI adapter")
  expect(readme).not.toContain("ANTHROPIC_API_KEY")
  expect(readme).not.toContain("same Anthropic adapter")
})

test("article stays CLI-first and avoids source-code walkthrough snippets", async () => {
  const article = await Bun.file(articlePath).text()

  expect(article).toContain("## Follow Along Locally")
  expect(article).toContain("https://github.com/ajcwebdev/system-and-signal")
  expect(article).toContain("git clone https://github.com/ajcwebdev/system-and-signal.git")
  expect(article).toContain("bun install")
  expect(article).toContain("export OPENAI_API_KEY=...")
  expect(article).toContain("## What to Watch in the Output")
  expect(article).toContain("## Context & Memory - Explicit Recall vs. Assembled Context")
  expect(article).toContain("## Task Orchestration - Single-Tool Retrieval vs. Multi-Step Workflows")
  expect(article).toContain("## Execution & Confinement - Allowlists vs. Sandbox Routing")
  expect(article).toContain("## State & Artifacts - Minimal Writes vs. Carry-Forward Accumulation")
  expect(article).toContain('bun ah --profile openclaw --message "What shell do I prefer?"')
  expect(article).toContain('bun ah --profile hermes --user alice --session logs --message "search recent logs for timeout failures"')
  expect(article).toContain("Generated Skills")
  expect(article).toContain("User Model Updates")
  expect(article).toContain("Policy: needs_approval")
  expect(article).toContain("Policy: sandboxed")
  expect(article).not.toContain("```typescript")
  expect(article).not.toContain("```json")
  expect(article).not.toContain("src/agent/openclaw.ts")
  expect(article).not.toContain("src/shared/")
})
