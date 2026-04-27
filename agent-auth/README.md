# Agent Auth Protocol — Hands-On Evaluation

A working proof-of-concept comparing **shared API keys** (the status quo) against the **Agent Auth Protocol** (per-agent identity, scoped capabilities, independent revocation).

Built with [Better Auth](https://better-auth.com) + [`@better-auth/agent-auth`](https://www.npmjs.com/package/@better-auth/agent-auth) + [`@auth/agent`](https://www.npmjs.com/package/@auth/agent).

## Quick Start

```bash
bun install
bun run before:smoke
bun run after:scoped-transfer:smoke
```

These smoke commands exercise the shared-key baseline on `:3001` and a complete Agent Auth flow on `:3000`.

To run only the shared-key baseline:

```bash
bun run before
# in another terminal:
bun run before:read-only
bun run before:transfer-audit
```

## What It Does

### "Before" — Shared API Key (port 3001)
- Two shared-key flows use `sk_demo_shared_key`
- The Shared-Key Read-Only Flow lists accounts and checks balances
- The Shared-Key Transfer + Audit Flow transfers $500 and $50,000 — no limits
- Audit log shows identical auth for all requests
- Revoking one flow means rotating the key → breaks both

### "After" — Agent Auth Protocol (port 3000)
- **Scoped Transfer Agent** registers with `check_balance`, `transfer_domestic` (max $500 constraint)
- Each agent gets unique Ed25519 keypair + agent ID
- User approves via device authorization flow
- $1,000 transfer → `constraint_violated` (exceeds $500 max)
- Full audit: agent_id + capability + user per request

## Project Structure

```
src/
├── auth.ts             # Better Auth config + Agent Auth plugin
├── server.ts           # Main Bun.serve() server (port 3000)
├── server-smoke.ts     # Starts the auth server and prints discovery output
├── seed.ts             # Creates test user alice@demo.bank
├── before/
│   ├── api.ts          # Traditional API key server (port 3001)
│   ├── smoke.ts        # Starts the before server and fetches /accounts once
│   └── scenario.ts     # Shared-key flow runners for read-only and transfer/audit
├── after/
│   ├── scoped-transfer-agent.ts  # Full lifecycle with a constrained transfer grant
│   └── scoped-transfer-smoke.ts  # Starts the auth server and runs the scoped transfer flow
├── helpers/
│   ├── after-demo.ts   # Shared Agent SDK client + output helpers
│   ├── auto-approve.ts # Polling auto-approver for non-interactive demos
│   ├── before-client.ts # Shared-key request helper for the before flows
│   ├── demo-approval.ts # Demo-only DB approval shortcut for pending agents
│   ├── demo-bank.ts    # Shared sample banking data + transfer helpers
│   ├── device-page.ts  # Device authorization approval HTML
│   ├── log.ts          # Thin console logging wrapper
│   └── wait-for-server.ts # Shared server readiness polling
```

## Scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Start auth server with HMR |
| `bun run server:smoke` | Start the auth server and print the discovery document |
| `bun run before` | Start traditional API server |
| `bun run before:read-only` | Run the shared-key read-only flow against the before server |
| `bun run before:transfer-audit` | Run the shared-key transfer + audit flow and dump the audit log |
| `bun run before:smoke` | Start the before server and fetch `/accounts` |
| `bun run after:scoped-transfer` | Run the Scoped Transfer Agent demo |
| `bun run after:scoped-transfer:smoke` | Seed the auth DB if needed, start the auth server, run the Scoped Transfer Agent demo, then shut down cleanly |
| `bun run seed` | Create test user |

## Banking Capabilities

| Capability | Description | Constrainable Fields |
|------------|-------------|---------------------|
| `check_balance` | Check account balance | `account_id` |
| `transfer_domestic` | Domestic wire transfer | `amount`, `currency`, `destination_account` |

## Onboarding Assessment

| Aspect | Rating | Notes |
|--------|--------|-------|
| Server setup | Easy | 1 plugin, ~30 lines of config |
| Client SDK | Clean | `AgentAuthClient` handles keypairs, JWT signing, polling |
| CLI | Good | `auth-agent discover/connect/execute/disconnect` + MCP server mode |
| Approval UX | Manual | Device authorization needs user URL + code. No built-in UI |
| Spec completeness | Solid | Discovery, registration, execution, constraints, introspection, revocation all work |

## Key Findings

**Value provided:**
- Per-agent identity solves the "who did what" audit problem completely
- Constraint enforcement (max amount, allowed currencies) is protocol-native, not app-layer
- Independent revocation is a major upgrade over shared credentials
- Discovery (`/.well-known/agent-configuration`) eliminates hardcoded endpoint documentation

**Friction points:**
- Device authorization requires user interaction (by design, but slows automated testing)
- `mode: "autonomous"` requires a `resolveAutonomousUser` handler (not obvious from docs)
- The approval endpoint expects `approval_id`, not just `user_code` — required a workaround for testing

## Requirements

- [Bun](https://bun.sh) >= 1.1
