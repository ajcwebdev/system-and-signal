# Agent Safety CLI

A Bun and TypeScript companion project for turning the agent safety model from
the System and Signal post into local checks and configuration snippets.

The CLI is intentionally non-mutating by default. It audits a workspace, classifies
commands and paths, and renders Codex or Claude safety config. It only writes a
file when you pass `--out`.

## Quick Start

```bash
bun install
bun safety profiles
bun safety audit --target .
bun safety check --profile guarded-dev --command "terraform apply"
bun safety render --agent codex --profile guarded-dev
```

## What It Does

- Models four practical agent operating profiles:
  - `safe-review`: read-only review, no command network, no inherited secrets.
  - `guarded-dev`: workspace edits with prompts or denials at risk boundaries.
  - `net-limited`: guarded development with explicit domain allowlists.
  - `isolated-ci`: non-interactive execution only inside disposable isolation.
- Classifies commands, paths, and domains as `allow`, `prompt`, or `deny`.
- Audits workspaces for secret-shaped files, production-shaped config, risky
  `package.json` scripts, and sensitive directories.
- Renders Codex `config.toml` snippets and Claude `settings.json` permission
  snippets from the same policy data.

## Commands

Show the supported profiles:

```bash
bun safety profiles
```

Expected output starts like:

```text
safe-review - Safe Review
  Read-only planning and review with no command network or inherited secrets.
  approval=on-request sandbox=read-only network=disabled

guarded-dev - Guarded Development
  Workspace edits with prompts or denials at real risk boundaries.
  approval=on-request sandbox=workspace-write network=disabled
```

Audit the current project:

```bash
bun safety audit --target . --format text
bun safety audit --target . --format json
```

Text output includes the scan counts and any findings. A clean workspace ends
with `No findings.`; this project reports the lockfile as review-boundary work:

```text
Agent Safety Audit: /path/to/project
Files scanned: 14
Directories scanned: 3
Findings: 1

[medium] production-config (tool-scope)
  path: bun.lock
  Lockfile changes can alter installed code across environments.
```

Classify one subject:

```bash
bun safety check --profile guarded-dev --command "git push --force origin main"
bun safety check --profile guarded-dev --path .env
bun safety check --profile net-limited --domain github.com
```

Expected command and domain decisions:

```text
subject: git push --force origin main
kind: command
decision: deny
layer: production-gates
rule: force-push
reason: Force pushes can overwrite shared history outside the workspace.
```

```text
subject: github.com
kind: domain
decision: allow
layer: sandbox
rule: domain-allowlist
reason: github.com is allowed by the net-limited domain allowlist.
```

Render config:

```bash
bun safety render --agent codex --profile guarded-dev
bun safety render --agent claude --profile safe-review
```

Codex output starts as TOML:

```toml
# Guarded Development
[profiles.guarded_dev]
approval_policy = "on-request"
sandbox_mode = "workspace-write"
allow_login_shell = false
web_search = "cached"
default_permissions = "guarded_dev"
```

Claude output is JSON and includes permission rules like:

```text
{
  "permissions": {
    "allow": [
      "Read(./**)"
    ],
    "deny": [
      "Bash(rm -rf *)",
      "Bash(git push --force *)",
      ...
      "Read(./.env)"
    ]
  }
}
```

Write output explicitly:

```bash
bun safety render --agent codex --profile net-limited --out codex-net-limited.toml
```

## Project Structure

```text
src/
├── audit.ts        # Workspace scanner and text report formatter
├── classifier.ts  # Command, path, and domain decisions
├── cli.ts         # Bun CLI entrypoint
├── policies.ts    # Profile definitions and shared risk rules
├── renderers.ts   # Codex TOML and Claude JSON rendering
└── types.ts       # Shared public types
tests/
├── audit.test.ts
├── classifier.test.ts
└── renderers.test.ts
```

## Development

```bash
bun run check
bun test
```

The tests only exercise local policy behavior. They do not call external APIs.
