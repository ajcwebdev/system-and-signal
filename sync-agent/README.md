# Sync Agent

A Bun and TypeScript demo of an AI task-management agent backed by
[PowerSync](https://www.powersync.com/). The agent keeps a durable local SQLite
database in sync with Postgres, then exposes SQL-backed tools to an optional
LLM-powered REPL.

## What This Builds

- A local Postgres, MongoDB, and PowerSync stack using Docker Compose.
- Seeded `projects` and `tasks` tables in Postgres.
- A local `agent.db` SQLite database synced by `@powersync/node`.
- An interactive project-management agent for listing, creating, updating,
  searching, and completing tasks.
- A watch query that prints new task assignments for `agent-001` in real time.
- Optional Anthropic Claude tool calling through `ANTHROPIC_API_KEY`.

## Prerequisites

- [Bun](https://bun.sh/) v1.2 or newer
- [Node.js](https://nodejs.org/) v23.6 or newer for running the agent
- Docker and Docker Compose
- Optional: an [Anthropic API key](https://console.anthropic.com/) for the LLM
  agent loop

## Quick Start

Install dependencies:

```bash
bun install
```

Generate the development PowerSync service config and `.env`:

```bash
bun setup
```

If you want LLM responses, edit `.env` and set:

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

Start Postgres, MongoDB, and PowerSync:

```bash
bun up
```

Run the agent:

```bash
bun start
```

You should see the first sync complete, followed by an interactive prompt:

```text
Waiting for first sync (timeout 60000ms)...
Synced - 7 tasks in local database
Watching for tasks assigned to agent-001...
Agent ready. Type a message or 'quit' to exit.

you>
```

Without `ANTHROPIC_API_KEY`, the app still starts and syncs data, but the REPL
will ask you to set the key before it can answer with the LLM.

## Commands

| Command | Description |
| --- | --- |
| `bun install` | Install dependencies from `bun.lock`. |
| `bun setup` | Generate `powersync/service.yaml` and `.env` for local development. |
| `bun up` | Start the local Postgres, MongoDB, and PowerSync stack, then wait for healthy services. |
| `bun powersync:stop` | Stop only the PowerSync service. |
| `bun powersync:start` | Start only the PowerSync service. |
| `bun start` | Start the agent once. |
| `bun dev` | Start the agent with Node watch mode. |
| `bun check` | Run the TypeScript compiler without emitting files. |
| `docker compose down` | Stop the local stack. |
| `docker compose down -v` | Stop the local stack and remove Postgres and MongoDB volumes. |
| `rm -f agent.db agent.db-*` | Remove the local synced SQLite database and sidecar files. |

## Project Structure

```text
.
├── docker-compose.yaml          # Postgres + MongoDB + PowerSync services
├── seed.sql                     # Postgres schema, publication, and seed data
├── powersync/
│   └── sync-config.yaml         # PowerSync streams for projects and tasks
├── scripts/
│   └── setup.ts                 # Generates dev JWT, service config, and .env
├── src/
│   ├── agent.ts                 # Anthropic tool-calling REPL
│   ├── connector.ts             # PowerSync credentials and upload handling
│   ├── db.ts                    # Local PowerSync SQLite initialization
│   ├── schema.ts                # Client-side PowerSync schema
│   ├── tools.ts                 # SQL-backed task-management tools
│   └── watch.ts                 # Real-time task assignment watcher
└── index.ts                     # App entry point
```

## Environment

`bun setup` writes a local `.env` file with:

```bash
POWERSYNC_URL=http://localhost:8080
POWERSYNC_TOKEN=<generated development JWT>
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
ANTHROPIC_API_KEY=
```

It also writes `powersync/service.yaml`, which contains the generated public key
configuration used by the PowerSync service. Both generated files are ignored by
Git. The generated PowerSync JWT is valid for 23 hours because the self-hosted
service rejects client tokens with lifetimes longer than 24 hours.

## Data And Sync

The demo uses two synced tables:

- `projects`: project metadata owned by `agent-001`
- `tasks`: task records with status, assignee, priority, and completion fields

`seed.sql` creates the tables, registers the `powersync` publication for logical
replication, and inserts three projects with seven tasks.

`powersync/sync-config.yaml` currently syncs all rows from both tables:

```yaml
streams:
  projects:
    auto_subscribe: true
    query: SELECT * FROM projects

  tasks:
    auto_subscribe: true
    query: SELECT * FROM tasks
```

For production, scope streams by the authenticated user instead of syncing all
rows to every client.

## Agent Tools

The LLM can call these SQL-backed tools against the local SQLite database:

- `list_projects`
- `list_tasks`
- `create_task`
- `update_task`
- `complete_task`
- `search_tasks`
- `get_project_summary`

Writes happen locally first, then PowerSync uploads them back to Postgres through
`src/connector.ts`.

## Reset Local State

To rebuild everything from scratch:

```bash
docker compose down -v
rm -f agent.db agent.db-*
bun setup
bun up
bun start
```

`docker compose down -v` removes the local Postgres and MongoDB volumes, so any
changes made during the demo will be lost.
