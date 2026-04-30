#!/usr/bin/env bun
/**
 * Configure a unified agent skills directory setup.
 *
 * Uses the project's skills/ directory as the canonical source of truth.
 *
 * Canonical layout:
 *   ~/.agents/skills/          (real directory - populated from project skills/)
 *   ~/.codex/skills   ->       ~/.agents/skills (symlink)
 *   ~/.claude/skills  ->       ~/.agents/skills (symlink)
 *   ~/.copilot/skills ->       ~/.agents/skills (symlink)
 *
 * This script will:
 *   1. Create ~/.agents/skills/ if it doesn't exist
 *   2. Sync skills from the project's skills/ directory into canonical
 *   3. Merge any existing skills from other real directories into canonical
 *   4. Replace real directories with symlinks to canonical
 *   5. Create missing symlinks
 *   6. Verify the final state
 */

import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import {
  readlink,
  stat,
  lstat,
  readdir,
  mkdir,
  symlink,
  rename,
  rm,
  cp,
} from "node:fs/promises";

const home = homedir();
const PROJECT_ROOT = resolve(dirname(import.meta.dirname), ".");
const PROJECT_SKILLS = join(PROJECT_ROOT, "skills");
const CANONICAL = join(home, ".agents", "skills");
const IGNORED_SKILL_DIR_NAMES = new Set([
  ".git",
  ".hg",
  ".svn",
  "__MACOSX",
]);

const SYMLINK_TARGETS = [
  { label: "Codex (legacy)", path: join(home, ".codex", "skills"), parent: join(home, ".codex") },
  { label: "Claude Code", path: join(home, ".claude", "skills"), parent: join(home, ".claude") },
  { label: "Copilot", path: join(home, ".copilot", "skills"), parent: join(home, ".copilot") },
];

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");

function log(msg: string) {
  console.log(`  ${msg}`);
}

function action(msg: string) {
  const prefix = DRY_RUN ? "[DRY RUN]" : "[ACTION]";
  console.log(`  ${prefix} ${msg}`);
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

async function isSymlink(path: string): Promise<boolean> {
  try {
    const s = await lstat(path);
    return s.isSymbolicLink();
  } catch {
    return false;
  }
}

async function isRealDir(path: string): Promise<boolean> {
  try {
    const s = await lstat(path);
    return s.isDirectory() && !s.isSymbolicLink();
  } catch {
    return false;
  }
}

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

async function syncProjectSkills() {
  const projectSkills = await getSkillNames(PROJECT_SKILLS);
  const canonicalSkills = await getSkillNames(CANONICAL);

  log(`Project has ${projectSkills.length} skill(s), canonical has ${canonicalSkills.length}`);

  // Copy new/updated skills from project to canonical
  for (const skill of projectSkills) {
    const src = join(PROJECT_SKILLS, skill);
    const dest = join(CANONICAL, skill);

    if (canonicalSkills.includes(skill)) {
      action(`Update skill "${skill}" from project (overwrite)`);
      if (!DRY_RUN) {
        await rm(dest, { recursive: true });
        await cp(src, dest, { recursive: true });
      }
    } else {
      action(`Install skill "${skill}" from project`);
      if (!DRY_RUN) {
        await cp(src, dest, { recursive: true });
      }
    }
  }

  // Flag skills in canonical that aren't in the project
  const extra = canonicalSkills.filter((s) => !projectSkills.includes(s));
  if (extra.length > 0) {
    log(`Note: ${extra.length} skill(s) in canonical not in project: ${extra.join(", ")}`);
    log("  These were kept as-is (may have been merged from other directories).");
  }
}

async function mergeSkillsIntoCanonical(sourceDir: string, label: string) {
  const sourceSkills = await getSkillNames(sourceDir);
  const canonicalSkills = await getSkillNames(CANONICAL);

  for (const skill of sourceSkills) {
    const src = join(sourceDir, skill);
    const dest = join(CANONICAL, skill);

    if (canonicalSkills.includes(skill)) {
      log(`  Skill "${skill}" already exists in canonical, skipping from ${label}`);
      continue;
    }

    action(`Copy skill "${skill}" from ${label} to canonical`);
    if (!DRY_RUN) {
      await cp(src, dest, { recursive: true });
    }
  }
}

async function ensureCanonicalDir() {
  if (await isRealDir(CANONICAL)) {
    log(`Canonical directory exists: ${CANONICAL}`);
    return;
  }

  if (await isSymlink(CANONICAL)) {
    const target = await readlink(CANONICAL);
    log(`WARNING: ${CANONICAL} is a symlink to ${target}`);
    if (!FORCE) {
      console.error(
        "  Canonical path is a symlink. Use --force to remove it and create a real directory."
      );
      process.exit(1);
    }
    action(`Remove symlink at ${CANONICAL}`);
    if (!DRY_RUN) {
      await rm(CANONICAL);
    }
  }

  action(`Create directory: ${CANONICAL}`);
  if (!DRY_RUN) {
    await mkdir(CANONICAL, { recursive: true });
  }
}

async function setupSymlink(entry: { label: string; path: string; parent: string }) {
  // Ensure parent directory exists
  if (!(await exists(entry.parent))) {
    action(`Create parent directory: ${entry.parent}`);
    if (!DRY_RUN) {
      await mkdir(entry.parent, { recursive: true });
    }
  }

  // Already a correct symlink?
  if (await isSymlink(entry.path)) {
    const target = await readlink(entry.path);
    const resolved = resolve(entry.path, "..", target);
    if (resolved === CANONICAL) {
      log(`${entry.label}: Symlink already correct -> ${target}`);
      return;
    }

    // Points somewhere wrong
    action(`${entry.label}: Remove incorrect symlink (was -> ${target})`);
    if (!DRY_RUN) {
      await rm(entry.path);
    }
  } else if (await isRealDir(entry.path)) {
    // Real directory - merge skills first, then replace
    log(`${entry.label}: Found real directory with skills to merge`);
    await mergeSkillsIntoCanonical(entry.path, entry.label);

    const backup = `${entry.path}.backup-${Date.now()}`;
    action(`${entry.label}: Rename real directory to ${backup}`);
    if (!DRY_RUN) {
      await rename(entry.path, backup);
    }
    log(`  (You can delete ${backup} after verifying the setup)`);
  } else if (await exists(entry.path)) {
    // Something unexpected
    if (!FORCE) {
      console.error(`  ${entry.path} exists but is not a directory or symlink. Use --force to remove.`);
      process.exit(1);
    }
    action(`${entry.label}: Remove unexpected file at ${entry.path}`);
    if (!DRY_RUN) {
      await rm(entry.path);
    }
  }

  action(`${entry.label}: Create symlink ${entry.path} -> ${CANONICAL}`);
  if (!DRY_RUN) {
    await symlink(CANONICAL, entry.path);
  }
}

async function verify() {
  const projectSkills = await getSkillNames(PROJECT_SKILLS);

  console.log("\n  === Verification ===\n");

  // Check canonical
  const canonicalOk = await isRealDir(CANONICAL);
  log(`${canonicalOk ? "PASS" : "FAIL"} Canonical directory: ${CANONICAL}`);

  if (canonicalOk) {
    const skills = await getSkillNames(CANONICAL);
    log(`  Contains ${skills.length} skill(s): ${skills.join(", ") || "(none)"}`);

    const missing = projectSkills.filter((s) => !skills.includes(s));
    if (missing.length > 0) {
      log(`  WARN Missing from project: ${missing.join(", ")}`);
    } else {
      log(`  All ${projectSkills.length} project skill(s) installed`);
    }
  }

  // Check symlinks
  for (const entry of SYMLINK_TARGETS) {
    const isSym = await isSymlink(entry.path);
    if (!isSym) {
      log(`FAIL ${entry.label}: ${entry.path} is not a symlink`);
      continue;
    }
    const target = await readlink(entry.path);
    const resolved = resolve(entry.path, "..", target);
    const correct = resolved === CANONICAL;
    log(`${correct ? "PASS" : "FAIL"} ${entry.label}: ${entry.path} -> ${target}`);
  }
}

// --- Main ---

console.log("=== Configure Unified Agent Skills Directory ===\n");

if (DRY_RUN) {
  console.log("  Running in DRY RUN mode. No changes will be made.\n");
}

log(`Project skills: ${PROJECT_SKILLS}`);
log(`Canonical path: ${CANONICAL}`);
console.log("");

// Step 1: Ensure canonical directory
log("Step 1: Ensure canonical directory exists");
await ensureCanonicalDir();
console.log("");

// Step 2: Sync project skills into canonical
log("Step 2: Sync project skills into canonical");
await syncProjectSkills();
console.log("");

// Step 3: Set up symlinks (with merge if needed)
log("Step 3: Configure symlinks");
for (const entry of SYMLINK_TARGETS) {
  await setupSymlink(entry);
}

// Step 4: Verify
if (!DRY_RUN) {
  await verify();
}

console.log("\n  Done.\n");

if (DRY_RUN) {
  console.log("  To apply changes, run again without --dry-run:");
  console.log("  bun run scripts/configure-skills-setup.ts\n");
}
