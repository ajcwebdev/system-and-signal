import type { ProfileId, SafetyProfile, SafetyRule } from "./types.ts"
import { PROFILE_IDS } from "./types.ts"

export const SECRET_ENV_EXCLUDES = [
  "*KEY*",
  "*SECRET*",
  "*TOKEN*",
  "AWS_*",
  "AZURE_*",
  "GCP_*",
  "DATABASE_URL",
  "PG*",
]

export const COMMON_DENY_COMMAND_RULES: SafetyRule[] = [
  {
    id: "rm-rf",
    pattern: "rm -rf",
    match: /\brm\s+-[^\s]*r[^\s]*f\b|\brm\s+-[^\s]*f[^\s]*r\b/i,
    decision: "deny",
    layer: "recovery",
    reason: "Recursive forced deletion can bypass agent checkpoints and git history.",
  },
  {
    id: "force-push",
    pattern: "git push --force",
    match: /\bgit\s+push\b.*(?:--force|-f)\b/i,
    decision: "deny",
    layer: "production-gates",
    reason: "Force pushes can overwrite shared history outside the workspace.",
  },
  {
    id: "direct-main-push",
    pattern: "git push origin main",
    match: /\bgit\s+push\s+origin\s+(main|master)\b/i,
    decision: "deny",
    layer: "production-gates",
    reason: "Direct pushes to protected branches should go through review.",
  },
  {
    id: "terraform-mutate",
    pattern: "terraform apply|destroy",
    match: /\bterraform\s+(apply|destroy)\b/i,
    decision: "deny",
    layer: "production-gates",
    reason: "Infrastructure mutation should run through reviewed pipelines.",
  },
  {
    id: "kubectl-delete",
    pattern: "kubectl delete",
    match: /\bkubectl\s+delete\b/i,
    decision: "deny",
    layer: "production-gates",
    reason: "Kubernetes deletion can mutate production-like infrastructure.",
  },
  {
    id: "helm-delete",
    pattern: "helm uninstall|delete",
    match: /\bhelm\s+(uninstall|delete)\b/i,
    decision: "deny",
    layer: "production-gates",
    reason: "Release deletion should not run from an ordinary agent session.",
  },
  {
    id: "destructive-sql",
    pattern: "DROP|TRUNCATE|DELETE FROM",
    match: /\b(drop\s+(table|database|schema)|truncate\s+(table\s+)?\w+|delete\s+from)\b/i,
    decision: "deny",
    layer: "production-gates",
    reason: "Destructive SQL must be reviewed against the intended environment.",
  },
]

export const COMMON_ALLOW_COMMAND_RULES: SafetyRule[] = [
  {
    id: "local-typecheck",
    pattern: "tsc --noEmit|bunx tsc --noEmit",
    match: /\b(?:bunx\s+)?tsc\s+--noEmit\b/i,
    decision: "allow",
    layer: "command-rules",
    reason: "Local TypeScript no-emit checks do not mutate project or external systems.",
  },
  {
    id: "local-test-script",
    pattern: "bun test|npm run test|npm run check",
    match: /\b(bun|npm|pnpm|yarn)\s+(test|run\s+(test|check|lint|typecheck))\b/i,
    decision: "allow",
    layer: "command-rules",
    reason: "Common local verification scripts are allowed by default.",
  },
  {
    id: "git-read-only",
    pattern: "git diff|status|log|show",
    match: /\bgit\s+(diff|status|log|show)\b/i,
    decision: "allow",
    layer: "command-rules",
    reason: "Read-only git inspection is safe in normal development sessions.",
  },
]

export const COMMON_PROMPT_COMMAND_RULES: SafetyRule[] = [
  {
    id: "database-cli",
    pattern: "psql|mysql|mongo|mongosh|redis-cli",
    match: /\b(psql|mysql|mongo|mongosh|redis-cli)\b/i,
    decision: "prompt",
    layer: "secrets-identity",
    reason: "Database CLIs can cross from local development into real data.",
  },
  {
    id: "cloud-cli",
    pattern: "aws|gcloud|az",
    match: /\b(aws|gcloud|az)\b/i,
    decision: "prompt",
    layer: "secrets-identity",
    reason: "Cloud CLIs may inherit broad credentials from the host shell.",
  },
  {
    id: "infra-cli",
    pattern: "terraform|pulumi|cdk|kubectl|helm",
    match: /\b(terraform|pulumi|cdk|kubectl|helm)\b/i,
    decision: "prompt",
    layer: "production-gates",
    reason: "Infrastructure commands need target-environment review.",
  },
  {
    id: "package-install",
    pattern: "npm|pnpm|yarn|bun install/add/update",
    match: /\b(npm|pnpm|yarn|bun)\s+(install|add|update|upgrade)\b/i,
    decision: "prompt",
    layer: "tool-scope",
    reason: "Package installs can run lifecycle scripts and fetch remote code.",
  },
  {
    id: "network-fetch",
    pattern: "curl|wget|npx|bunx|pip install",
    match: /\b(curl|wget|npx|bunx)\b|\bpip\s+install\b/i,
    decision: "prompt",
    layer: "sandbox",
    reason: "Networked shell commands need an explicit network boundary.",
  },
  {
    id: "container-runtime",
    pattern: "docker|docker compose",
    match: /\bdocker(?:\s+compose)?\b/i,
    decision: "prompt",
    layer: "sandbox",
    reason: "Container commands can mount host paths, sockets, and credentials.",
  },
  {
    id: "publish-or-deploy",
    pattern: "publish|deploy|migrate",
    match: /\b(npm|bun|pnpm)\s+publish\b|\bdeploy\b|\bmigrate\b|\bdb:(push|migrate)\b/i,
    decision: "prompt",
    layer: "production-gates",
    reason: "Release and migration commands should go through review.",
  },
  {
    id: "github-write",
    pattern: "git push|gh pr merge|gh release",
    match: /\bgit\s+push\b|\bgh\s+(pr\s+merge|release|repo\s+delete)\b/i,
    decision: "prompt",
    layer: "production-gates",
    reason: "Repository writes should be scoped to the intended branch or PR.",
  },
]

export const COMMON_DENY_PATH_RULES: SafetyRule[] = [
  {
    id: "env-file",
    pattern: ".env, .env.* except .env.example",
    match: /(^|\/)\.env($|\.)/i,
    decision: "deny",
    layer: "secrets-identity",
    reason: "Environment files commonly contain credentials or service URLs.",
  },
  {
    id: "private-key-file",
    pattern: "*.pem|*.key|*.p12|*.pfx",
    match: /\.(pem|key|p12|pfx)$/i,
    decision: "deny",
    layer: "secrets-identity",
    reason: "Private keys should not be readable in ordinary agent sessions.",
  },
  {
    id: "identity-file",
    pattern: "id_rsa|id_ed25519|.npmrc|.pypirc|.netrc",
    match: /(^|\/)(id_rsa|id_ed25519|\.npmrc|\.pypirc|\.netrc)$/i,
    decision: "deny",
    layer: "secrets-identity",
    reason: "Credential-bearing files expand the agent's external authority.",
  },
  {
    id: "secret-directory",
    pattern: "secret directories",
    match: /(^|\/)(secrets?|credentials?|private)(\/|$)/i,
    decision: "deny",
    layer: "secrets-identity",
    reason: "Secret directories should be outside the agent-readable workspace.",
  },
]

export const COMMON_PROMPT_PATH_RULES: SafetyRule[] = [
  {
    id: "migration-path",
    pattern: "migrations/",
    match: /(^|\/)migrations?(\/|$)/i,
    decision: "prompt",
    layer: "production-gates",
    reason: "Migration edits can affect persistent data and rollback plans.",
  },
  {
    id: "infra-path",
    pattern: "infra|terraform|k8s|kubernetes|deploy",
    match: /(^|\/)(infra|terraform|k8s|kubernetes|deploy)(\/|$)/i,
    decision: "prompt",
    layer: "production-gates",
    reason: "Infrastructure and deployment files control real environments.",
  },
  {
    id: "workflow-path",
    pattern: ".github/workflows",
    match: /(^|\/)\.github\/workflows\//i,
    decision: "prompt",
    layer: "production-gates",
    reason: "CI workflows can publish, deploy, or expose credentials.",
  },
  {
    id: "lockfile",
    pattern: "lockfiles",
    match: /(^|\/)(bun\.lock|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/i,
    decision: "prompt",
    layer: "tool-scope",
    reason: "Lockfile changes can alter installed code across environments.",
  },
  {
    id: "container-config",
    pattern: "Dockerfile|docker-compose.yaml",
    match: /(^|\/)(Dockerfile|docker-compose\.ya?ml)$/i,
    decision: "prompt",
    layer: "sandbox",
    reason: "Container config can expand mounts, ports, and host reach.",
  },
]

export const profiles: Record<ProfileId, SafetyProfile> = {
  "safe-review": {
    id: "safe-review",
    label: "Safe Review",
    summary: "Read-only planning and review with no command network or inherited secrets.",
    approvalPolicy: "on-request",
    sandboxMode: "read-only",
    defaultPermissions: ":read-only",
    networkMode: "disabled",
    shellEnvironment: "none",
    writableWorkspace: false,
    webSearch: "cached",
    allowedDomains: [],
    deniedDomains: ["*"],
    notes: [
      "Use for audits, unfamiliar repositories, suspicious inputs, and security review.",
      "The agent should inspect and propose changes, not mutate files or external systems.",
    ],
  },
  "guarded-dev": {
    id: "guarded-dev",
    label: "Guarded Development",
    summary: "Workspace edits with prompts or denials at real risk boundaries.",
    approvalPolicy: "on-request",
    sandboxMode: "workspace-write",
    defaultPermissions: "guarded_dev",
    networkMode: "disabled",
    shellEnvironment: "core",
    writableWorkspace: true,
    webSearch: "cached",
    allowedDomains: [],
    deniedDomains: [],
    notes: [
      "Use for normal local implementation work.",
      "Local code edits are smooth; secrets, network, infrastructure, and production paths are not.",
    ],
  },
  "net-limited": {
    id: "net-limited",
    label: "Network Limited",
    summary: "Guarded development with command network limited to specific domains.",
    approvalPolicy: "on-request",
    sandboxMode: "workspace-write",
    defaultPermissions: "net_limited",
    networkMode: "limited",
    shellEnvironment: "core",
    writableWorkspace: true,
    webSearch: "cached",
    allowedDomains: [
      "github.com",
      "registry.npmjs.org",
      "bun.sh",
      "developers.openai.com",
      "code.claude.com",
    ],
    deniedDomains: ["*"],
    notes: [
      "Use when dependency or documentation access is necessary.",
      "Prefer exact domain additions over broad egress.",
    ],
  },
  "isolated-ci": {
    id: "isolated-ci",
    label: "Isolated CI",
    summary: "Non-interactive execution only inside disposable isolation with no production authority.",
    approvalPolicy: "never",
    sandboxMode: "workspace-write",
    defaultPermissions: "isolated_ci",
    networkMode: "disabled",
    shellEnvironment: "none",
    writableWorkspace: true,
    webSearch: "disabled",
    allowedDomains: [],
    deniedDomains: ["*"],
    notes: [
      "Use only for disposable CI or VM jobs with scoped checkouts and no valuable credentials.",
      "Do not combine non-interactive approvals with production write credentials.",
    ],
  },
}

export function isProfileId(value: string): value is ProfileId {
  return PROFILE_IDS.includes(value as ProfileId)
}

export function getProfile(id: ProfileId): SafetyProfile {
  return profiles[id]
}

export function listProfiles(): SafetyProfile[] {
  return PROFILE_IDS.map((id) => profiles[id])
}
