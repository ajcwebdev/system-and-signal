import { agentAuth } from "@better-auth/agent-auth"
import { Database } from "bun:sqlite"
import { betterAuth } from "better-auth"
import { l } from "./helpers/log"

const db = new Database("auth.db")
const secret =
  process.env.BETTER_AUTH_SECRET ??
  "agent-auth-demo-secret-at-least-32-chars-long"

export const auth = betterAuth({
  database: db,
  baseURL: "http://localhost:3000",
  basePath: "/api/auth",
  secret,
  trustedOrigins: ["http://localhost:3000", "http://localhost:3001"],
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    agentAuth({
      providerName: "demo-bank",
      providerDescription:
        "Demo Banking API — balances and transfers for AI agents.",
      modes: ["delegated", "autonomous"],
      allowDynamicHostRegistration: true,
      deviceAuthorizationPage: "/device",
      approvalMethods: ["device_authorization"],
      defaultHostCapabilities: ["check_balance"],
      capabilities: [
        {
          name: "check_balance",
          description: "Check the balance of a specific bank account.",
          input: {
            type: "object",
            required: ["account_id"],
            properties: {
              account_id: {
                type: "string",
                description: "The bank account ID to check",
              },
            },
          },
          output: {
            type: "object",
            properties: {
              account_id: { type: "string" },
              balance: { type: "number" },
              currency: { type: "string" },
            },
          },
        },
        {
          name: "transfer_domestic",
          description: "Transfer funds to another domestic bank account.",
          input: {
            type: "object",
            required: ["amount", "currency", "destination_account"],
            properties: {
              amount: { type: "number" },
              currency: { type: "string" },
              destination_account: { type: "string" },
            },
          },
          output: {
            type: "object",
            properties: {
              transfer_id: { type: "string" },
              status: { type: "string" },
              amount: { type: "number" },
              currency: { type: "string" },
            },
          },
        },
      ],
      async onExecute({ capability, arguments: args, agentSession }) {
        const details = args ? ` ${JSON.stringify(args)}` : ""
        l(`  ${capability} · ${agentSession?.agent?.id}${details}`)
        switch (capability) {
          case "check_balance": {
            const balances: Record<
              string,
              { balance: number, currency: string }
            > = {
              acc_001: { balance: 4280.13, currency: "USD" },
              acc_002: { balance: 12750.0, currency: "USD" },
              acc_003: { balance: 890.47, currency: "USD" },
            }
            const accountId = args?.account_id as string
            const info = balances[accountId]
            if (!info) throw new Error(`Unknown account: ${accountId}`)
            return { account_id: accountId, ...info }
          }
          case "transfer_domestic": {
            const transferId = `txn_${Date.now()}`
            return {
              transfer_id: transferId,
              status: "completed",
              amount: args?.amount,
              currency: args?.currency,
            }
          }
          default:
            throw new Error(`Unsupported capability: ${capability}`)
        }
      },
    }),
  ],
})
