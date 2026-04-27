// "After" scenario: Scoped transfer agent using the SDK
// Demonstrates: Discovery → Register → Scoped grants → Execute → Constraints → Status → Revoke

import { startAutoApprover } from "../helpers/auto-approve"
import {
  AGENT_AUTH_SERVER,
  createDemoAgentClient,
  done,
  result,
  step,
} from "../helpers/after-demo"
import { err, l } from "../helpers/log"

async function main() {
  l("━━━ AFTER: Scoped Transfer Agent — Full Agent Auth Lifecycle (SDK) ━━━\n")

  // Start auto-approver so device authorization flows complete automatically
  const approver = startAutoApprover(1500)
  l("(Auto-approver running in background)\n")

  const client = createDemoAgentClient({
    hostName: "demo-macbook",
    verboseApproval: true,
  })

  // ── Step 1: Discovery ──
  step("1. Discover provider")
  const provider = await client.discoverProvider(AGENT_AUTH_SERVER)
  l(`│  Provider: ${provider.provider_name}`)
  l(`│  Description: ${provider.description}`)
  l(`│  Modes: ${provider.modes?.join(", ")}`)
  l(`│  Approval: ${provider.approval_methods?.join(", ")}`)
  done()

  // ── Step 2: List capabilities ──
  step("2. List capabilities (before connecting)")
  const caps = await client.listCapabilities({ provider: provider.issuer! })
  for (const cap of caps.capabilities) {
    l(`│  • ${cap.name} — ${cap.description}`)
  }
  done()

  // ── Step 3: Connect agent with scoped constraints ──
  step("3. Connect scoped transfer agent (delegated, with constraints)")
  l(`│  Requesting: check_balance, transfer_domestic (max $500)`)
  const agent = await client.connectAgent({
    provider: provider.issuer!,
    name: "Scoped Transfer Agent",
    mode: "delegated",
    capabilities: [
      "check_balance",
      {
        name: "transfer_domestic",
        constraints: {
          amount: { max: 500 },
          currency: { in: ["USD"] },
        },
      },
    ],
    reason: "User wants a scoped agent for balance checks and small domestic transfers",
  })
  l(`│  Agent ID: ${agent.agentId}`)
  l(`│  Host ID: ${agent.hostId}`)
  l(`│  Status: ${agent.status}`)
  l(`│  Grants:`)
  for (const g of agent.capabilityGrants) {
    const constraintInfo = g.constraints
      ? ` [constraints: ${JSON.stringify(g.constraints)}]`
      : ""
    l(`│    • ${g.capability}: ${g.status}${constraintInfo}`)
  }
  done()

  // ── Step 4: Execute check_balance ──
  step("4. Execute: check_balance (acc_001)")
  const balance = await client.executeCapability({
    agentId: agent.agentId,
    capability: "check_balance",
    arguments: { account_id: "acc_001" },
  })
  result(balance.data)
  done()

  // ── Step 5: Execute transfer_domestic (within constraints) ──
  step("5. Execute: transfer_domestic ($100 — within constraints)")
  const transfer = await client.executeCapability({
    agentId: agent.agentId,
    capability: "transfer_domestic",
    arguments: {
      amount: 100,
      currency: "USD",
      destination_account: "acc_002",
    },
  })
  result(transfer.data)
  done()

  // ── Step 6: Execute transfer_domestic (EXCEEDS constraints) ──
  step("6. Execute: transfer_domestic ($1000 — EXCEEDS max $500 constraint)")
  try {
    const overLimit = await client.executeCapability({
      agentId: agent.agentId,
      capability: "transfer_domestic",
      arguments: {
        amount: 1000,
        currency: "USD",
        destination_account: "acc_002",
      },
    })
    l(`│  ❌ Expected constraint violation, got:`, overLimit)
  } catch (e: any) {
    l(`│  ✅ Constraint violation caught!`)
    l(`│  Error: ${e.message || JSON.stringify(e)}`)
  }
  done()

  // ── Step 7: Check agent status ──
  step("7. Check agent status")
  const status = await client.agentStatus(agent.agentId)
  l(`│  Agent: ${status.agent_id}`)
  l(`│  Status: ${status.status}`)
  l(`│  Mode: ${status.mode}`)
  l(`│  Created: ${status.created_at}`)
  l(`│  Last used: ${status.last_used_at}`)
  l(`│  Grants: ${status.agent_capability_grants?.length}`)
  done()

  // ── Step 8: Disconnect (revoke) ──
  step("8. Disconnect agent (permanent revocation)")
  await client.disconnectAgent(agent.agentId)
  l(`│  Agent ${agent.agentId} revoked and connection removed.`)
  done()

  // ── Step 9: Attempt execution after revocation ──
  step("9. Execute after revocation (should fail)")
  try {
    await client.executeCapability({
      agentId: agent.agentId,
      capability: "check_balance",
      arguments: { account_id: "acc_001" },
    })
    l(`│  ❌ Expected failure`)
  } catch (e: any) {
    l(`│  ✅ Correctly failed — agent is revoked`)
    l(`│  Error: ${e.message || JSON.stringify(e)}`)
  }
  done()

  l("\n━━━ Scoped Transfer Agent lifecycle complete ━━━\n")
  approver.stop()
  client.destroy()
}

main().catch((e) => {
  err("Fatal error:", e)
  process.exit(1)
})
