#!/usr/bin/env bun

import {
  DEFAULT_GEMINI_IMAGE_MODEL,
  DEFAULT_OPENAI_IMAGE_MODEL,
  DEFAULT_VEO_MODEL,
  GEMINI_IMAGE_MODELS,
  OPENAI_IMAGE_MODELS,
  VEO_MODELS,
} from "./models.ts"
import { runGeminiImage, runOpenAiImage, runVeo } from "./providers.ts"
import type { FlagValue, ParsedArgs, Provider } from "./types.ts"
import { err, l, paint } from "./utils.ts"
import { assertValid, validateGeminiImageOptions, validateOpenAiImageOptions, validateVeoOptions } from "./validation.ts"

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2))

  try {
    switch (parsed.command) {
      case "models":
        printModels()
        return
      case "generate":
        await generate(parsed.flags)
        return
      case "edit":
        await edit(parsed.flags)
        return
      case "video":
        await video(parsed.flags)
        return
      case "help":
      case undefined:
        printHelp()
        return
      default:
        throw new Error(`Unknown command "${parsed.command}". Run "bun iv help".`)
    }
  } catch (error) {
    err(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

async function generate(flags: Record<string, FlagValue>): Promise<void> {
  const provider = readProvider(flags, "openai")
  const prompt = requiredString(flags, "prompt")
  const out = optionalString(flags, "out") ?? defaultOut(provider)

  if (provider === "openai") {
    const model = optionalString(flags, "model") ?? DEFAULT_OPENAI_IMAGE_MODEL
    const compression = optionalInteger(flags, "compression")

    assertValid(
      validateOpenAiImageOptions({
        model,
        size: optionalString(flags, "size"),
        quality: optionalString(flags, "quality"),
        format: optionalString(flags, "format"),
        compression,
        background: optionalString(flags, "background"),
        moderation: optionalString(flags, "moderation"),
      }),
    )

    await runOpenAiImage({
      apiKey: requiredEnv("OPENAI_API_KEY"),
      endpoint: "generations",
      model,
      prompt,
      out,
      size: optionalString(flags, "size"),
      quality: optionalString(flags, "quality"),
      format: optionalString(flags, "format"),
      compression,
      background: optionalString(flags, "background"),
      moderation: optionalString(flags, "moderation"),
    })
    return
  }

  const model = optionalString(flags, "model") ?? DEFAULT_GEMINI_IMAGE_MODEL
  const images = stringList(flags, "image")
  const thinkingLevel = normalizeThinkingLevel(optionalString(flags, "thinking-level"))

  assertValid(
    validateGeminiImageOptions({
      model,
      aspect: optionalString(flags, "aspect"),
      resolution: optionalString(flags, "resolution"),
      thinkingLevel,
      includeThoughts: booleanFlag(flags, "include-thoughts"),
      imageCount: images.length,
    }),
  )

  await runGeminiImage({
    apiKey: requiredEnv("GEMINI_API_KEY"),
    model,
    prompt,
    out,
    aspect: optionalString(flags, "aspect"),
    resolution: optionalString(flags, "resolution"),
    images,
    thinkingLevel,
    includeThoughts: booleanFlag(flags, "include-thoughts"),
  })
}

async function edit(flags: Record<string, FlagValue>): Promise<void> {
  const provider = readProvider(flags, "openai")
  const prompt = requiredString(flags, "prompt")
  const out = optionalString(flags, "out") ?? defaultOut(provider)
  const images = stringList(flags, "image")

  if (images.length === 0) {
    throw new Error('edit requires at least one --image path')
  }

  if (provider === "openai") {
    const model = optionalString(flags, "model") ?? DEFAULT_OPENAI_IMAGE_MODEL
    const compression = optionalInteger(flags, "compression")

    assertValid(
      validateOpenAiImageOptions({
        model,
        size: optionalString(flags, "size"),
        quality: optionalString(flags, "quality"),
        format: optionalString(flags, "format"),
        compression,
        background: optionalString(flags, "background"),
        moderation: optionalString(flags, "moderation"),
      }),
    )

    await runOpenAiImage({
      apiKey: requiredEnv("OPENAI_API_KEY"),
      endpoint: "edits",
      model,
      prompt,
      out,
      size: optionalString(flags, "size"),
      quality: optionalString(flags, "quality"),
      format: optionalString(flags, "format"),
      compression,
      background: optionalString(flags, "background"),
      moderation: optionalString(flags, "moderation"),
      images,
      mask: optionalString(flags, "mask"),
    })
    return
  }

  const model = optionalString(flags, "model") ?? DEFAULT_GEMINI_IMAGE_MODEL
  const thinkingLevel = normalizeThinkingLevel(optionalString(flags, "thinking-level"))

  assertValid(
    validateGeminiImageOptions({
      model,
      aspect: optionalString(flags, "aspect"),
      resolution: optionalString(flags, "resolution"),
      thinkingLevel,
      includeThoughts: booleanFlag(flags, "include-thoughts"),
      imageCount: images.length,
    }),
  )

  await runGeminiImage({
    apiKey: requiredEnv("GEMINI_API_KEY"),
    model,
    prompt,
    out,
    aspect: optionalString(flags, "aspect"),
    resolution: optionalString(flags, "resolution"),
    images,
    thinkingLevel,
    includeThoughts: booleanFlag(flags, "include-thoughts"),
  })
}

async function video(flags: Record<string, FlagValue>): Promise<void> {
  const provider = readProvider(flags, "gemini")
  if (provider !== "gemini") {
    throw new Error("video currently supports --provider gemini only")
  }

  const model = optionalString(flags, "model") ?? DEFAULT_VEO_MODEL
  const prompt = requiredString(flags, "prompt")
  const out = optionalString(flags, "out") ?? "video.mp4"
  const references = stringList(flags, "reference")
  const image = optionalString(flags, "image")
  const lastFrame = optionalString(flags, "last-frame")
  const videoInput = optionalString(flags, "video")
  const duration = optionalInteger(flags, "duration")
  const seed = optionalInteger(flags, "seed")
  const pollIntervalSeconds = optionalInteger(flags, "poll-interval") ?? 10

  assertValid(
    validateVeoOptions({
      model,
      aspect: optionalString(flags, "aspect"),
      resolution: optionalString(flags, "resolution"),
      duration,
      personGeneration: optionalString(flags, "person-generation"),
      seed,
      pollInterval: pollIntervalSeconds,
      hasImage: image !== undefined,
      hasLastFrame: lastFrame !== undefined,
      referenceCount: references.length,
      hasVideo: videoInput !== undefined,
    }),
  )

  await runVeo({
    apiKey: requiredEnv("GEMINI_API_KEY"),
    model,
    prompt,
    out,
    image,
    lastFrame,
    references,
    video: videoInput,
    aspect: optionalString(flags, "aspect"),
    resolution: optionalString(flags, "resolution"),
    duration,
    personGeneration: optionalString(flags, "person-generation"),
    seed,
    pollIntervalSeconds,
  })
}

function printModels(): void {
  l(paint("OpenAI image models", "heading"))
  for (const [model, config] of Object.entries(OPENAI_IMAGE_MODELS)) {
    l(`  ${paint(model, "model")} - ${config.label}`)
    l(`    ${paint("quality", "label")}: ${config.qualities.join(", ")}`)
    l(`    ${paint("format", "label")}: ${config.formats.join(", ")}`)
    l(`    ${paint("background", "label")}: ${config.backgrounds.join(", ")}`)
    l(`    ${paint("size", "label")}: auto or WIDTHxHEIGHT; edge <= ${config.maxEdge}; pixels ${config.minPixels}-${config.maxPixels}`)
    l(`    ${paint("notes", "label")}: ${config.notes.join("; ")}`)
  }

  l("")
  l(paint("Gemini image models", "heading"))
  for (const [model, config] of Object.entries(GEMINI_IMAGE_MODELS)) {
    l(`  ${paint(model, "model")} - ${config.label}`)
    l(`    ${paint("aspect", "label")}: ${config.aspectRatios.join(", ")}`)
    l(`    ${paint("resolution", "label")}: ${config.resolutions.join(", ")}`)
    l(`    ${paint("notes", "label")}: ${config.notes.join("; ")}`)
  }

  l("")
  l(paint("Gemini Veo models", "heading"))
  for (const [model, config] of Object.entries(VEO_MODELS)) {
    l(`  ${paint(model, "model")} - ${config.label}`)
    l(`    ${paint("aspect", "label")}: ${config.aspectRatios.join(", ")}`)
    l(`    ${paint("duration", "label")}: ${config.durations.join(", ")}`)
    l(`    ${paint("resolution", "label")}: ${config.resolutions.join(", ")}`)
    l(`    ${paint("references", "label")}: ${config.supportsReferenceImages ? `up to ${config.maxReferenceImages}` : "not supported"}`)
    l(`    ${paint("extension", "label")}: ${config.supportsExtension ? `supported at ${config.extensionResolutions.join(", ")}` : "not supported"}`)
    l(`    ${paint("notes", "label")}: ${config.notes.join("; ")}`)
  }
}

function printHelp(): void {
  l(`${paint("Usage", "heading")}:
  bun iv models
  bun iv generate --provider openai --prompt "..." --out image.png [OpenAI flags]
  bun iv generate --provider gemini --prompt "..." --out image.png [Gemini flags]
  bun iv edit --provider openai --image input.png --prompt "..." --out edited.png [--mask mask.png]
  bun iv edit --provider gemini --image input.png --prompt "..." --out edited.png
  bun iv video --prompt "..." --image first.png --out clip.mp4

${paint("Shared flags", "heading")}:
  --provider openai|gemini
  --model MODEL
  --prompt TEXT
  --out PATH

${paint("OpenAI image flags", "heading")}:
  --size auto|WIDTHxHEIGHT
  --quality low|medium|high|auto
  --format png|jpeg|webp
  --compression 0-100
  --background auto|opaque
  --moderation auto|low
  --image PATH
  --mask PATH

${paint("Gemini image flags", "heading")}:
  --aspect RATIO
  --resolution 512|1K|2K|4K
  --image PATH
  --thinking-level minimal|low|medium|high
  --include-thoughts

${paint("Veo flags", "heading")}:
  --image FIRST_FRAME
  --last-frame LAST_FRAME
  --reference PATH
  --video PREVIOUS_VEO_MP4
  --aspect 16:9|9:16
  --resolution 720p|1080p|4k
  --duration 4|6|8
  --person-generation allow_all|allow_adult|dont_allow
  --seed INTEGER
  --poll-interval SECONDS`)
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv
  const flags: Record<string, FlagValue> = {}
  const positionals: string[] = []

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]
    if (!token) {
      continue
    }

    if (!token.startsWith("--")) {
      positionals.push(token)
      continue
    }

    const key = token.slice(2)
    const next = rest[index + 1]
    const value = next && !next.startsWith("--") ? next : true
    if (value !== true) {
      index += 1
    }

    const existing = flags[key]
    if (existing === undefined) {
      flags[key] = value
    } else if (Array.isArray(existing)) {
      existing.push(String(value))
    } else {
      flags[key] = [String(existing), String(value)]
    }
  }

  return {
    command,
    flags,
    positionals,
  }
}

function readProvider(flags: Record<string, FlagValue>, fallback: Provider): Provider {
  const provider = optionalString(flags, "provider") ?? fallback
  if (provider !== "openai" && provider !== "gemini") {
    throw new Error('--provider must be "openai" or "gemini"')
  }

  return provider
}

function requiredString(flags: Record<string, FlagValue>, key: string): string {
  const value = optionalString(flags, key)
  if (!value) {
    throw new Error(`Missing required --${key}`)
  }

  return value
}

function optionalString(flags: Record<string, FlagValue>, key: string): string | undefined {
  const value = flags[key]
  if (value === undefined || value === false) {
    return undefined
  }
  if (Array.isArray(value)) {
    return value.at(-1)
  }
  if (value === true) {
    return "true"
  }

  return value
}

function stringList(flags: Record<string, FlagValue>, key: string): string[] {
  const value = flags[key]
  if (value === undefined || value === false) {
    return []
  }
  if (Array.isArray(value)) {
    return value
  }
  if (value === true) {
    throw new Error(`--${key} requires a value`)
  }

  return [value]
}

function booleanFlag(flags: Record<string, FlagValue>, key: string): boolean {
  const value = flags[key]
  if (value === undefined || value === false) {
    return false
  }
  if (value === true) {
    return true
  }
  return value === "true"
}

function optionalInteger(flags: Record<string, FlagValue>, key: string): number | undefined {
  const value = optionalString(flags, key)
  if (value === undefined) {
    return undefined
  }

  const parsed = Number(value)
  if (!Number.isInteger(parsed)) {
    throw new Error(`--${key} must be an integer`)
  }

  return parsed
}

function normalizeThinkingLevel(level: string | undefined): string | undefined {
  return level?.toLowerCase()
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.example to .env and set ${name}.`)
  }

  return value
}

function defaultOut(provider: Provider): string {
  return provider === "openai" ? "openai-image.png" : "gemini-image.png"
}

await main()
