export type DemoAccount = {
  account_id: string
  name: string
  type: "checking" | "savings"
}

export type DemoBalance = {
  balance: number
  currency: string
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    account_id: "acc_001",
    name: "Primary Checking",
    type: "checking",
  },
  {
    account_id: "acc_002",
    name: "Savings",
    type: "savings",
  },
  {
    account_id: "acc_003",
    name: "Joint Checking",
    type: "checking",
  },
]

const DEMO_BALANCES: Record<string, DemoBalance> = {
  acc_001: { balance: 4280.13, currency: "USD" },
  acc_002: { balance: 12750.0, currency: "USD" },
  acc_003: { balance: 890.47, currency: "USD" },
}

export function listDemoAccounts() {
  return { accounts: DEMO_ACCOUNTS }
}

export function findDemoBalance(accountId: string) {
  return DEMO_BALANCES[accountId]
}

export function createDomesticTransfer(input: {
  amount: number
  currency: string
}) {
  return {
    transfer_id: `txn_${Date.now()}`,
    status: "completed",
    amount: input.amount,
    currency: input.currency,
  }
}
