#!/usr/bin/env bun
/**
 * Analyze the current state of agent skills directories on the user's machine.
 * Compares installed skills against the project's skills/ directory as the
 * canonical source of truth.
 */

import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { readlink, stat, lstat, readdir } from "node:fs/promises";

const home = homedir();
const PROJECT_ROOT = resolve(dirname(import.meta.dirname), ".");
const PROJECT_SKILLS = join(PROJECT_ROOT, "skills");
const IGNORED_SKILL_DIR_NAMES = new Set([
  ".git",
  ".hg",
  ".svn",
  "__MACOSX",
]);

interface DirInfo {
  label: string;
  path: string;
  exists: boolean;
  isSymlink: boolean;
  symlinkTarget?: string;
  resolvedPath?: string;
  isDirectory: boolean;
  skillCount: number;
  skills: string[];
  error?: string;
}

const SKILL_DIRS = [
  { label: "Codex / OpenCode (canonical)", path: join(home, ".agents", "skills") },
  { label: "Codex (legacy)", path: join(home, ".codex", "skills") },
  { label: "Claude Code", path: join(home, ".claude", "skills") },
  { label: "Copilot (fallback)", path: join(home, ".copilot", "skills") },
  { label: "GitHub (repo-level)", path: join(home, ".github", "skills") },
];

async function getSkillNames(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !IGNORED_SKILL_DIR_NAMES.has(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

async function inspectDir(entry: { label: string; path: string }): Promise<DirInfo> {
  const info: DirInfo = {
    label: entry.label,
    path: entry.path,
    exists: false,
    isSymlink: false,
    isDirectory: false,
    skillCount: 0,
    skills: [],
  };

  try {
    const lstats = await lstat(entry.path);
    info.exists = true;
    info.isSymlink = lstats.isSymbolicLink();

    if (info.isSymlink) {
      const raw = await readlink(entry.path);
      info.symlinkTarget = raw;
      info.resolvedPath = resolve(entry.path, "..", raw);
    }

    const realStats = await stat(entry.path);
    info.isDirectory = realStats.isDirectory();

    if (info.isDirectory) {
      info.skills = await getSkillNames(entry.path);
      info.skillCount = info.skills.length;
    }
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        // does not exist, leave defaults
      } else if (code === "ELOOP") {
        info.exists = true;
        info.isSymlink = true;
        info.error = "Symlink loop detected";
        try {
          info.symlinkTarget = await readlink(entry.path);
        } catch {}
      } else {
        info.error = `${code}: ${(err as Error).message}`;
      }
    } else {
      info.error = String(err);
    }
  }

  return info;
}

function printDirInfo(info: DirInfo) {
  const status = info.exists ? (info.error ? "!!" : "OK") : "--";
  console.log(`\n  [${status}] ${info.label}`);
  console.log(`      Path: ${info.path}`);

  if (!info.exists) {
    console.log("      Status: Does not exist");
    return;
  }

  if (info.error) {
    console.log(`      Error: ${info.error}`);
  }

  if (info.isSymlink) {
    console.log(`      Type: Symlink -> ${info.symlinkTarget}`);
    if (info.resolvedPath && info.resolvedPath !== info.symlinkTarget) {
      console.log(`      Resolved: ${info.resolvedPath}`);
    }
  } else {
    console.log(`      Type: ${info.isDirectory ? "Real directory" : "File (unexpected)"}`);
  }

  if (info.isDirectory) {
    console.log(`      Skills found: ${info.skillCount}`);
    if (info.skills.length > 0) {
      console.log(`      Skills: ${info.skills.join(", ")}`);
    }
  }
}

async function checkParentDirs() {
  const parents = [
    join(home, ".agents"),
    join(home, ".codex"),
    join(home, ".claude"),
    join(home, ".copilot"),
  ];

  console.log("\n  Parent directories:");
  for (const dir of parents) {
    try {
      const s = await lstat(dir);
      const type = s.isSymbolicLink() ? "symlink" : s.isDirectory() ? "directory" : "other";
      console.log(`    ${dir} -> ${type}`);
    } catch {
      console.log(`    ${dir} -> does not exist`);
    }
  }
}

async function detectConflicts(results: DirInfo[], projectSkills: string[]) {
  const issues: string[] = [];

  const canonical = results.find((r) => r.label.includes("canonical"));
  const codexLegacy = results.find((r) => r.label === "Codex (legacy)");
  const claudeCode = results.find((r) => r.label === "Claude Code");
  const copilot = results.find((r) => r.label.includes("Copilot"));

  // Check if canonical exists as a real directory
  if (canonical?.exists && canonical.isSymlink) {
    issues.push("Canonical path ~/.agents/skills is a symlink, but should be a real directory.");
  }

  // Compare canonical against project source of truth
  if (canonical?.exists && canonical.isDirectory) {
    const missing = projectSkills.filter((s) => !canonical.skills.includes(s));
    const extra = canonical.skills.filter((s) => !projectSkills.includes(s));
    if (missing.length > 0) {
      issues.push(`Canonical is missing skills from project: ${missing.join(", ")}`);
    }
    if (extra.length > 0) {
      issues.push(`Canonical has skills not in project: ${extra.join(", ")}`);
    }
  } else if (!canonical?.exists) {
    issues.push(
      `Canonical directory ~/.agents/skills does not exist. ` +
        `${projectSkills.length} skill(s) from project need to be installed.`
    );
  }

  // Check Codex legacy path
  if (codexLegacy?.exists && codexLegacy.skillCount > 0) {
    issues.push(
      `~/.codex/skills has ${codexLegacy.skillCount} skill(s) that should be merged into ~/.agents/skills.`
    );
  }

  // Check Claude Code path
  if (claudeCode?.exists && !claudeCode.isSymlink) {
    issues.push(
      "~/.claude/skills is a real directory, not a symlink. " +
        "Skills here won't stay in sync with ~/.agents/skills."
    );
  }
  if (claudeCode?.isSymlink && claudeCode.resolvedPath !== canonical?.path) {
    issues.push(
      `~/.claude/skills symlink points to ${claudeCode.symlinkTarget}, ` +
        `expected ~/.agents/skills.`
    );
  }

  // Check Copilot path
  if (copilot?.exists && !copilot.isSymlink) {
    issues.push(
      "~/.copilot/skills is a real directory, not a symlink. " +
        "Skills here won't stay in sync with ~/.agents/skills."
    );
  }
  if (copilot?.isSymlink && copilot.resolvedPath !== canonical?.path) {
    issues.push(
      `~/.copilot/skills symlink points to ${copilot.symlinkTarget}, ` +
        `expected ~/.agents/skills.`
    );
  }

  // Check for skill divergence between real directories
  const realDirs = results.filter((r) => r.exists && r.isDirectory && !r.isSymlink && r.skillCount > 0);
  if (realDirs.length > 1) {
    const first = realDirs[0]!;
    for (const other of realDirs.slice(1)) {
      const onlyInFirst = first.skills.filter((s) => !other.skills.includes(s));
      const onlyInOther = other.skills.filter((s) => !first.skills.includes(s));
      if (onlyInFirst.length > 0 || onlyInOther.length > 0) {
        issues.push(
          `Skill divergence between ${first.label} and ${other.label}:\n` +
            (onlyInFirst.length > 0
              ? `        Only in ${first.label}: ${onlyInFirst.join(", ")}\n`
              : "") +
            (onlyInOther.length > 0
              ? `        Only in ${other.label}: ${onlyInOther.join(", ")}`
              : "")
        );
      }
    }
  }

  return issues;
}

function printRecommendation(results: DirInfo[], issues: string[]) {
  const canonical = results.find((r) => r.label.includes("canonical"));

  console.log("\n  Recommendation:");

  if (issues.length === 0 && canonical?.exists && !canonical.isSymlink) {
    const claudeCode = results.find((r) => r.label === "Claude Code");
    const copilot = results.find((r) => r.label.includes("Copilot"));
    const allGood =
      claudeCode?.isSymlink &&
      claudeCode.resolvedPath === canonical.path &&
      copilot?.isSymlink &&
      copilot.resolvedPath === canonical.path;

    if (allGood) {
      console.log("    Your unified skills setup looks correct. No action needed.");
    } else {
      console.log("    Run the configure script to complete the unified setup:");
      console.log("    bun run scripts/configure-skills-setup.ts");
    }
  } else {
    console.log("    Run the configure script to set up the unified skills directory:");
    console.log("    bun run scripts/configure-skills-setup.ts");
  }
}

// --- Main ---

console.log("=== Agent Skills Directory Analysis ===");
console.log(`\n  Home: ${home}`);
console.log(`  Date: ${new Date().toISOString()}`);

const projectSkills = await getSkillNames(PROJECT_SKILLS);
console.log(`\n  Project skills directory: ${PROJECT_SKILLS}`);
console.log(`  Skills in project (source of truth): ${projectSkills.length}`);
if (projectSkills.length > 0) {
  console.log(`  Skills: ${projectSkills.join(", ")}`);
}

await checkParentDirs();

console.log("\n  Installed skills directories:");

const results = await Promise.all(SKILL_DIRS.map(inspectDir));
for (const info of results) {
  printDirInfo(info);
}

const issues = await detectConflicts(results, projectSkills);

if (issues.length > 0) {
  console.log("\n  Issues detected:");
  for (const issue of issues) {
    console.log(`    - ${issue}`);
  }
} else {
  console.log("\n  No issues detected.");
}

printRecommendation(results, issues);

console.log("");
