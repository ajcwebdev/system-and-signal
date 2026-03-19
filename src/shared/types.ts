import type { Database } from "bun:sqlite"

export type ProfileId = "openclaw" | "hermes"

export type AgentMessage = {
  role: "user" | "assistant" | "tool"
  content: string
  name?: string
}

export type InboundEvent = {
  userId: string
  sessionId: string
  text: string
}

export type MemoryHit = {
  source: string
  content: string
}

export type ToolResult = {
  ok: boolean
  name: string
  content: string
}

export type DebugInfo = {
  systemPromptSections: string[]
  recalledEntries: string[]
  memoryWrites: string[]
  userModelUpdates: string[]
  generatedSkills: string[]
  permissionDecisions: string[]
  modelDecisions: string[]
  sandboxEvents: string[]
}

export type AppPaths = {
  rootDir: string
  configDir: string
  dataDir: string
  logsDir: string
  skillsDir: string
  soulPath: string
  memoryPath: string
  userPath: string
  databasePath: string
  hermesSandboxDir: string
  hermesSandboxLogsDir: string
  hermesSandboxReportsDir: string
}

export type PrepareTurnArgs = {
  event: InboundEvent
  paths: AppPaths
  db: Database
}

export type ToolDefinition = {
  name: string
  description: string
  execute(
    input: string,
    context: PrepareTurnArgs & {
      profileId: ProfileId
      debug: DebugInfo
    },
  ): Promise<ToolResult>
}

export type ToolCall = {
  name: string
  input: string
}

export const TOOL_CALL_MESSAGE_PREFIX = "__tool_calls__:"

export type ModelAction =
  | {
      type: "respond"
      text: string
    }
  | {
      type: "tool_calls"
      calls: ToolCall[]
    }

export type ModelRequest = {
  profileId: ProfileId
  systemPrompt: string
  messages: AgentMessage[]
  tools: Array<{
    name: string
    description: string
  }>
  debug: DebugInfo
}

export interface ModelAdapter {
  nextAction(request: ModelRequest): Promise<ModelAction>
}

export type AgentTurnResult = {
  profileId: ProfileId
  reply: string
  newMessages: AgentMessage[]
  toolResults: ToolResult[]
  debug: DebugInfo
  systemPrompt: string
  sessionId: string
  userId: string
}

export type ProfileContext = {
  profileId: ProfileId
  systemPrompt: string
  tools: ToolDefinition[]
  debug: DebugInfo
  afterTurn(args: PrepareTurnArgs & { turn: AgentTurnResult }): Promise<void>
}

export interface ProfileDefinition {
  id: ProfileId
  prepareTurn(args: PrepareTurnArgs): Promise<ProfileContext>
}

export type CommandInput = {
  raw: string
  name?: string
  args: string[]
}

export type CommandDecision = {
  verdict: "allowed" | "needs_approval" | "sandboxed"
  reason: string
}

export type CommandContext = Parameters<ToolDefinition["execute"]>[1]
