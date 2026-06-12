import { readdir, readFile, stat } from "node:fs/promises"
import { join, relative, resolve } from "node:path"

import { classifyCommand, classifyPath, isSecretPath, severityForDecision } from "./classifier.ts"
import { getProfile } from "./policies.ts"
import type { AuditReport, Finding } from "./types.ts"

const SKIPPED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "out",
  "coverage",
  ".cache",
  ".next",
  ".nuxt",
  ".svelte-kit",
])

export interface AuditOptions {
  target: string
  maxDepth?: number
}

export async function auditWorkspace(options: AuditOptions): Promise<AuditReport> {
  const target = resolve(options.target)
  const rootStat = await stat(target)
  if (!rootStat.isDirectory()) {
    throw new Error(`Audit target must be a directory: ${options.target}`)
  }

  const report: AuditReport = {
    target,
    scannedAt: new Date().toISOString(),
    filesScanned: 0,
    directoriesScanned: 0,
    findings: [],
  }

  await scanDirectory(target, target, report, options.maxDepth ?? 8, 0)
  report.findings.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.path.localeCompare(b.path))
  return report
}

export function formatAuditText(report: AuditReport): string {
  const lines: string[] = []
  lines.push(`Agent Safety Audit: ${report.target}`)
  lines.push(`Files scanned: ${report.filesScanned}`)
  lines.push(`Directories scanned: ${report.directoriesScanned}`)
  lines.push(`Findings: ${report.findings.length}`)

  if (report.findings.length === 0) {
    lines.push("")
    lines.push("No findings.")
    return lines.join("\n")
  }

  lines.push("")
  for (const finding of report.findings) {
    lines.push(`[${finding.severity}] ${finding.category} (${finding.layer})`)
    lines.push(`  path: ${finding.path}`)
    lines.push(`  ${finding.message}`)
    lines.push(`  recommendation: ${finding.recommendation}`)
  }

  return lines.join("\n")
}

async function scanDirectory(
  root: string,
  dir: string,
  report: AuditReport,
  maxDepth: number,
  depth: number,
): Promise<void> {
  if (depth > maxDepth) return
  report.directoriesScanned += 1

  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const absolutePath = join(dir, entry.name)
    const relativePath = normalizeRelative(relative(root, absolutePath))

    if (entry.isSymbolicLink()) continue

    if (entry.isDirectory()) {
      if (SKIPPED_DIRS.has(entry.name)) continue

      if (isSecretPath(relativePath)) {
        report.findings.push(secretDirectoryFinding(relativePath))
        continue
      }

      await scanDirectory(root, absolutePath, report, maxDepth, depth + 1)
      continue
    }

    if (!entry.isFile()) continue
    report.filesScanned += 1

    const pathClassification = classifyPath(getProfile("guarded-dev"), relativePath)
    if (pathClassification.decision === "deny") {
      report.findings.push(secretFileFinding(relativePath, pathClassification.reason))
      continue
    }

    if (pathClassification.ruleId !== "default-allow" && pathClassification.decision === "prompt") {
      report.findings.push({
        id: `path:${pathClassification.ruleId}:${relativePath}`,
        category: "production-config",
        severity: "medium",
        layer: pathClassification.layer,
        path: relativePath,
        message: pathClassification.reason,
        recommendation: "Keep this path behind review or an explicit approval rule.",
      })
    }

    if (looksProductionShaped(relativePath)) {
      report.findings.push({
        id: `production-config:${relativePath}`,
        category: "production-config",
        severity: "medium",
        layer: "production-gates",
        path: relativePath,
        message: "This filename looks production-adjacent.",
        recommendation: "Confirm agents only prepare reviewed changes for production-like targets.",
      })
    }

    if (entry.name === "package.json") {
      await inspectPackageJson(absolutePath, relativePath, report)
    }
  }
}

async function inspectPackageJson(
  absolutePath: string,
  relativePath: string,
  report: AuditReport,
): Promise<void> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(absolutePath, "utf8"))
  } catch (error) {
    report.findings.push({
      id: `package-json-parse:${relativePath}`,
      category: "risky-script",
      severity: "low",
      layer: "tool-scope",
      path: relativePath,
      message: `Could not parse package.json: ${error instanceof Error ? error.message : String(error)}`,
      recommendation: "Fix the package manifest so scripts can be audited.",
    })
    return
  }

  if (!isRecord(parsed) || !isRecord(parsed.scripts)) return

  for (const [scriptName, scriptValue] of Object.entries(parsed.scripts)) {
    if (typeof scriptValue !== "string") continue
    const classification = classifyCommand(getProfile("guarded-dev"), scriptValue)
    if (classification.decision === "allow") continue

    report.findings.push({
      id: `script:${classification.ruleId}:${relativePath}:${scriptName}`,
      category: "risky-script",
      severity: severityForDecision(classification.decision),
      layer: classification.layer,
      path: `${relativePath}#scripts.${scriptName}`,
      message: `Script "${scriptName}" matched ${classification.ruleId}: ${classification.reason}`,
      recommendation:
        classification.decision === "deny"
          ? "Keep this command unavailable to ordinary agent sessions."
          : "Require explicit approval before running this script through an agent.",
    })
  }
}

function normalizeRelative(path: string): string {
  return path.replaceAll("\\", "/") || "."
}

function secretFileFinding(path: string, reason: string): Finding {
  return {
    id: `secret-file:${path}`,
    category: "secret-file",
    severity: "high",
    layer: "secrets-identity",
    path,
    message: reason,
    recommendation: "Deny agent reads for this path and use task-scoped credentials instead.",
  }
}

function secretDirectoryFinding(path: string): Finding {
  return {
    id: `sensitive-directory:${path}`,
    category: "sensitive-directory",
    severity: "high",
    layer: "secrets-identity",
    path,
    message: "Directory name suggests credential or secret material.",
    recommendation: "Keep secret directories outside the workspace or deny them in filesystem policy.",
  }
}

function looksProductionShaped(path: string): boolean {
  if (isSecretPath(path)) return false
  return /(^|[./_-])(prod|production)([./_-]|$)/i.test(path)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function severityRank(severity: Finding["severity"]): number {
  if (severity === "high") return 3
  if (severity === "medium") return 2
  return 1
}

