import { mkdirSync } from "node:fs"
import { dirname, join, resolve, sep } from "node:path"
import type { Database } from "bun:sqlite"
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
import { searchMessages } from "../shared/session-database.ts"
import type {
  AgentTurnResult,
  AppPaths,
  CommandDecision,
  DebugInfo,
  MemoryHit,
  PrepareTurnArgs,
  ProfileContext,
  ToolDefinition,
} from "../shared/types.ts"

const HERMES_SUPPORTED_COMMANDS = new Set(["pwd", "ls", "cat", "head", "tail", "date", "echo", "grep"])

type ExecuteCodeStep =
  | {
      op: "search_logs"
      query: string
      as: string
    }
  | {
      op: "write_report"
      path: string
      from: string
    }
  | {
      op: "return_result"
      from: string
      reportPath?: string
    }

type ExecuteCodePlan = {
  task: string
  steps: ExecuteCodeStep[]
}

type ExecuteCodeVars = Map<string, string[] | string>

function tokenizeLogQuery(query: string): string[] {
  return query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []
}

export function safeSandboxPath(paths: AppPaths, relativePath: string): string {
  const resolved = resolve(paths.hermesSandboxDir, relativePath)
  if (resolved !== paths.hermesSandboxDir && !resolved.startsWith(`${paths.hermesSandboxDir}${sep}`)) {
    throw new Error(`Operation not permitted: ${relativePath}`)
  }
  return resolved
}

export async function syncHermesSandbox(paths: AppPaths, debug?: DebugInfo): Promise<void> {
  mkdirSync(paths.hermesSandboxDir, { recursive: true })
  mkdirSync(paths.hermesSandboxLogsDir, { recursive: true })
  mkdirSync(paths.hermesSandboxReportsDir, { recursive: true })

  const sourcePath = join(paths.logsDir, "demo.log")
  const targetPath = join(paths.hermesSandboxLogsDir, "demo.log")
  await write(targetPath, await file(sourcePath).text())

  debug?.sandboxEvents.push(`Synced Hermes sandbox fixtures into ${paths.hermesSandboxDir}.`)
}

export function searchText(source: string, text: string, query: string): MemoryHit[] {
  const tokens = tokenizeQuery(query)
  const lines = splitNonEmptyLines(text).filter((line) => !line.startsWith("#"))

  return lines
    .filter((line) => matchesQuery(line, tokens))
    .map((line) => ({
      source,
      content: line.replace(/^[\-\*\s]+/, ""),
    }))
}

export async function loadSkillHits(paths: AppPaths, query: string): Promise<MemoryHit[]> {
  const files = Array.from(new Glob("*.md").scanSync(paths.skillsDir)).sort()
  const hits: MemoryHit[] = []

  for (const fileName of files) {
    const text = await file(join(paths.skillsDir, fileName)).text()
    hits.push(...searchText(`skill:${fileName}`, text, query))
  }

  return hits
}

export async function searchHermesMemory(
  paths: AppPaths,
  db: Database,
  userId: string,
  query: string,
): Promise<MemoryHit[]> {
  const memoryText = await readOptionalText(paths.memoryPath, "# MEMORY\n")
  const userText = await readOptionalText(paths.userPath, "# USER\n")

  return [
    ...searchText("MEMORY.md", memoryText, query),
    ...searchText("USER.md", userText, query),
    ...searchMessages(db, "hermes", userId, query, 3),
    ...(await loadSkillHits(paths, query)),
  ]
}

export async function assembleHermesContext(paths: AppPaths, db: Database, userId: string, query: string) {
  const memoryText = (await readOptionalText(paths.memoryPath, "# MEMORY\n")).trim()
  const userText = (await readOptionalText(paths.userPath, "# USER\n")).trim()
  const skills = await loadSkillHits(paths, query)
  const recall = searchMessages(db, "hermes", userId, query, 3)

  const skillList = skills.length === 0 ? "- No generated skills yet." : skills.map((skill) => `- ${skill.content}`).join("\n")
  const recallList = recall.length === 0 ? "- No prior recall hits." : recall.map((entry) => `- ${entry.source}: ${entry.content}`).join("\n")

  return {
    systemPrompt: [
      "Profile: Hermes-style harness.",
      "Assemble context from curated memory, a learned user model, skill notes, and recent recall.",
      "## Curated Memory",
      memoryText,
      "## User Model",
      userText,
      "## Active Skills",
      skillList,
      "## Session Recall",
      recallList,
    ].join("\n\n"),
    recalledEntries: recall.map((entry) => `${entry.source}: ${entry.content}`),
  }
}

export async function applyHermesLearning(args: PrepareTurnArgs & { turn: AgentTurnResult }): Promise<void> {
  const trimmedText = args.event.text.trim()
  const preferenceMatch = trimmedText.match(/\bI prefer ([^.]+?)(?: for ([^.]+))?\.?$/i)
  const fact = preferenceMatch?.[1]?.trim()
  const scope = preferenceMatch?.[2]?.trim()
  const learnedFact = fact && scope ? `User prefers ${fact} for ${scope}.` : fact ? `User prefers ${fact}.` : null

  if (learnedFact) {
    const text = await readOptionalText(args.paths.userPath, "")
    const normalizedText = text.trimEnd()
    const nextLine = `- ${learnedFact}`
    const nextText = normalizedText ? `${normalizedText}\n${nextLine}\n` : `${nextLine}\n`
    await write(args.paths.userPath, nextText)
    args.turn.debug.userModelUpdates.push(learnedFact)
  }

  if (!/\bsearch\b/i.test(args.event.text) || args.turn.toolResults.length === 0) {
    return
  }

  const slug =
    args.event.text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "skill"
  const skillPath = join(args.paths.skillsDir, `${slug}.md`)
  const handle = file(skillPath)
  if (await handle.exists()) {
    return
  }

  const lines = args.turn.toolResults.map((result) => `- ${result.name}: ${result.content.split("\n")[0] ?? result.content}`)
  const skillDoc = [
    `# Skill: ${args.event.text}`,
    "",
    "## When To Use",
    `Use this note when a request resembles "${args.event.text}".`,
    "",
    "## Pattern",
    ...lines,
  ].join("\n")

  await write(skillPath, `${skillDoc}\n`)
  args.turn.debug.generatedSkills.push(skillPath)
}

export function createHermesRunCommandTool(): ToolDefinition {
  return {
    name: "run_command",
    description: "Evaluate command policy and run a constrained read-only demo command.",
    async execute(input, context) {
      const command = parseCommand(input)
      const decision: CommandDecision = !command.name
        ? { verdict: "needs_approval", reason: "No command was provided." }
        : {
            verdict: "sandboxed",
            reason: HERMES_SUPPORTED_COMMANDS.has(command.name)
              ? "Hermes runs this through the demo sandbox policy."
              : "Hermes would need a richer sandbox backend for this command.",
          }

      context.debug.permissionDecisions.push(`hermes:${command.raw} -> ${decision.verdict} (${decision.reason})`)

      if (decision.verdict === "needs_approval") {
        return { ok: false, name: "run_command", content: formatCommandResult(decision) }
      }

      await syncHermesSandbox(context.paths, context.debug)

      let output = ""
      try {
        const p = (target?: string) => safeSandboxPath(context.paths, target || ".")
        switch (command.name) {
          case "pwd": {
            output = context.paths.hermesSandboxDir
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
          case "grep": {
            const [pattern = "", target = ""] = command.args
            output = (await file(p(target)).text())
              .split(/\r?\n/)
              .flatMap((line, index) => (line.toLowerCase().includes(pattern.toLowerCase()) ? [`${index + 1}:${line}`] : []))
              .join("\n") || "(no matches)"
            break
          }
          default: {
            output = `Hermes sandbox does not implement "${command.name}" in this demo.`
          }
        }
      } catch (error) {
        output = error instanceof Error ? error.message : "Operation not permitted."
      }

      return { ok: true, name: "run_command", content: formatCommandResult(decision, output) }
    },
  }
}

export function createExecuteCodeTool(): ToolDefinition {
  return {
    name: "execute_code",
    description: "Run a multi-step Hermes script plan inside the sandbox workspace in a single tool call.",
    async execute(input, context) {
      const plan = JSON.parse(input) as ExecuteCodePlan
      const vars: ExecuteCodeVars = new Map()
      const writes: string[] = []

      await syncHermesSandbox(context.paths, context.debug)

      for (const step of plan.steps) {
        if (step.op === "search_logs") {
          const text = await file(join(context.paths.hermesSandboxLogsDir, "demo.log")).text()
          const tokens = tokenizeLogQuery(step.query)
          vars.set(step.as, collectLogMatches("demo.log", text, tokens, "data/logs/"))
          continue
        }

        if (step.op === "write_report") {
          const value = vars.get(step.from)
          const content = Array.isArray(value) ? value.join("\n") : String(value ?? "")
          const targetPath = safeSandboxPath(context.paths, step.path)
          mkdirSync(dirname(targetPath), { recursive: true })
          await write(targetPath, content)
          context.debug.sandboxEvents.push(`Wrote sandbox report ${targetPath}.`)
          writes.push(targetPath)
          continue
        }

        if (step.op === "return_result") {
          const value = vars.get(step.from)
          const lines = Array.isArray(value) ? value : String(value ?? "").split(/\r?\n/).filter(Boolean)
          return {
            ok: true,
            name: "execute_code",
            content: [
              `Executed Hermes script: ${plan.task}`,
              step.reportPath ? `Report: ${step.reportPath}` : null,
              `Matches: ${lines.length}`,
              lines.slice(0, 6).join("\n"),
            ]
              .filter(Boolean)
              .join("\n"),
          }
        }
      }

      return {
        ok: true,
        name: "execute_code",
        content: [`Executed Hermes script: ${plan.task}`, ...writes.map((path) => `Wrote: ${path}`)].join("\n"),
      }
    },
  }
}

export async function prepareHermesProfile(args: PrepareTurnArgs): Promise<ProfileContext> {
  const debug = createDebugInfo()
  const context = await assembleHermesContext(args.paths, args.db, args.event.userId, args.event.text)

  debug.systemPromptSections.push("Injected curated memory from MEMORY.md.")
  debug.systemPromptSections.push("Injected learned user model from USER.md.")
  debug.systemPromptSections.push("Injected generated skills and recent session recall.")
  debug.systemPromptSections.push("Automatic post-turn learning can update the user model and create skill notes.")
  debug.recalledEntries.push(...context.recalledEntries)

  return {
    profileId: "hermes",
    systemPrompt: context.systemPrompt,
    tools: [
      {
        name: "search_memory",
        description: "Search curated memory, user model, skills, and prior sessions.",
        async execute(input) {
          const hits = await searchHermesMemory(args.paths, args.db, args.event.userId, input)
          return { ok: true, name: "search_memory", content: formatMemoryHits(hits) }
        },
      },
      createHermesRunCommandTool(),
      createExecuteCodeTool(),
    ],
    debug,
    async afterTurn(afterTurnArgs) {
      await applyHermesLearning(afterTurnArgs)
    },
  }
}
