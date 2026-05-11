import type { GEMINI_IMAGE_MODELS, OPENAI_IMAGE_MODELS, VEO_MODELS } from "./models.ts"

export type Provider = "openai" | "gemini"
export type OpenAiImageModel = keyof typeof OPENAI_IMAGE_MODELS
export type GeminiImageModel = keyof typeof GEMINI_IMAGE_MODELS
export type VeoModel = keyof typeof VEO_MODELS

export type FlagValue = boolean | string | string[]

export type ParsedArgs = {
  command?: string
  flags: Record<string, FlagValue>
  positionals: string[]
}

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

export type VeoImageData = {
  bytesBase64Encoded: string
  mimeType: string
}

export type OpenAiImageRequest = {
  apiKey: string
  endpoint: "generations" | "edits"
  model: string
  prompt: string
  out: string
  size?: string
  quality?: string
  format?: string
  compression?: number
  background?: string
  moderation?: string
  images?: string[]
}

export type GeminiImageRequest = {
  apiKey: string
  model: string
  prompt: string
  out: string
  aspect?: string
  resolution?: string
  images?: string[]
  thinkingLevel?: string
  includeThoughts?: boolean
}

export type VeoRequest = {
  apiKey: string
  model: string
  prompt: string
  out: string
  image?: string
  references: string[]
  aspect?: string
  resolution?: string
  duration?: number
  personGeneration?: string
  seed?: number
  pollIntervalSeconds: number
}

export type OpenAiImageResponse = {
  data?: Array<{
    b64_json?: string
    revised_prompt?: string
  }>
}

export type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
        thought?: boolean
        inlineData?: {
          mimeType?: string
          data?: string
        }
        inline_data?: {
          mime_type?: string
          data?: string
        }
      }>
    }
  }>
}

export type GeminiOperation = {
  name?: string
  done?: boolean
  error?: {
    code?: number
    message?: string
    status?: string
  }
  response?: {
    generateVideoResponse?: {
      generatedSamples?: Array<{
        video?: {
          uri?: string
          bytesBase64Encoded?: string
        }
      }>
    }
    generatedVideos?: Array<{
      video?: {
        uri?: string
        videoBytes?: string
      }
    }>
  }
}

export type OpenAiImageValidationOptions = {
  model: string
  size?: string
  quality?: string
  format?: string
  compression?: number
  background?: string
  moderation?: string
}

export type GeminiImageValidationOptions = {
  model: string
  aspect?: string
  resolution?: string
  thinkingLevel?: string
  includeThoughts?: boolean
  imageCount?: number
}

export type VeoValidationOptions = {
  model: string
  aspect?: string
  resolution?: string
  duration?: number
  personGeneration?: string
  seed?: number
  pollInterval?: number
  hasImage?: boolean
  referenceCount?: number
}

export type ParsedSize = {
  width: number
  height: number
}
