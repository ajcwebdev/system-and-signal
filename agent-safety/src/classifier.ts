import type { Classification, SafetyLayer, SafetyProfile, SafetyRule } from "./types.ts"
import {
  COMMON_ALLOW_COMMAND_RULES,
  COMMON_DENY_COMMAND_RULES,
  COMMON_DENY_PATH_RULES,
  COMMON_PROMPT_COMMAND_RULES,
  COMMON_PROMPT_PATH_RULES,
} from "./policies.ts"

export function classifyCommand(profile: SafetyProfile, command: string): Classification {
  const subject = command.trim()
  const deny = firstMatchingRule(COMMON_DENY_COMMAND_RULES, subject)
  if (deny) return fromRule("command", subject, deny)

  const allow = firstMatchingRule(COMMON_ALLOW_COMMAND_RULES, subject)
  if (allow) return fromRule("command", subject, allow)

  const prompt = firstMatchingRule(COMMON_PROMPT_COMMAND_RULES, subject)
  if (prompt) return fromRule("command", subject, prompt)

  if (profile.id === "safe-review") {
    return {
      subject,
      kind: "command",
      decision: "prompt",
      layer: "approval-policy",
      ruleId: "safe-review-command",
      reason: "Safe review mode should keep meaningful shell execution interactive.",
    }
  }

  return defaultAllow("command", subject, "command-rules")
}

export function classifyPath(profile: SafetyProfile, path: string): Classification {
  const subject = normalizePath(path)

  if (isEnvExample(subject)) {
    return {
      subject,
      kind: "path",
      decision: "allow",
      layer: "secrets-identity",
      ruleId: "env-example",
      reason: ".env.example is treated as a template, not a secret file.",
    }
  }

  const deny = firstMatchingRule(COMMON_DENY_PATH_RULES, subject)
  if (deny) return fromRule("path", subject, deny)

  const prompt = firstMatchingRule(COMMON_PROMPT_PATH_RULES, subject)
  if (prompt) return fromRule("path", subject, prompt)

  if (!profile.writableWorkspace) {
    return {
      subject,
      kind: "path",
      decision: "prompt",
      layer: "sandbox",
      ruleId: "read-only-profile",
      reason: "This profile is intended for inspection rather than file mutation.",
    }
  }

  return defaultAllow("path", subject, "sandbox")
}

export function classifyDomain(profile: SafetyProfile, domainOrUrl: string): Classification {
  const subject = normalizeDomain(domainOrUrl)

  if (profile.networkMode === "disabled") {
    return {
      subject,
      kind: "domain",
      decision: profile.id === "guarded-dev" ? "prompt" : "deny",
      layer: "sandbox",
      ruleId: "network-disabled",
      reason: "Command network is disabled for this profile.",
    }
  }

  if (profile.networkMode === "full") {
    return {
      subject,
      kind: "domain",
      decision: "allow",
      layer: "sandbox",
      ruleId: "network-full",
      reason: "This profile allows full command network access.",
    }
  }

  for (const allowedDomain of profile.allowedDomains) {
    if (matchesDomain(subject, allowedDomain)) {
      return {
        subject,
        kind: "domain",
        decision: "allow",
        layer: "sandbox",
        ruleId: "domain-allowlist",
        reason: `${subject} is allowed by the ${profile.id} domain allowlist.`,
      }
    }
  }

  return {
    subject,
    kind: "domain",
    decision: "deny",
    layer: "sandbox",
    ruleId: "domain-not-allowlisted",
    reason: `${subject} is not in the ${profile.id} domain allowlist.`,
  }
}

export function isSecretPath(path: string): boolean {
  return classifyPath(
    {
      id: "guarded-dev",
      label: "Guarded Development",
      summary: "",
      approvalPolicy: "on-request",
      sandboxMode: "workspace-write",
      defaultPermissions: "guarded_dev",
      networkMode: "disabled",
      shellEnvironment: "core",
      writableWorkspace: true,
      webSearch: "cached",
      allowedDomains: [],
      deniedDomains: [],
      notes: [],
    },
    path,
  ).decision === "deny"
}

function firstMatchingRule(rules: SafetyRule[], subject: string): SafetyRule | undefined {
  return rules.find((rule) => rule.match.test(subject))
}

function fromRule(
  kind: Classification["kind"],
  subject: string,
  rule: SafetyRule,
): Classification {
  return {
    subject,
    kind,
    decision: rule.decision,
    layer: rule.layer,
    ruleId: rule.id,
    reason: rule.reason,
  }
}

function defaultAllow(
  kind: Classification["kind"],
  subject: string,
  layer: SafetyLayer,
): Classification {
  return {
    subject,
    kind,
    decision: "allow",
    layer,
    ruleId: "default-allow",
    reason: "No configured risk rule matched.",
  }
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\/+/, "")
}

function isEnvExample(path: string): boolean {
  return /(^|\/)\.env\.example$/i.test(path)
}

function normalizeDomain(domainOrUrl: string): string {
  const value = domainOrUrl.trim().toLowerCase()
  try {
    const url = value.includes("://") ? new URL(value) : new URL(`https://${value}`)
    return url.hostname.replace(/^\.+|\.+$/g, "")
  } catch {
    return value.replace(/^\.+|\.+$/g, "").split("/")[0] ?? value
  }
}

function matchesDomain(domain: string, pattern: string): boolean {
  const normalizedPattern = pattern.toLowerCase()
  if (normalizedPattern === "*") return true
  if (normalizedPattern.startsWith("*.")) {
    const suffix = normalizedPattern.slice(2)
    return domain === suffix || domain.endsWith(`.${suffix}`)
  }
  return domain === normalizedPattern || domain.endsWith(`.${normalizedPattern}`)
}

export function severityForDecision(decision: Classification["decision"]): "low" | "medium" | "high" {
  if (decision === "deny") return "high"
  if (decision === "prompt") return "medium"
  return "low"
}

export function layerLabel(layer: SafetyLayer): string {
  return layer.replaceAll("-", " ")
}
