// "Before" scenario: Traditional API-key-gated banking API
// Demonstrates the limitations Agent Auth solves:
// - No per-agent identity (all requests look identical)
// - No scoping (every agent gets full access)
// - No independent revocation
// - No discovery

import { l } from "../helpers/log"
import {
  createDomesticTransfer,
  findDemoBalance,
  listDemoAccounts,
} from "../helpers/demo-bank"
import { BEFORE_API_KEY as API_KEY } from "./shared"

const requestLog: Array<{
  time: string
  method: string
  path: string
  auth: string
  result: string
}> = []

function audit(method: string, path: string, auth: string, result: string) {
  const entry = {
    time: new Date().toISOString(),
    method,
    path,
    auth: auth.slice(0, 20) + "...",
    result,
  }
  requestLog.push(entry)
  l(`  ${method} ${path} | ${result}`)
}

const server = Bun.serve({
  port: 3001,
  async fetch(req) {
    const url = new URL(req.url)
    const authHeader = req.headers.get("authorization") ?? ""

    // Check API key
    if (authHeader !== `Bearer ${API_KEY}`) {
      return Response.json({ error: "unauthorized" }, { status: 401 })
    }

    if (url.pathname === "/accounts" && req.method === "GET") {
      audit("GET", "/accounts", authHeader, "ok")
      return Response.json(listDemoAccounts())
    }

    if (url.pathname.startsWith("/balance/") && req.method === "GET") {
      const id = url.pathname.split("/")[2]
      if (!id) return Response.json({ error: "not found" }, { status: 404 })
      const info = findDemoBalance(id)
      if (!info) return Response.json({ error: "not found" }, { status: 404 })
      audit("GET", url.pathname, authHeader, "ok")
      return Response.json({ account_id: id, ...info })
    }

    if (url.pathname === "/transfer" && req.method === "POST") {
      const body = (await req.json()) as any
      audit(
        "POST",
        "/transfer",
        authHeader,
        `amount=${body.amount} to=${body.destination_account}`,
      )
      return Response.json(
        createDomesticTransfer({
          amount: body.amount,
          currency: body.currency,
        }),
      )
    }

    // Audit log endpoint for comparison/debugging
    if (url.pathname === "/audit-log" && req.method === "GET") {
      return Response.json({ log: requestLog })
    }

    return Response.json({ error: "not found" }, { status: 404 })
  },
})

l(`🔑 "Before" API server running at http://localhost:${server.port}`)
l(`   API Key: ${API_KEY}`)
l(`   No agent identity. No scoping. No discovery.`)

export { requestLog, API_KEY }
