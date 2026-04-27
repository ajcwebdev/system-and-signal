import type { AgentTurnResult } from "./types.ts"

const RESET = "\x1b[0m"
const BOLD = "\x1b[1m"
const DIM = "\x1b[2m"

const ansi = (color: string) => Bun.color(color, "ansi") ?? ""

const PROFILE_COLORS: Record<string, string> = {
  openclaw: ansi("deepskyblue"),
  hermes: ansi("darkorange"),
}

const SECTION_STYLES: Record<string, { color: string, icon: string }> = {
  "System Prompt Sections": { color: ansi("lightslategray"), icon: ">" },
  "Recalled Entries": { color: ansi("deepskyblue"), icon: "~" },
  "Memory Writes": { color: ansi("mediumseagreen"), icon: "+" },
  "User Model Updates": { color: ansi("mediumseagreen"), icon: "+" },
  "Generated Skills": { color: ansi("gold"), icon: "*" },
  "Permission Decisions": { color: ansi("tomato"), icon: "!" },
  "Sandbox Events": { color: ansi("darkorange"), icon: "#" },
  "Model Decisions": { color: ansi("mediumpurple"), icon: "?" },
}
const SECTION_ORDER = [
  "System Prompt Sections",
  "Recalled Entries",
  "Memory Writes",
  "User Model Updates",
  "Generated Skills",
  "Permission Decisions",
  "Sandbox Events",
  "Model Decisions",
] as const

function profileColor(id: string): string {
  return PROFILE_COLORS[id] ?? ansi("white")
}

function underline(text: string, color: string): string {
  return `${DIM}${color}${"-".repeat(text.length)}${RESET}`
}

function formatWrappedBlock(text: string, firstPrefix: string, restPrefix: string): string[] {
  const lines = text.split(/\r?\n/)
  if (lines.length === 0) {
    return [firstPrefix.trimEnd()]
  }

  return [
    `${firstPrefix}${lines[0] ?? ""}`,
    ...lines.slice(1).map((line) => `${restPrefix}${line}`),
  ]
}

function replyBlock(text: string): string[] {
  return formatWrappedBlock(text, `${BOLD}Reply:${RESET} `, "       ")
}

function itemBlock(color: string, icon: string, text: string): string[] {
  return formatWrappedBlock(text, `${color}  ${icon} ${RESET}`, `${color}    ${RESET}`)
}

function section(title: string, items: string[]): string[] {
  if (items.length === 0) return []
  const style = SECTION_STYLES[title] ?? { color: ansi("gray"), icon: "-" }
  return [`${BOLD}${style.color}${title}${RESET}`, ...items.flatMap((item) => itemBlock(style.color, style.icon, item))]
}

export function formatTurnResult(result: AgentTurnResult): string {
  const pc = profileColor(result.profileId)
  const title = `${result.profileId.toUpperCase()} RESULT`
  const header = [`${BOLD}${pc}${title}${RESET}`, underline(title, pc)]
  const blocks = [header, replyBlock(result.reply)]
  const sectionItems = {
    "System Prompt Sections": result.debug.systemPromptSections,
    "Recalled Entries": result.debug.recalledEntries,
    "Memory Writes": result.debug.memoryWrites,
    "User Model Updates": result.debug.userModelUpdates,
    "Generated Skills": result.debug.generatedSkills,
    "Permission Decisions": result.debug.permissionDecisions,
    "Sandbox Events": result.debug.sandboxEvents,
    "Model Decisions": result.debug.modelDecisions,
  } as const

  for (const title of SECTION_ORDER) {
    const block = section(
      title,
      sectionItems[title],
    )
    if (block.length > 0) {
      blocks.push(block)
    }
  }

  return blocks.map((block) => block.join("\n")).join("\n\n")
}
