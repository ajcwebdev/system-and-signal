import { Database } from "bun:sqlite"

type AliceRow = { id: string }
type PendingAgentRow = { id: string, hostId: string }

export function approvePendingAgents() {
  const sqliteDb = new Database("auth.db")

  try {
    const alice = sqliteDb
      .query("SELECT id FROM user WHERE email = 'alice@demo.bank'")
      .get() as AliceRow | null

    if (!alice) {
      throw new Error("Alice not found")
    }

    const pendingAgents = sqliteDb
      .query("SELECT id, hostId FROM agent WHERE status = 'pending'")
      .all() as PendingAgentRow[]

    const approved: string[] = []
    const now = new Date().toISOString()

    for (const agent of pendingAgents) {
      sqliteDb
        .query(
          "UPDATE agent SET status = 'active', userId = ?, activatedAt = ?, updatedAt = ? WHERE id = ?",
        )
        .run(alice.id, now, now, agent.id)

      sqliteDb
        .query(
          "UPDATE agentHost SET status = 'active', userId = ?, activatedAt = ?, updatedAt = ? WHERE id = ?",
        )
        .run(alice.id, now, now, agent.hostId)

      sqliteDb
        .query(
          "UPDATE agentCapabilityGrant SET status = 'active', grantedBy = ?, updatedAt = ? WHERE agentId = ? AND status = 'pending'",
        )
        .run(alice.id, now, agent.id)

      sqliteDb
        .query(
          "UPDATE approvalRequest SET status = 'approved', updatedAt = ? WHERE agentId = ? AND status = 'pending'",
        )
        .run(now, agent.id)

      approved.push(agent.id)
    }

    return { approved, count: approved.length }
  } finally {
    sqliteDb.close()
  }
}
