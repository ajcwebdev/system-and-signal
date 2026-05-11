import { describe, expect, test } from "bun:test"

import { validateGeminiImageOptions, validateOpenAiImageOptions, validateVeoOptions } from "../src/validation.ts"

describe("OpenAI gpt-image-2 validation", () => {
  test("accepts flexible valid dimensions", () => {
    expect(
      validateOpenAiImageOptions({
        model: "gpt-image-2",
        size: "2048x1152",
        quality: "high",
        format: "jpeg",
        compression: 80,
        background: "opaque",
        moderation: "auto",
      }),
    ).toEqual([])
  })

  test("rejects invalid dimensions and transparent backgrounds", () => {
    const errors = validateOpenAiImageOptions({
      model: "gpt-image-2",
      size: "4096x1024",
      background: "transparent",
    })

    expect(errors.join("\n")).toContain("longest edge")
    expect(errors.join("\n")).toContain("transparent backgrounds")
  })

  test("requires compression to target jpeg or webp", () => {
    expect(
      validateOpenAiImageOptions({
        model: "gpt-image-2",
        compression: 50,
      }).join("\n"),
    ).toContain("jpeg or --format webp")
  })
})

describe("Gemini image validation", () => {
  test("accepts Flash-specific 512 output and wide aspect ratios", () => {
    expect(
      validateGeminiImageOptions({
        model: "gemini-3.1-flash-image-preview",
        aspect: "1:8",
        resolution: "512",
        thinkingLevel: "high",
      }),
    ).toEqual([])
  })

  test("rejects unsupported Gemini image models", () => {
    const errors = validateGeminiImageOptions({
      model: "gemini-image-legacy",
      aspect: "1:8",
      resolution: "512",
      thinkingLevel: "minimal",
    })

    expect(errors.join("\n")).toContain("Unsupported Gemini image model")
    expect(errors.join("\n")).toContain("gemini-3.1-flash-image-preview")
  })
})

describe("Veo 3.1 validation", () => {
  test("accepts image-to-video at 720p and 6 seconds", () => {
    expect(
      validateVeoOptions({
        model: "veo-3.1-generate-preview",
        hasImage: true,
        aspect: "16:9",
        resolution: "720p",
        duration: 6,
        personGeneration: "allow_adult",
      }),
    ).toEqual([])
  })

  test("requires 8 seconds for 1080p and 4k", () => {
    expect(
      validateVeoOptions({
        model: "veo-3.1-generate-preview",
        resolution: "4k",
        duration: 6,
      }).join("\n"),
    ).toContain("requires --duration 8")
  })

  test("limits reference images to supported models and three assets", () => {
    expect(
      validateVeoOptions({
        model: "veo-3.1-generate-preview",
        referenceCount: 4,
      }).join("\n"),
    ).toContain("at most 3")

    expect(
      validateVeoOptions({
        model: "veo-3.1-lite-generate-preview",
        referenceCount: 1,
      }).join("\n"),
    ).toContain("does not support --reference")
  })
})
