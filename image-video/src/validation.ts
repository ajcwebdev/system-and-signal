import {
  GEMINI_IMAGE_MODELS,
  isGeminiImageModel,
  isOpenAiImageModel,
  isVeoModel,
  OPENAI_IMAGE_MODELS,
  VEO_MODELS,
} from "./models.ts"
import type { GeminiImageValidationOptions, OpenAiImageValidationOptions, ParsedSize, VeoValidationOptions } from "./types.ts"

const THINKING_LEVELS = ["minimal", "low", "medium", "high"] as const
const PERSON_GENERATION_VALUES = ["allow_all", "allow_adult", "dont_allow"] as const

export function parseSize(size: string): ParsedSize | undefined {
  const match = /^([1-9]\d*)x([1-9]\d*)$/.exec(size)
  if (!match) {
    return undefined
  }

  return {
    width: Number(match[1]),
    height: Number(match[2]),
  }
}

export function validateOpenAiImageOptions(options: OpenAiImageValidationOptions): string[] {
  const errors: string[] = []

  if (!isOpenAiImageModel(options.model)) {
    errors.push(`Unsupported OpenAI image model "${options.model}". Supported: ${Object.keys(OPENAI_IMAGE_MODELS).join(", ")}`)
    return errors
  }

  const model = OPENAI_IMAGE_MODELS[options.model]

  if (options.size && options.size !== "auto") {
    const parsed = parseSize(options.size)
    if (!parsed) {
      errors.push('--size must be "auto" or WIDTHxHEIGHT, for example 1536x1024')
    } else {
      const { width, height } = parsed
      const longEdge = Math.max(width, height)
      const shortEdge = Math.min(width, height)
      const pixels = width * height

      if (longEdge > model.maxEdge) {
        errors.push(`--size longest edge must be <= ${model.maxEdge}px for ${options.model}`)
      }
      if (width % model.edgeMultiple !== 0 || height % model.edgeMultiple !== 0) {
        errors.push(`--size width and height must both be multiples of ${model.edgeMultiple}px for ${options.model}`)
      }
      if (longEdge / shortEdge > model.maxRatio) {
        errors.push(`--size long-edge to short-edge ratio must be <= ${model.maxRatio}:1 for ${options.model}`)
      }
      if (pixels < model.minPixels || pixels > model.maxPixels) {
        errors.push(`--size total pixels must be between ${model.minPixels} and ${model.maxPixels} for ${options.model}`)
      }
    }
  }

  if (options.quality && !includesReadonly(model.qualities, options.quality)) {
    errors.push(`--quality must be one of: ${model.qualities.join(", ")}`)
  }

  if (options.format && !includesReadonly(model.formats, options.format)) {
    errors.push(`--format must be one of: ${model.formats.join(", ")}`)
  }

  if (options.compression !== undefined) {
    if (!Number.isInteger(options.compression) || options.compression < 0 || options.compression > 100) {
      errors.push("--compression must be an integer from 0 to 100")
    }

    const format = options.format ?? "png"
    if (format === "png") {
      errors.push("--compression is only valid with --format jpeg or --format webp")
    }
  }

  if (options.background && !includesReadonly(model.backgrounds, options.background)) {
    errors.push(`--background must be one of: ${model.backgrounds.join(", ")}. ${options.model} does not support transparent backgrounds.`)
  }

  if (options.moderation && !includesReadonly(model.moderation, options.moderation)) {
    errors.push(`--moderation must be one of: ${model.moderation.join(", ")}`)
  }

  return errors
}

export function validateGeminiImageOptions(options: GeminiImageValidationOptions): string[] {
  const errors: string[] = []

  if (!isGeminiImageModel(options.model)) {
    errors.push(`Unsupported Gemini image model "${options.model}". Supported: ${Object.keys(GEMINI_IMAGE_MODELS).join(", ")}`)
    return errors
  }

  const model = GEMINI_IMAGE_MODELS[options.model]

  if (options.aspect && !includesReadonly(model.aspectRatios, options.aspect)) {
    errors.push(`--aspect must be one of: ${model.aspectRatios.join(", ")} for ${options.model}`)
  }

  if (options.resolution && !includesReadonly(model.resolutions, options.resolution)) {
    errors.push(`--resolution must be one of: ${model.resolutions.join(", ")} for ${options.model}`)
  }

  if (options.thinkingLevel) {
    const normalized = options.thinkingLevel.toLowerCase()
    if (!includesReadonly(THINKING_LEVELS, normalized)) {
      errors.push(`--thinking-level must be one of: ${THINKING_LEVELS.join(", ")}`)
    }
  }

  if (options.imageCount !== undefined && options.imageCount < 0) {
    errors.push("image count cannot be negative")
  }

  return errors
}

export function validateVeoOptions(options: VeoValidationOptions): string[] {
  const errors: string[] = []

  if (!isVeoModel(options.model)) {
    errors.push(`Unsupported Veo model "${options.model}". Supported: ${Object.keys(VEO_MODELS).join(", ")}`)
    return errors
  }

  const model = VEO_MODELS[options.model]
  const referenceCount = options.referenceCount ?? 0
  const duration = options.duration ?? 8
  const resolution = options.resolution ?? "720p"
  const aspect = options.aspect ?? "16:9"

  if (!includesReadonly(model.aspectRatios, aspect)) {
    errors.push(`--aspect must be one of: ${model.aspectRatios.join(", ")} for ${options.model}`)
  }

  if (!includesReadonly(model.durations, duration)) {
    errors.push(`--duration must be one of: ${model.durations.join(", ")} for ${options.model}`)
  }

  if (!includesReadonly(model.resolutions, resolution)) {
    errors.push(`--resolution must be one of: ${model.resolutions.join(", ")} for ${options.model}`)
  }

  if ((resolution === "1080p" || resolution === "4k") && duration !== 8) {
    errors.push(`--resolution ${resolution} requires --duration 8 for ${options.model}`)
  }

  if (referenceCount > 0 && !model.supportsReferenceImages) {
    errors.push(`${options.model} does not support --reference images`)
  }

  if (referenceCount > model.maxReferenceImages) {
    errors.push(`--reference accepts at most ${model.maxReferenceImages} images for ${options.model}`)
  }

  if (referenceCount > 0 && duration !== 8) {
    errors.push("--reference workflows require --duration 8")
  }

  if (referenceCount > 0 && options.hasImage) {
    errors.push("--reference workflows cannot be combined with --image")
  }

  if (options.personGeneration) {
    if (!includesReadonly(PERSON_GENERATION_VALUES, options.personGeneration)) {
      errors.push(`--person-generation must be one of: ${PERSON_GENERATION_VALUES.join(", ")}`)
    } else {
      const visualInput = Boolean(options.hasImage || referenceCount > 0)
      if (visualInput && options.personGeneration !== "allow_adult") {
        errors.push("--person-generation must be allow_adult for image-to-video and reference-image Veo 3.1 workflows")
      }

      if (!visualInput && options.personGeneration !== "allow_all") {
        errors.push("--person-generation must be allow_all for text-to-video Veo 3.1 workflows")
      }
    }
  }

  if (options.seed !== undefined && (!Number.isInteger(options.seed) || options.seed < 0)) {
    errors.push("--seed must be a non-negative integer")
  }

  if (options.pollInterval !== undefined && (!Number.isInteger(options.pollInterval) || options.pollInterval < 1)) {
    errors.push("--poll-interval must be a positive integer number of seconds")
  }

  return errors
}

export function assertValid(errors: string[]): void {
  if (errors.length > 0) {
    throw new Error(errors.map((error) => `- ${error}`).join("\n"))
  }
}

function includesReadonly<T extends string | number>(values: readonly T[], value: string | number): value is T {
  return values.includes(value as T)
}
