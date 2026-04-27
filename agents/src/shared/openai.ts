import OpenAI from "openai"
import type { AgentMessage, ModelAction, ModelAdapter, ModelRequest, ToolCall } from "./types.ts"
import { TOOL_CALL_MESSAGE_PREFIX } from "./types.ts"

function parseToolCalls(content: string): ToolCall[] | null {
  if (!content.startsWith(TOOL_CALL_MESSAGE_PREFIX)) return null

  try {
    const parsed = JSON.parse(content.slice(TOOL_CALL_MESSAGE_PREFIX.length))
    if (!Array.isArray(parsed)) return null

    return parsed.filter(
      (entry): entry is ToolCall =>
        entry && typeof entry === "object" && typeof entry.name === "string" && typeof entry.input === "string",
    )
  } catch {
    return null
  }
}

function convertMessages(messages: AgentMessage[]): OpenAI.Responses.ResponseInputItem[] {
  const input: OpenAI.Responses.ResponseInputItem[] = []
  let pendingCallIds: string[] = []

  for (const message of messages) {
    if (message.role === "user") {
      input.push({ role: "user", content: message.content })
      continue
    }

    if (message.role === "tool") {
      const callId = pendingCallIds.shift()
      if (callId) {
        input.push({ type: "function_call_output", call_id: callId, output: message.content })
      }
      continue
    }

    const toolCalls = parseToolCalls(message.content)
    if (!toolCalls) {
      input.push({ role: "assistant", content: message.content })
      continue
    }

    const base = input.length
    pendingCallIds = toolCalls.map((_, i) => `call_${base}_${i}`)
    for (const [i, toolCall] of toolCalls.entries()) {
      input.push({
        type: "function_call",
        call_id: pendingCallIds[i]!,
        name: toolCall.name,
        arguments: JSON.stringify({ input: toolCall.input }),
      })
    }
  }

  return input
}

export function createOpenAIModelAdapter(client: OpenAI, modelId: string): ModelAdapter {
  return {
    async nextAction(request: ModelRequest): Promise<ModelAction> {
      const response = await client.responses.create({
        model: modelId,
        instructions: request.systemPrompt,
        input: convertMessages(request.messages),
        tools: request.tools.map((tool) => ({
          type: "function" as const,
          name: tool.name,
          description: tool.description,
          strict: false,
          parameters: {
            type: "object" as const,
            properties: { input: { type: "string" } },
            required: ["input"],
          },
        })),
      })

      const functionCalls = response.output.filter(
        (item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === "function_call",
      )

      if (functionCalls.length > 0) {
        const calls = functionCalls.map((call) => ({
          name: call.name,
          input: (JSON.parse(call.arguments) as { input?: string }).input ?? call.arguments,
        }))
        return { type: "tool_calls", calls }
      }

      return { type: "respond", text: response.output_text || "(no response)" }
    },
  }
}
