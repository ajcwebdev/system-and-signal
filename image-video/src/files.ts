import { mkdir } from "node:fs/promises"
import { basename, dirname, extname } from "node:path"

export type InlineData = {
  inlineData: {
    mimeType: string
    data: string
  }
}

export type RestInlineData = {
  inline_data: {
    mime_type: string
    data: string
  }
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

async function ensureParentDirectory(path: string): Promise<void> {
  const parent = dirname(path)
  if (parent !== ".") {
    await mkdir(parent, { recursive: true })
  }
}
