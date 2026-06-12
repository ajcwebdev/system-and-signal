# system-and-signal

Example projects for System and Signal blog posts.

This repository contains multiple independent companion projects. Each project lives in its own directory with its own dependencies, lockfile, scripts, and README.

## Projects

### [`skills`](./skills)

`skills` lives in [`skills`](./skills). It is a portable agent skills collection with setup scripts for a unified skills directory across Claude Code, Codex, OpenCode, and Copilot.

```bash
cd skills
bun install
bun run scripts/analyze-skills-setup.ts
bun run scripts/configure-skills-setup.ts --dry-run
```

### [`agents`](./agents)

`agents` lives in [`agents`](./agents). It contains OpenClaw-style and Hermes-style agent harness examples for the shared-loop agent comparison post.

```bash
cd agents
bun install
bun run check
```

### [`agent-auth`](./agent-auth)

`agent-auth` lives in [`agent-auth`](./agent-auth). It contains Agent Auth Protocol examples comparing shared API keys with per-agent identity, scoped capabilities, and independent revocation.

```bash
cd agent-auth
bun install
bun run before:smoke
bun run after:scoped-transfer:smoke
```

### [`sync-agent`](./sync-agent)

`sync-agent` lives in [`sync-agent`](./sync-agent). It is a PowerSync-backed task-management agent with a durable local SQLite database synced from Postgres.

```bash
cd sync-agent
bun install
bun run setup
bun up
bun run start
```

### [`agent-safety`](./agent-safety)

`agent-safety` lives in [`agent-safety`](./agent-safety). It is a Bun CLI for auditing agent safety boundaries, classifying risky commands and paths, and rendering Codex or Claude configuration snippets.

```bash
cd agent-safety
bun install
bun safety profiles
bun safety audit --target .
bun run check
```

### [`image-video`](./image-video)

`image-video` lives in [`image-video`](./image-video). It is a Bun CLI for running live OpenAI image generation, Gemini image generation and editing, and Gemini Veo 3.1 video generation flows from the terminal.

```bash
cd image-video
bun install
cp .env.example .env
bun iv models
bun run check
```
