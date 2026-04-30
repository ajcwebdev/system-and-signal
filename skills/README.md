# Agent Skills

A portable collection of agent skills for Claude Code, Codex, OpenCode, and Copilot with scripts to configure a unified skills directory setup.

## Setup

```bash
bun install
```

## Scripts

### Analyze current setup

Inspect the current state of all skills directories on your machine and compare them against the project's `skills/` directory (the source of truth).

```bash
bun run scripts/analyze-skills-setup.ts
```

### Configure unified setup

Create `~/.agents/skills/` as the canonical directory, sync skills from the project, and symlink all tool-specific paths to it.

```bash
# Preview changes without modifying anything
bun run scripts/configure-skills-setup.ts --dry-run

# Apply changes
bun run scripts/configure-skills-setup.ts

# Force past unexpected states (e.g. canonical is a symlink)
bun run scripts/configure-skills-setup.ts --force
```

The resulting layout:

```
~/.agents/skills/    (real directory, populated from project skills/)
~/.codex/skills  ->  ~/.agents/skills  (symlink)
~/.claude/skills ->  ~/.agents/skills  (symlink)
~/.copilot/skills -> ~/.agents/skills  (symlink)
```