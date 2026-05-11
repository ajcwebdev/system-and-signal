import { mkdir } from "node:fs/promises"
import { basename, dirname, extname } from "node:path"

import type { InlineData, RestInlineData, VeoImageData, VeoVideoData } from "./types.ts"

const RESET = "\x1b[0m"

const LOG_COLORS = {
  heading: "#7dd3fc",
  model: "#c084fc",
  label: "#fbbf24",
  success: "#34d399",
  info: "#60a5fa",
  pending: "#f59e0b",
  error: "#f87171",
  muted: "#94a3b8",
} as const

export type LogTone = keyof typeof LOG_COLORS

export function paint(text: string, tone: LogTone): string {
  const code = Bun.color(LOG_COLORS[tone], "ansi")
  if (!code) {
    return text
  }

  return `${code}${text}${RESET}`
}

export function l(...args: unknown[]): void {
  console.log(...args)
}

export function err(...args: unknown[]): void {
  console.error(...args.map((arg) => (typeof arg === "string" ? paint(arg, "error") : arg)))
}

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

export async function readBinary(path: string): Promise<Uint8Array> {
  return new Uint8Array(await Bun.file(path).arrayBuffer())
}

export async function writeBase64(path: string, base64: string): Promise<void> {
  await writeBytes(path, Buffer.from(base64, "base64"))
}

export async function writeBytes(path: string, bytes: Uint8Array): Promise<void> {
  await ensureParentDirectory(path)
  await Bun.write(path, bytes)
}

export async function readInlineData(path: string): Promise<InlineData> {
  const data = Buffer.from(await readBinary(path)).toString("base64")
  return {
    inlineData: {
      mimeType: mimeTypeForPath(path),
      data,
    },
  }
}

export async function readRestInlineData(path: string): Promise<RestInlineData> {
  const data = Buffer.from(await readBinary(path)).toString("base64")
  return {
    inline_data: {
      mime_type: mimeTypeForPath(path),
      data,
    },
  }
}

export async function readVeoImageData(path: string): Promise<VeoImageData> {
  return {
    bytesBase64Encoded: Buffer.from(await readBinary(path)).toString("base64"),
    mimeType: mimeTypeForPath(path),
  }
}

export async function readVeoVideoData(path: string): Promise<VeoVideoData> {
  if (isUri(path)) {
    return { uri: path }
  }

  return {
    bytesBase64Encoded: Buffer.from(await readBinary(path)).toString("base64"),
    mimeType: mimeTypeForPath(path),
  }
}

export async function fileForFormData(path: string): Promise<File> {
  return new File([await readBinary(path)], basename(path), {
    type: mimeTypeForPath(path),
  })
}

export function mimeTypeForPath(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".png":
      return "image/png"
    case ".jpg":
    case ".jpeg":
      return "image/jpeg"
    case ".webp":
      return "image/webp"
    case ".gif":
      return "image/gif"
    case ".mp4":
      return "video/mp4"
    case ".mov":
      return "video/quicktime"
    case ".webm":
      return "video/webm"
    default:
      return "application/octet-stream"
  }
}

function isUri(value: string): boolean {
  return /^(https?:\/\/|gs:\/\/|files\/)/.test(value)
}

async function ensureParentDirectory(path: string): Promise<void> {
  const parent = dirname(path)
  if (parent !== ".") {
    await mkdir(parent, { recursive: true })
  }
}
