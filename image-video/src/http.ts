export async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, init)
  const text = await response.text()

  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${url} failed with ${response.status}: ${text.slice(0, 1500)}`)
  }

  if (text.length === 0) {
    return {}
  }

  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    throw new Error(`Expected JSON from ${url}, received: ${text.slice(0, 500)}`)
  }
}

export async function fetchBinary(url: string, init: RequestInit): Promise<Uint8Array> {
  const response = await fetch(url, init)

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`${init.method ?? "GET"} ${url} failed with ${response.status}: ${text.slice(0, 1500)}`)
  }

  return new Uint8Array(await response.arrayBuffer())
}
