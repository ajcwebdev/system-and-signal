import { file } from "bun"

import type { CommandDecision, CommandInput, MemoryHit, ProfileContext } from "./types.ts"

export function createDebugInfo(): ProfileContext["debug"] {
  return {
    systemPromptSections: [],
    recalledEntries: [],
    memoryWrites: [],
    userModelUpdates: [],
    generatedSkills: [],
    permissionDecisions: [],
    modelDecisions: [],
    sandboxEvents: [],
  }
}

export function formatMemoryHits(hits: MemoryHit[]): string {
  if (hits.length === 0) {
    return "No memory matches."
  }

  return hits.map((hit) => `- ${hit.source}: ${hit.content}`).join("\n")
}

export function parseCommand(input: string): CommandInput {
  const raw = input.trim()
  const [name, ...args] = (raw.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((token) => token.replace(/^['"]|['"]$/g, ""))
  return { raw, name, args }
}

export function formatCommandResult(decision: CommandDecision, output?: string): string {
  const lines = [`Policy: ${decision.verdict}`, `Reason: ${decision.reason}`]
  if (output === undefined) {
    return lines.join("\n")
  }

  return [...lines, "Output:", output].join("\n")
}

export async function readOptionalText(path: string, fallback = ""): Promise<string> {
  const handle = file(path)
  if (!(await handle.exists())) {
    return fallback
  }

  return await handle.text()
}

export function splitNonEmptyLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

export function tokenizeQuery(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean)
}

export function matchesQuery(text: string, tokens: string[]): boolean {
  const normalized = text.toLowerCase()
  return tokens.length === 0 || tokens.some((token) => normalized.includes(token))
}

export function collectLogMatches(fileName: string, text: string, tokens: string[], prefix = ""): string[] {
  return text.split(/\r?\n/).flatMap((line, index) =>
    tokens.length === 0 || tokens.some((t) => line.toLowerCase().includes(t))
      ? [`${prefix}${fileName}:${index + 1}: ${line}`]
      : [],
  )
}
