# system-and-signal

Example projects for System and Signal blog posts.

This repository contains multiple independent companion projects. Each project
lives in its own directory with its own dependencies, lockfile, scripts, and
README.

## Projects

- [`agents`](./agents): OpenClaw-style and Hermes-style agent harness examples
  for the shared-loop agent comparison post.
- [`agent-auth`](./agent-auth): Agent Auth Protocol examples comparing shared
  API keys with per-agent identity, scoped capabilities, and independent
  revocation.
- [`sync-agent`](./sync-agent): PowerSync-backed task-management agent with a
  durable local SQLite database synced from Postgres.

## Usage

Install and run each example from its project directory:

```bash
cd agents
bun install
bun test
```

```bash
cd agent-auth
bun install
bun run before:smoke
bun run after:scoped-transfer:smoke
```

```bash
cd sync-agent
bun install
bun run setup
docker compose up -d --wait
bun run start
```
