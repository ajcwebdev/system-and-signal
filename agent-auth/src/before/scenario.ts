import { err, l } from "../helpers/log"
import { beforeJson, transferBefore } from "../helpers/before-client"
import { BEFORE_BASE } from "./shared"

type Account = { name: string }
type AccountsResponse = { accounts?: Account[] }
type BalanceResponse = { balance: number, currency: string }
type AuditEntry = {
  time: string
  method: string
  path: string
  auth: string
  result: string
}
type AuditLogResponse = { log: AuditEntry[] }

export async function runSharedKeyReadOnlyFlow(base = BEFORE_BASE) {
  l("Shared-Key Read-Only Flow → GET /accounts")
  const accounts = await beforeJson<AccountsResponse>("/accounts", {}, base)
  l(
    `  Accounts: ${JSON.stringify(accounts.accounts?.map((account) => account.name))}`,
  )

  l("Shared-Key Read-Only Flow → GET /balance/acc_001")
  const balance = await beforeJson<BalanceResponse>("/balance/acc_001", {}, base)
  l(`  Balance: $${balance.balance} ${balance.currency}`)
  l(
    "  This flow is intended to be read-only, but the same key could also call /transfer.\n",
  )
}

export async function runSharedKeyTransferAuditFlow(base = BEFORE_BASE) {
  l("Shared-Key Transfer + Audit Flow → POST /transfer $500 to acc_002")
  const smallTransfer = await transferBefore(500, "acc_002", base)
  l(`  Transfer: ${smallTransfer.transfer_id} — ${smallTransfer.status}`)

  l("Shared-Key Transfer + Audit Flow → POST /transfer $50,000 to acc_003")
  const largeTransfer = await transferBefore(50_000, "acc_003", base)
  l(`  Transfer: ${largeTransfer.transfer_id} — ${largeTransfer.status}`)

  l("\n📋 Audit Log")
  const auditLog = await beforeJson<AuditLogResponse>("/audit-log", {}, base)
  for (const entry of auditLog.log) {
    l(
      `  ${entry.time} | ${entry.method} ${entry.path} | auth=${entry.auth} | ${entry.result}`,
    )
  }

  l("\n⚠ The read-only flow and transfer flow are indistinguishable in the audit log.")
  l(
    "⚠ The $50,000 transfer succeeds because the shared key has no per-agent limits.",
  )
  l("⚠ Revoking the transfer flow would require rotating the same key the read-only flow uses.\n")
}

export async function runSharedKeyScenario(base = BEFORE_BASE) {
  l("\n━━━ BEFORE — Shared API Key ━━━\n")
  l("The shared-key read-only flow and transfer flow use the same bearer token.")
  l("The server cannot scope or identify those flows separately.\n")

  await runSharedKeyReadOnlyFlow(base)
  await runSharedKeyTransferAuditFlow(base)
}

function usage() {
  err("Usage: bun run src/before/scenario.ts <read-only|transfer-audit|all>")
}

if (import.meta.main) {
  const mode = Bun.argv[2]
  let runner: (() => Promise<void>) | null = null

  if (mode === "read-only") {
    runner = () => runSharedKeyReadOnlyFlow()
  } else if (mode === "transfer-audit") {
    runner = () => runSharedKeyTransferAuditFlow()
  } else if (mode === "all") {
    runner = () => runSharedKeyScenario()
  }

  if (!runner) {
    usage()
    process.exit(1)
  }

  runner().catch((error) => {
    err("Fatal error:", error)
    process.exit(1)
  })
}
