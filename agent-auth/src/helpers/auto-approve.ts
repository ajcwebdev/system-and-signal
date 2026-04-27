// Auto-approval helper for non-interactive demos.
// Uses the demo-only /api/demo/approve-pending endpoint on the server.

import { l } from "./log"

const BASE = "http://localhost:3000"

export async function approvePending(): Promise<string[]> {
  const res = await fetch(`${BASE}/api/demo/approve-pending`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })
  const data = (await res.json()) as { approved: string[], count: number }
  if (data.count > 0) {
    if (data.count === 1) {
      l(`  Approved agent ${data.approved[0]}`)
    } else {
      l(`  Approved ${data.count} agents: ${data.approved.join(", ")}`)
    }
  }
  return data.approved
}

/** Polls for pending approvals and auto-approves them. Returns when stopped. */
export function startAutoApprover(intervalMs = 2000): { stop: () => void } {
  let running = true
  const loop = async () => {
    while (running) {
      try {
        await approvePending()
      } catch {
        // server not ready yet, ignore
      }
      await new Promise((r) => setTimeout(r, intervalMs))
    }
  }
  loop()
  return {
    stop: () => {
      running = false
    },
  }
}

// If run directly, starts an auto-approve loop
if (import.meta.main) {
  l("Auto-approve loop running")
  l("Press Ctrl+C to stop\n")
  startAutoApprover(1000)
}
