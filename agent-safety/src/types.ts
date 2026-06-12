export const PROFILE_IDS = [
  "safe-review",
  "guarded-dev",
  "net-limited",
  "isolated-ci",
] as const

export const AGENT_TARGETS = ["codex", "claude"] as const

export type ProfileId = (typeof PROFILE_IDS)[number]
export type AgentTarget = (typeof AGENT_TARGETS)[number]

export type Decision = "allow" | "prompt" | "deny"

export type Severity = "low" | "medium" | "high"

export type SafetyLayer =
  | "approval-policy"
  | "sandbox"
  | "command-rules"
  | "tool-scope"
  | "secrets-identity"
  | "recovery"
  | "production-gates"

export type SandboxMode = "read-only" | "workspace-write" | "danger-full-access"
export type NetworkMode = "disabled" | "limited" | "full"
export type EnvironmentInheritance = "none" | "core" | "all"

export interface SafetyRule {
  id: string
  pattern: string
  match: RegExp
  decision: Decision
  layer: SafetyLayer
  reason: string
}

export interface SafetyProfile {
  id: ProfileId
  label: string
  summary: string
  approvalPolicy: "on-request" | "never" | "untrusted"
  sandboxMode: SandboxMode
  defaultPermissions: string
  networkMode: NetworkMode
  shellEnvironment: EnvironmentInheritance
  writableWorkspace: boolean
  webSearch: "disabled" | "cached" | "live"
  allowedDomains: string[]
  deniedDomains: string[]
  notes: string[]
}

export interface Classification {
  subject: string
  kind: "command" | "path" | "domain"
  decision: Decision
  layer: SafetyLayer
  ruleId: string
  reason: string
}

export type FindingCategory =
  | "secret-file"
  | "risky-script"
  | "production-config"
  | "sensitive-directory"

export interface Finding {
  id: string
  category: FindingCategory
  severity: Severity
  layer: SafetyLayer
  path: string
  message: string
  recommendation: string
}

export interface AuditReport {
  target: string
  scannedAt: string
  filesScanned: number
  directoriesScanned: number
  findings: Finding[]
}

export interface RenderedConfig {
  target: AgentTarget
  profile: ProfileId
  filename: string
  body: string
}

