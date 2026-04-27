import { auth } from "./auth"
import { approvePendingAgents } from "./helpers/demo-approval"
import { DEVICE_PAGE_HTML } from "./helpers/device-page"
import { l } from "./helpers/log"

const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url)

    // Discovery endpoint (must be at app root, not under basePath)
    if (url.pathname === "/.well-known/agent-configuration") {
      const config = await auth.api.getAgentConfiguration()
      return new Response(JSON.stringify(config, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600",
        },
      })
    }

    // Device authorization approval page
    if (url.pathname === "/device") {
      return new Response(DEVICE_PAGE_HTML, {
        headers: { "Content-Type": "text/html" },
      })
    }

    // Demo-only: auto-approve endpoint (bypasses device auth for testing)
    // This directly updates the database to approve pending agents.
    if (url.pathname === "/api/demo/approve-pending" && req.method === "POST") {
      try {
        return Response.json(approvePendingAgents())
      } catch (error) {
        return Response.json(
          {
            error:
              error instanceof Error ? error.message : "Approval failed",
          },
          { status: 500 },
        )
      }
    }

    // All Better Auth routes (including agent auth plugin routes)
    if (url.pathname.startsWith("/api/auth")) {
      return auth.handler(req)
    }

    return new Response("Not Found", { status: 404 })
  },
})

l(`🏦 Demo Bank server running at http://localhost:${server.port}`)
l(
  `   Discovery: http://localhost:${server.port}/.well-known/agent-configuration`,
)
l(`   Device approval: http://localhost:${server.port}/device`)
