#!/usr/bin/env bun

import { auditWorkspace, formatAuditText } from "./audit.ts"
import { classifyCommand, classifyDomain, classifyPath } from "./classifier.ts"
import { isProfileId, listProfiles } from "./policies.ts"
import { renderConfig } from "./renderers.ts"
import type { AgentTarget, Classification, ProfileId } from "./types.ts"
import { AGENT_TARGETS } from "./types.ts"

type FlagValue = boolean | string | string[]

interface ParsedArgs {
  command: string | undefined
  flags: Record<string, FlagValue>
}

async function main(): Promise<void> {
  const parsed = parseArgs(Bun.argv.slice(2))

  try {
    switch (parsed.command) {
      case "profiles":
        printProfiles()
        return
      case "audit":
        await runAudit(parsed.flags)
        return
      case "check":
        await runCheck(parsed.flags)
        return
      case "render":
        await runRender(parsed.flags)
        return
      case "help":
      case undefined:
        printHelp()
        return
      default:
        throw new Error(`Unknown command "${parsed.command}". Run "bun safety help".`)
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

function printProfiles(): void {
  for (const profile of listProfiles()) {
    console.log(`${profile.id} - ${profile.label}`)
    console.log(`  ${profile.summary}`)
    console.log(`  approval=${profile.approvalPolicy} sandbox=${profile.sandboxMode} network=${profile.networkMode}`)
    for (const note of profile.notes) {
      console.log(`  - ${note}`)
    }
    console.log("")
  }
}

async function runAudit(flags: Record<string, FlagValue>): Promise<void> {
  const target = optionalString(flags, "target") ?? "."
  const format = optionalString(flags, "format") ?? "text"
  const out = optionalString(flags, "out")

  if (format !== "text" && format !== "json") {
    throw new Error('audit --format must be "text" or "json"')
  }

  const report = await auditWorkspace({ target })
  const body = format === "json" ? JSON.stringify(report, null, 2) : formatAuditText(report)
  await writeOrPrint(body, out)
}

async function runCheck(flags: Record<string, FlagValue>): Promise<void> {
  const profileId = readProfile(flags)
  const command = optionalString(flags, "command")
  const path = optionalString(flags, "path")
  const domain = optionalString(flags, "domain")
  const selected = [command, path, domain].filter((value) => value !== undefined)

  if (selected.length !== 1) {
    throw new Error("check requires exactly one of --command, --path, or --domain")
  }

  const { getProfile } = await import("./policies.ts")
  const profile = getProfile(profileId)
  let classification: Classification

  if (command !== undefined) {
    classification = classifyCommand(profile, command)
  } else if (path !== undefined) {
    classification = classifyPath(profile, path)
  } else if (domain !== undefined) {
    classification = classifyDomain(profile, domain)
  } else {
    throw new Error("unreachable check input state")
  }

  if (optionalString(flags, "format") === "json") {
    await writeOrPrint(JSON.stringify(classification, null, 2), optionalString(flags, "out"))
    return
  }

  const lines = [
    `subject: ${classification.subject}`,
    `kind: ${classification.kind}`,
    `decision: ${classification.decision}`,
    `layer: ${classification.layer}`,
    `rule: ${classification.ruleId}`,
    `reason: ${classification.reason}`,
  ]
  await writeOrPrint(lines.join("\n"), optionalString(flags, "out"))
}

async function runRender(flags: Record<string, FlagValue>): Promise<void> {
  const profileId = readProfile(flags)
  const agent = readAgent(flags)
  const rendered = renderConfig(agent, profileId)
  await writeOrPrint(rendered.body, optionalString(flags, "out"))
}

function readProfile(flags: Record<string, FlagValue>): ProfileId {
  const value = optionalString(flags, "profile") ?? "guarded-dev"
  if (!isProfileId(value)) {
    throw new Error(`Unknown profile "${value}". Run "bun safety profiles".`)
  }
  return value
}

function readAgent(flags: Record<string, FlagValue>): AgentTarget {
  const value = optionalString(flags, "agent")
  if (!value) throw new Error('render requires --agent codex or --agent claude')
  if (!AGENT_TARGETS.includes(value as AgentTarget)) {
    throw new Error(`Unsupported agent "${value}". Expected codex or claude.`)
  }
  return value as AgentTarget
}

function parseArgs(args: string[]): ParsedArgs {
  const [command, ...rest] = args
  const flags: Record<string, FlagValue> = {}

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]
    if (!token?.startsWith("--")) continue

    const key = token.slice(2)
    const next = rest[index + 1]
    const value = next === undefined || next.startsWith("--") ? true : next
    if (value !== true) index += 1

    const existing = flags[key]
    if (existing === undefined) {
      flags[key] = value
    } else if (Array.isArray(existing)) {
      existing.push(String(value))
    } else {
      flags[key] = [String(existing), String(value)]
    }
  }

  return { command, flags }
}

function optionalString(flags: Record<string, FlagValue>, key: string): string | undefined {
  const value = flags[key]
  if (typeof value === "string") return value
  if (Array.isArray(value)) return value.at(-1)
  return undefined
}

async function writeOrPrint(body: string, out: string | undefined): Promise<void> {
  if (out) {
    await Bun.write(out, body.endsWith("\n") ? body : `${body}\n`)
    return
  }
  console.log(body)
}

function printHelp(): void {
  console.log(`Agent Safety CLI

Commands:
  bun safety profiles
  bun safety audit --target . --format text|json
  bun safety check --profile guarded-dev --command "terraform apply"
  bun safety check --profile net-limited --domain github.com
  bun safety check --profile guarded-dev --path .env
  bun safety render --agent codex --profile guarded-dev
  bun safety render --agent claude --profile safe-review

Profiles:
  safe-review   Read-only review with no command network
  guarded-dev   Workspace edits with prompts at risk boundaries
  net-limited   Guarded dev with domain-limited command network
  isolated-ci   Non-interactive disposable execution
`)
}

if (import.meta.main) {
  main()
}

