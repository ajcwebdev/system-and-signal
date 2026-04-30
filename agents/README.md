# Agents Example

This project is a Bun companion implementation for the System and Signal article
comparing OpenClaw-style and Hermes-style agent harnesses.

It does not render the blog post. It demonstrates one claim in code:

- one shared agent loop
- two harness profiles: `openclaw` and `hermes`
- the same prompt can be run through both to show where they diverge

## Install

```bash
bun install
```

Runtime commands require an OpenAI API key:

```bash
export OPENAI_API_KEY=...
```

The runtime seeds default `config/` and `data/` demo files on first run if they are missing.

## Run

The exact runtime wording can vary by model, but the examples below reflect the current formatter shape.
All examples use `bun ah`, which maps to `bun run src/cli.ts run` from `package.json`. Bun forwards the arguments directly, so these commands do not need an extra `--`.

OpenClaw-style run:

```bash
bun ah --profile openclaw --message "What shell do I prefer?"
```

Example output:

```
OPENCLAW RESULT
---------------

Reply: I do not have that stored yet.

System Prompt Sections
  > Loaded operator-authored SOUL.md identity.
  > Memory stays passive unless the user explicitly saves or searches it.
  > Command permissions use a fixed allowlist and return needs_approval otherwise.

Model Decisions
  ? No proactive preference in context dispatching search_memory.
  ? Tool results detected (search_memory) composing final response.
```

Hermes-style run:

```bash
bun ah --profile hermes --message "What shell do I prefer?"
```

Example output:

```
HERMES RESULT
-------------

Reply: Here is the strongest match I found in memory: The demo project is a Bun companion implementation for the article.

System Prompt Sections
  > Injected curated memory from MEMORY.md.
  > Injected learned user model from USER.md.
  > Injected generated skills and recent session recall.
  > Automatic post-turn learning can update the user model and create skill notes.

Model Decisions
  ? No proactive preference in context dispatching search_memory.
  ? Tool results detected (search_memory) composing final response.
```

Explicit memory in the OpenClaw profile:

```bash
bun ah --profile openclaw --user alice --session prefs --message "Remember that I prefer zsh for shell work"
```

Example output:

```
OPENCLAW RESULT
---------------

Reply: Saved explicit memory: I prefer zsh for shell work.

System Prompt Sections
  > Loaded operator-authored SOUL.md identity.
  > Memory stays passive unless the user explicitly saves or searches it.
  > Command permissions use a fixed allowlist and return needs_approval otherwise.

Memory Writes
  + Saved explicit memory: I prefer zsh for shell work

Model Decisions
  ? Dispatching save_memory for "I prefer zsh for shell work".
  ? Tool results detected (save_memory) composing final response.
```

```bash
bun ah --profile openclaw --user alice --session prefs --message "What shell do I prefer?"
```

```
OPENCLAW RESULT
---------------

Reply: Here is the strongest match I found in memory: I prefer zsh for shell work.

System Prompt Sections
  > Loaded operator-authored SOUL.md identity.
  > Memory stays passive unless the user explicitly saves or searches it.
  > Command permissions use a fixed allowlist and return needs_approval otherwise.

Model Decisions
  ? No proactive preference in context dispatching search_memory.
  ? Tool results detected (search_memory) composing final response.
```

Side-by-side comparison:

```bash
bun ah --profile openclaw --user alice --session logs --message "search recent logs for timeout failures"
```

Example output:

```
OPENCLAW RESULT
---------------

Reply: I checked the demo log for "timeout failures".
       Found 2 matching log lines.
       demo.log:2: 2026-03-14T18:03:44Z ERROR request failed: timeout while contacting model gateway
       demo.log:3: 2026-03-14T18:05:15Z ERROR worker crashed after repeated timeout failures

System Prompt Sections
  > Loaded operator-authored SOUL.md identity.
  > Memory stays passive unless the user explicitly saves or searches it.
  > Command permissions use a fixed allowlist and return needs_approval otherwise.

Model Decisions
  ? Dispatching search_logs for "timeout failures".
  ? Tool results detected (search_logs) composing final response.
```

```bash
bun ah --profile hermes --user alice --session logs --message "search recent logs for timeout failures"
```

Example output:

```
HERMES RESULT
-------------

Reply: Executed Hermes script: analyze timeout failures
       Report: reports/timeout-failures.txt
       Matches: 2
       data/logs/demo.log:2: 2026-03-14T18:03:44Z ERROR request failed: timeout while contacting model gateway
       data/logs/demo.log:3: 2026-03-14T18:05:15Z ERROR worker crashed after repeated timeout failures

System Prompt Sections
  > Injected curated memory from MEMORY.md.
  > Injected learned user model from USER.md.
  > Injected generated skills and recent session recall.
  > Automatic post-turn learning can update the user model and create skill notes.

Generated Skills
  * ./data/skills/search-recent-logs-for-timeout-failures.md

Sandbox Events
  # Synced Hermes sandbox fixtures into ./data/sandboxes/hermes.
  # Wrote sandbox report ./data/sandboxes/hermes/reports/timeout-failures.txt.

Model Decisions
  ? Dispatching execute_code for "timeout failures".
  ? Tool results detected (execute_code) composing final response.
```

The model may also choose `run_command` with individual shell commands (e.g. `grep`) instead of `execute_code`. Both paths route through the Hermes sandbox — the confinement is the invariant, not the tool choice.

Automatic learning in the Hermes profile:

```bash
bun ah --profile hermes --user alice --session prefs --message "I prefer zsh for shell work"
```

Example output:

```
HERMES RESULT
-------------

Reply: This hermes demo is using the shared agent loop. I did not need any tools for: "I prefer zsh for shell work"

System Prompt Sections
  > Injected curated memory from MEMORY.md.
  > Injected learned user model from USER.md.
  > Injected generated skills and recent session recall.
  > Automatic post-turn learning can update the user model and create skill notes.

Recalled Entries
  ~ session:logs:user: search recent logs for timeout failures

User Model Updates
  + User prefers zsh for shell work.

Model Decisions
  ? No tool call required returning direct response.
```

```bash
bun ah --profile hermes --user alice --session prefs --message "What shell do I prefer?"
```

```
HERMES RESULT
-------------

Reply: You prefer zsh for shell work.

System Prompt Sections
  > Injected curated memory from MEMORY.md.
  > Injected learned user model from USER.md.
  > Injected generated skills and recent session recall.
  > Automatic post-turn learning can update the user model and create skill notes.

Recalled Entries
  ~ session:prefs:user: I prefer zsh for shell work
  ~ session:prefs:assistant: This hermes demo is using the shared agent loop. I did not need any tools for: "I prefer zsh for shell work"

Model Decisions
  ? Answering from assembled context with stored preference "zsh for shell work".
```

Command-policy contrast:

```bash
bun ah --profile openclaw --message "run command: grep timeout data/logs/demo.log"
```

Example output:

```
OPENCLAW RESULT
---------------

Reply: Command policy result for "grep timeout data/logs/demo.log":
       Policy: needs_approval
       Reason: Command is outside the OpenClaw demo allowlist.

System Prompt Sections
  > Loaded operator-authored SOUL.md identity.
  > Memory stays passive unless the user explicitly saves or searches it.
  > Command permissions use a fixed allowlist and return needs_approval otherwise.

Permission Decisions
  ! openclaw:grep timeout data/logs/demo.log -> needs_approval (Command is outside the OpenClaw demo allowlist.)

Model Decisions
  ? Dispatching run_command for "grep timeout data/logs/demo.log".
  ? Tool results detected (run_command) composing final response.
```

```bash
bun ah --profile hermes --message "run command: cat /etc/hosts"
```

Example output:

```
HERMES RESULT
-------------

Reply: Command policy result for "cat /etc/hosts":
       Policy: sandboxed
       Reason: Hermes runs this through the demo sandbox policy.
       Output:
       Operation not permitted: /etc/hosts

System Prompt Sections
  > Injected curated memory from MEMORY.md.
  > Injected learned user model from USER.md.
  > Injected generated skills and recent session recall.
  > Automatic post-turn learning can update the user model and create skill notes.

Permission Decisions
  ! hermes:cat /etc/hosts -> sandboxed (Hermes runs this through the demo sandbox policy.)

Sandbox Events
  # Synced Hermes sandbox fixtures into ./data/sandboxes/hermes.

Model Decisions
  ? Dispatching run_command for "cat /etc/hosts".
  ? Tool results detected (run_command) composing final response.
```

## What The Demo Shows

- `openclaw`: user-authored `SOUL.md`, explicit memory save/search, and a fixed allowlist that returns `needs_approval` outside the allowlist
- `hermes`: assembled context, automatic `USER.md` updates, SQLite-backed recall, simple skill notes, `execute_code`, and a workspace-restricted sandbox path
- shared anatomy: the same OpenAI adapter, the same tool loop, and the same session store

## Checks

```bash
bun run check
```
