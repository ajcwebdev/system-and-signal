import { AgentAuthClient } from "@auth/agent"
import { l } from "./log"

export const AGENT_AUTH_SERVER = "http://localhost:3000"

type DemoAgentClientOptions = {
  hostName: string
  approvalPrefix?: string
  verboseApproval?: boolean
}

export function createDemoAgentClient({
  hostName,
  approvalPrefix = "│  ",
  verboseApproval = false,
}: DemoAgentClientOptions) {
  return new AgentAuthClient({
    allowDirectDiscovery: true,
    hostName,
    onApprovalRequired: (approval) => {
      l(`${approvalPrefix}🔐 Approval required: ${approval.method}`)
      if (!approval.user_code) {
        return
      }

      if (verboseApproval) {
        l(`${approvalPrefix}   User code: ${approval.user_code}`)
        l(`${approvalPrefix}   Verification URL: ${approval.verification_uri}`)
      }

      l(`${approvalPrefix}   (auto-approving in background...)`)
    },
  })
}

export function step(label: string) {
  l(`\n┌─ ${label}`)
}

export function result(data: unknown) {
  l(`│  ${JSON.stringify(data, null, 2).replace(/\n/g, "\n│  ")}`)
}

export function done() {
  l(`└─ ✓`)
}
