import { l } from "./log"

type WaitForServerOptions = {
  url: string
  label: string
  timeout?: number
  headers?: RequestInit["headers"]
  onReady?: (label: string) => void
}

export async function waitForServer({
  url,
  label,
  timeout = 5000,
  headers,
  onReady,
}: WaitForServerOptions) {
  const start = Date.now()

  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url, { headers })
      if (response.ok) {
        if (onReady) {
          onReady(label)
        } else {
          l(`✓ ${label} is up`)
        }
        return
      }
    } catch {}

    await Bun.sleep(200)
  }

  throw new Error(`${label} failed to start within ${timeout}ms`)
}
