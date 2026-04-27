import { BEFORE_API_KEY, BEFORE_BASE } from "../before/shared"

export type BeforeTransferResponse = {
  transfer_id: string
  status: string
}

export const beforeAuthHeaders = {
  Authorization: `Bearer ${BEFORE_API_KEY}`,
}

export async function beforeJson<T>(
  path: string,
  init: RequestInit = {},
  base = BEFORE_BASE,
): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set("Authorization", beforeAuthHeaders.Authorization)
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  const response = await fetch(`${base}${path}`, { ...init, headers })
  if (!response.ok) {
    throw new Error(
      `${init.method ?? "GET"} ${path} failed: ${response.status}`,
    )
  }
  return (await response.json()) as T
}

export function transferBefore(
  amount: number,
  destinationAccount: string,
  base = BEFORE_BASE,
) {
  return beforeJson<BeforeTransferResponse>(
    "/transfer",
    {
      method: "POST",
      body: JSON.stringify({
        amount,
        currency: "USD",
        destination_account: destinationAccount,
      }),
    },
    base,
  )
}
