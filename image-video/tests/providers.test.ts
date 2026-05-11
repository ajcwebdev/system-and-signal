import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, test } from "bun:test"

import { buildVeoInstance, buildVeoParameters } from "../src/providers.ts"

describe("buildVeoInstance", () => {
  test("uses Veo bytesBase64Encoded payloads for image inputs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "image-video-"))
    const firstFrame = join(dir, "first.png")
    const lastFrame = join(dir, "last.png")
    const reference = join(dir, "reference.jpg")

    await writeFile(firstFrame, new Uint8Array([1, 2, 3]))
    await writeFile(lastFrame, new Uint8Array([4, 5, 6]))
    await writeFile(reference, new Uint8Array([7, 8, 9]))

    const instance = await buildVeoInstance({
      apiKey: "key",
      model: "veo-3.1-generate-preview",
      prompt: "animate",
      out: "out.mp4",
      image: firstFrame,
      lastFrame,
      references: [reference],
      pollIntervalSeconds: 1,
    })

    expect(instance).toEqual({
      prompt: "animate",
      image: {
        bytesBase64Encoded: Buffer.from([1, 2, 3]).toString("base64"),
        mimeType: "image/png",
      },
      lastFrame: {
        bytesBase64Encoded: Buffer.from([4, 5, 6]).toString("base64"),
        mimeType: "image/png",
      },
      referenceImages: [
        {
          image: {
            bytesBase64Encoded: Buffer.from([7, 8, 9]).toString("base64"),
            mimeType: "image/jpeg",
          },
          referenceType: "asset",
        },
      ],
    })
    expect(JSON.stringify(instance)).not.toContain("inlineData")
    expect(JSON.stringify(instance)).not.toContain("imageBytes")
  })

  test("uses Veo bytesBase64Encoded payloads for local extension input", async () => {
    const dir = await mkdtemp(join(tmpdir(), "image-video-"))
    const video = join(dir, "clip.mp4")

    await writeFile(video, new Uint8Array([10, 11, 12]))

    const instance = await buildVeoInstance({
      apiKey: "key",
      model: "veo-3.1-generate-preview",
      prompt: "extend",
      out: "out.mp4",
      references: [],
      video,
      pollIntervalSeconds: 1,
    })

    expect(instance).toEqual({
      prompt: "extend",
      video: {
        bytesBase64Encoded: Buffer.from([10, 11, 12]).toString("base64"),
        mimeType: "video/mp4",
      },
    })
    expect(JSON.stringify(instance)).not.toContain("inlineData")
    expect(JSON.stringify(instance)).not.toContain("videoBytes")
  })

  test("uses URI payloads for Veo extension URIs", async () => {
    const uri = "https://generativelanguage.googleapis.com/v1beta/files/abc123:download?alt=media"

    const instance = await buildVeoInstance({
      apiKey: "key",
      model: "veo-3.1-generate-preview",
      prompt: "extend",
      out: "out.mp4",
      references: [],
      video: uri,
      pollIntervalSeconds: 1,
    })

    expect(instance).toEqual({
      prompt: "extend",
      video: { uri },
    })
  })
})

describe("buildVeoParameters", () => {
  test("omits SDK-only video count fields from REST parameters", () => {
    const parameters = buildVeoParameters({
      apiKey: "key",
      model: "veo-3.1-generate-preview",
      prompt: "animate",
      out: "out.mp4",
      references: [],
      aspect: "16:9",
      resolution: "720p",
      duration: 6,
      personGeneration: "allow_adult",
      seed: 123,
      pollIntervalSeconds: 1,
    })

    expect(parameters).toEqual({
      aspectRatio: "16:9",
      resolution: "720p",
      durationSeconds: 6,
      personGeneration: "allow_adult",
      seed: 123,
    })
    expect(parameters).not.toHaveProperty("numberOfVideos")
    expect(parameters).not.toHaveProperty("sampleCount")
  })
})
