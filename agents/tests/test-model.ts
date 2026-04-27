import type { AgentMessage, MemoryHit, ModelAction, ModelAdapter, ModelRequest, ToolResult } from "../src/shared/types.ts"

function collectTrailingToolMessages(messages: AgentMessage[]): AgentMessage[] {
  const trailing: AgentMessage[] = []

  let index = messages.length - 1
  while (index >= 0) {
    const message = messages[index]
    if (!message) {
      index -= 1
      continue
    }
    if (message.role !== "tool") {
      break
    }
    trailing.unshift(message)
    index -= 1
  }

  return trailing
}

function lastUserMessage(messages: AgentMessage[]): AgentMessage | undefined {
  let index = messages.length - 1
  while (index >= 0) {
    const message = messages[index]
    if (message?.role === "user") {
      return message
    }
    index -= 1
  }

  return undefined
}

function parseMemoryHits(content: string): MemoryHit[] {
  const hits: MemoryHit[] = []

  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed.startsWith("- ")) {
      continue
    }

    const withoutDash = trimmed.slice(2)
    const separatorIndex = withoutDash.indexOf(": ")
    if (separatorIndex === -1) {
      hits.push({ source: "memory", content: withoutDash })
      continue
    }

    hits.push({
      source: withoutDash.slice(0, separatorIndex),
      content: withoutDash.slice(separatorIndex + 2),
    })
  }

  return hits
}

function extractStoredPreference(systemPrompt: string): string | null {
  const preferenceMatch =
    systemPrompt.match(/User prefers ([^.]+)\./i) ||
    systemPrompt.match(/- I prefer ([^.]+)\./i) ||
    systemPrompt.match(/- I prefer ([^\n]+)/i)

  return preferenceMatch?.[1]?.trim() ?? null
}

function looksLikePreferenceQuestion(text: string): boolean {
  return /\bwhat\b.*\bprefer\b/i.test(text) || /\bwhat shell\b/i.test(text)
}

function looksLikeRememberRequest(text: string): boolean {
  return /^(remember|save memory|save this|store this)\b/i.test(text)
}

function extractRememberPayload(text: string): string {
  return text
    .replace(/^(remember|save memory|save this|store this)\b[:\s-]*/i, "")
    .trim()
    .replace(/^that\s+/i, "")
    .trim()
}

function looksLikeLogSearch(text: string): boolean {
  return /\blogs?\b/i.test(text) && /\b(search|timeout|error|failures?)\b/i.test(text)
}

function extractLogQuery(text: string): string {
  const cleaned = text
    .replace(/^(please\s+)?search\s+/i, "")
    .replace(/\b(recent|demo)\b/gi, "")
    .replace(/\blogs?\b/gi, "")
    .trim()
    .replace(/^for\s+/i, "")
    .trim()

  if (!cleaned) {
    return "error"
  }

  return cleaned.replace(/\s+/g, " ")
}

function extractCommand(text: string): string | null {
  const commandMatch = text.match(/^(?:run command|command)\s*:\s*(.+)$/i)
  return commandMatch?.[1]?.trim() ?? null
}

function buildExecuteCodePlan(text: string): string {
  const query = extractLogQuery(text)
  const slug = query.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "report"
  return JSON.stringify({
    task: `analyze ${query}`,
    steps: [
      { op: "search_logs", query, as: "hits" },
      { op: "write_report", path: `reports/${slug}.txt`, from: "hits" },
      { op: "return_result", from: "hits", reportPath: `reports/${slug}.txt` },
    ],
  })
}

function formatMemoryAnswer(hits: MemoryHit[]): string {
  if (hits.length === 0) {
    return "I do not have that stored yet."
  }

  return `Here is the strongest match I found in memory: ${hits[0]?.content}`
}

function formatToolReply(lastUserText: string, toolResults: ToolResult[]): string {
  const primary = toolResults[0]
  if (!primary) {
    return "The tool run completed, but it did not return any content."
  }

  if (primary.name === "save_memory") {
    return primary.content
  }

  if (primary.name === "search_memory") {
    return formatMemoryAnswer(parseMemoryHits(primary.content))
  }

  if (primary.name === "search_logs") {
    return `I checked the demo log for "${extractLogQuery(lastUserText)}".\n${primary.content}`
  }

  if (primary.name === "execute_code") {
    return primary.content
  }

  if (primary.name === "run_command") {
    return `Command policy result for "${extractCommand(lastUserText) ?? lastUserText}":\n${primary.content}`
  }

  return primary.content
}

export class TestModel implements ModelAdapter {
  async nextAction(request: ModelRequest): Promise<ModelAction> {
    const userMessage = lastUserMessage(request.messages)
    const text = userMessage?.content ?? ""
    const trailingTools = collectTrailingToolMessages(request.messages)

    if (!userMessage) {
      request.debug.modelDecisions.push("No user message found returning fallback response.")
      return {
        type: "respond",
        text: "No user input was provided.",
      }
    }

    if (trailingTools.length > 0) {
      request.debug.modelDecisions.push(
        `Tool results detected (${trailingTools.map((tool) => tool.name).join(", ")}) composing final response.`,
      )

      const toolResults: ToolResult[] = trailingTools.map((tool) => ({
        ok: true,
        name: tool.name ?? "tool",
        content: tool.content,
      }))

      return {
        type: "respond",
        text: formatToolReply(text, toolResults),
      }
    }

    const storedPreference = extractStoredPreference(request.systemPrompt)
    const explicitCommand = extractCommand(text)
    const availableTools = new Set(request.tools.map((tool) => tool.name))

    if (explicitCommand) {
      request.debug.modelDecisions.push(`Dispatching run_command for "${explicitCommand}".`)
      return {
        type: "tool_calls",
        calls: [{ name: "run_command", input: explicitCommand }],
      }
    }

    if (looksLikeLogSearch(text)) {
      const query = extractLogQuery(text)
      if (request.profileId === "hermes") {
        request.debug.modelDecisions.push(`Dispatching execute_code for "${query}".`)
        return {
          type: "tool_calls",
          calls: [{ name: "execute_code", input: buildExecuteCodePlan(text) }],
        }
      }

      request.debug.modelDecisions.push(`Dispatching search_logs for "${query}".`)
      return {
        type: "tool_calls",
        calls: [{ name: "search_logs", input: query }],
      }
    }

    if (looksLikeRememberRequest(text) && availableTools.has("save_memory")) {
      const payload = extractRememberPayload(text)
      request.debug.modelDecisions.push(`Dispatching save_memory for "${payload}".`)
      return {
        type: "tool_calls",
        calls: [{ name: "save_memory", input: payload }],
      }
    }

    if (looksLikePreferenceQuestion(text) && storedPreference) {
      request.debug.modelDecisions.push(`Answering from assembled context with stored preference "${storedPreference}".`)
      return {
        type: "respond",
        text: `You prefer ${storedPreference}.`,
      }
    }

    if (looksLikePreferenceQuestion(text)) {
      request.debug.modelDecisions.push("No proactive preference in context dispatching search_memory.")
      return {
        type: "tool_calls",
        calls: [{ name: "search_memory", input: text }],
      }
    }

    request.debug.modelDecisions.push("No tool call required returning direct response.")
    return {
      type: "respond",
      text: `This ${request.profileId} demo is using the shared agent loop. I did not need any tools for: "${text}"`,
    }
  }
}
