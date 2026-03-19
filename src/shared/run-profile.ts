import { prepareHermesProfile } from "../agent/hermes.ts"
import { prepareOpenClawProfile } from "../agent/openclaw.ts"
import { appendMessages, loadSessionMessages } from "./session-database.ts"
import type { AppRuntime } from "./create-scaffold.ts"
import type { AgentMessage, AgentTurnResult, ProfileId, ToolResult } from "./types.ts"
import { TOOL_CALL_MESSAGE_PREFIX } from "./types.ts"

export async function runProfile(
  app: AppRuntime,
  options: {
    profileId: ProfileId
    message: string
    userId?: string
    sessionId?: string
  },
): Promise<AgentTurnResult> {
  const text = options.message.trim()
  if (!text) {
    throw new Error("A non-empty message is required.")
  }

  const { profileId } = options
  const userId = options.userId?.trim() || "cli-user"
  const sessionId = options.sessionId?.trim() || userId
  const event = { userId, sessionId, text }
  const profileArgs = { event, paths: app.paths, db: app.db }
  const history = loadSessionMessages(app.db, profileId, sessionId, userId)
  const prepared =
    profileId === "openclaw" ? await prepareOpenClawProfile(profileArgs) : await prepareHermesProfile(profileArgs)

  const toolsByName = new Map(prepared.tools.map((tool) => [tool.name, tool]))
  const toolSpecs = prepared.tools.map(({ name, description }) => ({ name, description }))
  const messages: AgentMessage[] = [...history, { role: "user", content: text }]
  const newMessages: AgentMessage[] = [{ role: "user", content: text }]
  const toolResults: ToolResult[] = []

  const createTurn = (reply: string, addToMessages = true): AgentTurnResult => {
    const assistantMessage: AgentMessage = { role: "assistant", content: reply }
    if (addToMessages) {
      messages.push(assistantMessage)
    }
    newMessages.push(assistantMessage)

    return {
      profileId,
      reply,
      newMessages,
      toolResults,
      debug: prepared.debug,
      systemPrompt: prepared.systemPrompt,
      sessionId,
      userId,
    }
  }

  const finishTurn = async (turn: AgentTurnResult): Promise<AgentTurnResult> => {
    appendMessages(app.db, profileId, event, turn.newMessages)
    await prepared.afterTurn({ ...profileArgs, turn })
    return turn
  }

  for (let step = 0; step < 4; step += 1) {
    const action = await app.model.nextAction({
      profileId,
      systemPrompt: prepared.systemPrompt,
      messages,
      tools: toolSpecs,
      debug: prepared.debug,
    })

    if (action.type === "respond") {
      return finishTurn(createTurn(action.text))
    }

    messages.push({
      role: "assistant",
      content: `${TOOL_CALL_MESSAGE_PREFIX}${JSON.stringify(action.calls)}`,
    })

    for (const call of action.calls) {
      const tool = toolsByName.get(call.name)
      if (!tool) {
        throw new Error(`Tool "${call.name}" is not registered for profile "${profileId}".`)
      }

      const result = await tool.execute(call.input, { ...profileArgs, profileId, debug: prepared.debug })
      const toolMessage: AgentMessage = {
        role: "tool",
        name: tool.name,
        content: result.content,
      }

      toolResults.push(result)
      messages.push(toolMessage)
      newMessages.push(toolMessage)
    }
  }

  return finishTurn(createTurn("The shared agent loop exceeded its step budget.", false))
}
