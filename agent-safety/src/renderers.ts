import type { AgentTarget, ProfileId, RenderedConfig, SafetyProfile } from "./types.ts"
import { SECRET_ENV_EXCLUDES, getProfile } from "./policies.ts"

export function renderConfig(target: AgentTarget, profileId: ProfileId): RenderedConfig {
  const profile = getProfile(profileId)
  if (target === "codex") {
    return {
      target,
      profile: profileId,
      filename: "config.toml",
      body: renderCodex(profile),
    }
  }

  return {
    target,
    profile: profileId,
    filename: "settings.json",
    body: renderClaude(profile),
  }
}

function renderCodex(profile: SafetyProfile): string {
  const profileName = profile.defaultPermissions.startsWith(":")
    ? profile.id.replaceAll("-", "_")
    : profile.defaultPermissions

  const lines: string[] = []
  lines.push(`# ${profile.label}`)
  lines.push(`[profiles.${profileName}]`)
  lines.push(`approval_policy = "${profile.approvalPolicy}"`)
  lines.push(`sandbox_mode = "${profile.sandboxMode}"`)
  lines.push("allow_login_shell = false")
  lines.push(`web_search = "${profile.webSearch}"`)
  lines.push(`default_permissions = "${profile.defaultPermissions}"`)
  lines.push("")
  lines.push(`[profiles.${profileName}.shell_environment_policy]`)
  lines.push(`inherit = "${profile.shellEnvironment}"`)
  lines.push(`exclude = ${tomlArray(SECRET_ENV_EXCLUDES)}`)

  if (profile.sandboxMode === "workspace-write") {
    lines.push("")
    lines.push(`[profiles.${profileName}.sandbox_workspace_write]`)
    lines.push(`network_access = ${profile.networkMode !== "disabled"}`)
  }

  if (!profile.defaultPermissions.startsWith(":")) {
    lines.push("")
    lines.push(`[permissions.${profile.defaultPermissions}.filesystem]`)
    lines.push("glob_scan_max_depth = 4")
    lines.push("")
    lines.push(`[permissions.${profile.defaultPermissions}.filesystem.":project_roots"]`)
    lines.push(`"." = "${profile.writableWorkspace ? "write" : "read"}"`)
    lines.push(`"**/.env" = "none"`)
    lines.push(`"**/.env.*" = "none"`)
    lines.push(`"secrets/**" = "none"`)
    lines.push(`"credentials/**" = "none"`)
    lines.push(`"private/**" = "none"`)
    lines.push("")
    lines.push(`[permissions.${profile.defaultPermissions}.network]`)
    lines.push(`enabled = ${profile.networkMode !== "disabled"}`)
    if (profile.networkMode !== "disabled") {
      lines.push(`mode = "${profile.networkMode}"`)
    }

    if (profile.networkMode === "limited") {
      lines.push("")
      lines.push(`[permissions.${profile.defaultPermissions}.network.domains]`)
      for (const domain of profile.allowedDomains) {
        lines.push(`${JSON.stringify(domain)} = "allow"`)
      }
      for (const domain of profile.deniedDomains) {
        lines.push(`${JSON.stringify(domain)} = "deny"`)
      }
    }
  }

  lines.push("")
  lines.push("# Command risk rules are enforced by this project's classifier.")
  lines.push("# Use `bun safety check --profile " + profile.id + ' --command "..."` before granting broad command rules.')

  return lines.join("\n")
}

function renderClaude(profile: SafetyProfile): string {
  const permissions = {
    permissions: {
      allow: profile.id === "safe-review"
        ? ["Read(./**)"]
        : [
            "Bash(bun run check)",
            "Bash(bun test)",
            "Bash(npm run *)",
            "Bash(git diff *)",
            "Bash(git status *)",
          ],
      deny: [
        "Bash(rm -rf *)",
        "Bash(git push --force *)",
        "Bash(git push -f *)",
        "Bash(git push origin main *)",
        "Bash(git push origin master *)",
        "Bash(terraform apply *)",
        "Bash(terraform destroy *)",
        "Bash(kubectl delete *)",
        "Bash(helm uninstall *)",
        "Bash(DROP *)",
        "Bash(TRUNCATE *)",
        "Read(./.env)",
        "Read(./.env.*)",
        "Read(./secrets/**)",
        "Read(./credentials/**)",
        "Read(./private/**)",
      ],
    },
  }

  return JSON.stringify(permissions, null, 2)
}

function tomlArray(values: string[]): string {
  return `[${values.map((value) => JSON.stringify(value)).join(", ")}]`
}
