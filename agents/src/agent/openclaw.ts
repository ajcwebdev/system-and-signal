import { resolve } from "node:path"
import { file, write, Glob } from "bun"

import {
  collectLogMatches,
  createDebugInfo,
  formatCommandResult,
  formatMemoryHits,
  matchesQuery,
  parseCommand,
  readOptionalText,
  splitNonEmptyLines,
  tokenizeQuery,
} from "../shared/agent-utils.ts"
import type { AppPaths, CommandDecision, MemoryHit, PrepareTurnArgs, ProfileContext, ToolDefinition } from "../shared/types.ts"

const OPENCLAW_SUPPORTED_COMMANDS = new Set(["pwd", "ls", "cat", "head", "tail", "date", "echo"])

export async function searchExplicitMemory(paths: AppPaths, query: string): Promise<MemoryHit[]> {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""))
    .filter((token) => token.length > 2)
  const memoryText = await readOptionalText(paths.memoryPath)
  const entries = splitNonEmptyLines(memoryText)
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())

  return entries
    .filter((entry) => matchesQuery(entry, tokens))
    .map((content) => ({ source: "MEMORY.md", content }))
}

export async function saveExplicitMemory(paths: AppPaths, rawText: string): Promise<string> {
  const normalized = rawText.trim()
  const nextEntry = `- ${normalized}.`

  const currentText = (await readOptionalText(paths.memoryPath)).trimEnd()
  const nextText = currentText ? `${currentText}\n${nextEntry}\n` : `# MEMORY\n\n${nextEntry}\n`
  await write(paths.memoryPath, nextText)
  return normalized
}

export function createSearchLogsTool(): ToolDefinition {
  return {
    name: "search_logs",
    description: "Search the demo log for matching lines.",
    async execute(input, context) {
      const query = input.trim()
      const text = await file(resolve(context.paths.logsDir, "demo.log")).text()
      const tokens = tokenizeQuery(query)
      const hits = collectLogMatches("demo.log", text, tokens)

      if (hits.length === 0) {
        return { ok: true, name: "search_logs", content: `No log lines matched "${query}".` }
      }

      return {
        ok: true,
        name: "search_logs",
        content: [`Found ${hits.length} matching log lines.`, ...hits].join("\n"),
      }
    },
  }
}

export function createOpenClawRunCommandTool(): ToolDefinition {
  return {
    name: "run_command",
    description: "Evaluate command policy and run a constrained read-only demo command.",
    async execute(input, context) {
      const command = parseCommand(input)
      const decision: CommandDecision = !command.name
        ? { verdict: "needs_approval", reason: "No command was provided." }
        : OPENCLAW_SUPPORTED_COMMANDS.has(command.name)
          ? { verdict: "allowed", reason: "Command is in the OpenClaw demo allowlist." }
          : { verdict: "needs_approval", reason: "Command is outside the OpenClaw demo allowlist." }

      context.debug.permissionDecisions.push(`openclaw:${command.raw} -> ${decision.verdict} (${decision.reason})`)

      if (decision.verdict === "needs_approval") {
        return { ok: false, name: "run_command", content: formatCommandResult(decision) }
      }

      if (!command.name) {
        return { ok: true, name: "run_command", content: formatCommandResult(decision, "No command provided.") }
      }

      const p = (target?: string) => resolve(context.paths.rootDir, target || ".")
      let output: string
      switch (command.name) {
        case "pwd": {
          output = context.paths.rootDir
          break
        }
        case "date": {
          output = new Date().toISOString()
          break
        }
        case "echo": {
          output = command.args.join(" ")
          break
        }
        case "ls": {
          output = Array.from(new Glob("*").scanSync(p(command.args[0]))).sort().join("\n") || "(empty directory)"
          break
        }
        case "cat": {
          output = await file(p(command.args[0])).text()
          break
        }
        case "head":
        case "tail": {
          const lines = (await file(p(command.args[0])).text()).split(/\r?\n/)
          output = (command.name === "head" ? lines.slice(0, 10) : lines.slice(-10)).join("\n")
          break
        }
        default: {
          output = "No command provided."
        }
      }

      return { ok: true, name: "run_command", content: formatCommandResult(decision, output) }
    },
  }
}

export async function prepareOpenClawProfile(args: PrepareTurnArgs): Promise<ProfileContext> {
  const debug = createDebugInfo()
  const soul = (await file(args.paths.soulPath).text()).trim()

  debug.systemPromptSections.push("Loaded operator-authored SOUL.md identity.")
  debug.systemPromptSections.push("Memory stays passive unless the user explicitly saves or searches it.")
  debug.systemPromptSections.push("Command permissions use a fixed allowlist and return needs_approval otherwise.")

  return {
    profileId: "openclaw",
    systemPrompt: [
      "Profile: OpenClaw-style harness.",
      "Use the user-authored identity below as the primary behavioral layer.",
      soul,
      "Long-term memory is passive. Only use stored memory when explicitly searched.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    tools: [
      {
        name: "save_memory",
        description: "Persist an explicit memory entry to MEMORY.md.",
        async execute(input, context) {
          const saved = await saveExplicitMemory(args.paths, input)
          context.debug.memoryWrites.push(`Saved explicit memory: ${saved}`)
          return { ok: true, name: "save_memory", content: `Saved explicit memory: ${saved}.` }
        },
      },
      {
        name: "search_memory",
        description: "Search explicit memory that was previously saved by the operator or user.",
        async execute(input) {
          const hits = await searchExplicitMemory(args.paths, input)
          return { ok: true, name: "search_memory", content: formatMemoryHits(hits) }
        },
      },
      createSearchLogsTool(),
      createOpenClawRunCommandTool(),
    ],
    debug,
    async afterTurn() {
      return
    },
  }
}
