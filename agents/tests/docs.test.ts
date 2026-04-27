import { fileURLToPath } from "node:url"
import { expect, test } from "bun:test"

const readmePath = fileURLToPath(new URL("../README.md", import.meta.url))
const rootReadmePath = fileURLToPath(new URL("../../README.md", import.meta.url))

test("README provider references match the current OpenAI runtime", async () => {
  const readme = await Bun.file(readmePath).text()

  expect(readme).toContain("OPENAI_API_KEY")
  expect(readme).toContain("same OpenAI adapter")
  expect(readme).not.toContain("ANTHROPIC_API_KEY")
  expect(readme).not.toContain("same Anthropic adapter")
})

test("root README describes the example projects", async () => {
  const readme = await Bun.file(rootReadmePath).text()

  expect(readme).toContain("multiple independent companion projects")
  expect(readme).toContain("[`agents`](./agents)")
  expect(readme).toContain("[`agent-auth`](./agent-auth)")
  expect(readme).toContain("OpenClaw-style and Hermes-style agent harness examples")
  expect(readme).toContain("Agent Auth Protocol examples")
})
