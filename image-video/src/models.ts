export const OPENAI_IMAGE_MODELS = {
  "gpt-image-2": {
    label: "GPT Image 2",
    provider: "openai",
    qualities: ["low", "medium", "high", "auto"],
    formats: ["png", "jpeg", "webp"],
    backgrounds: ["auto", "opaque"],
    moderation: ["auto", "low"],
    maxEdge: 3840,
    minPixels: 655_360,
    maxPixels: 8_294_400,
    edgeMultiple: 16,
    maxRatio: 3,
    notes: [
      "size may be auto or WIDTHxHEIGHT",
      "both edges must be multiples of 16",
      "transparent backgrounds are not supported",
      "image inputs are high fidelity by default",
    ],
  },
} as const

export const GEMINI_IMAGE_MODELS = {
  "gemini-3.1-flash-image-preview": {
    label: "Gemini 3.1 Flash Image Preview",
    provider: "gemini",
    resolutions: ["512", "1K", "2K", "4K"],
    aspectRatios: ["1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9"],
    supportsThinking: true,
    notes: [
      "best default for high-volume Gemini image generation",
      "512, 1K, 2K, and 4K output sizes",
    ],
  },
} as const

export const VEO_MODELS = {
  "veo-3.1-generate-preview": {
    label: "Veo 3.1 Preview",
    provider: "gemini",
    aspectRatios: ["16:9", "9:16"],
    durations: [4, 6, 8],
    resolutions: ["720p", "1080p", "4k"],
    supportsReferenceImages: true,
    maxReferenceImages: 3,
    supportsExtension: true,
    extensionResolutions: ["720p"],
    notes: [
      "supports text-to-video, image-to-video, interpolation, reference images, and extension",
      "1080p and 4k require 8 second duration",
      "extension output is 720p",
    ],
  },
  "veo-3.1-fast-generate-preview": {
    label: "Veo 3.1 Fast Preview",
    provider: "gemini",
    aspectRatios: ["16:9", "9:16"],
    durations: [4, 6, 8],
    resolutions: ["720p", "1080p", "4k"],
    supportsReferenceImages: true,
    maxReferenceImages: 3,
    supportsExtension: true,
    extensionResolutions: ["720p"],
    notes: [
      "faster, lower-cost Veo 3.1 variant",
      "supports the same high-level input flows as Veo 3.1 Preview",
      "1080p and 4k require 8 second duration",
    ],
  },
  "veo-3.1-lite-generate-preview": {
    label: "Veo 3.1 Lite Preview",
    provider: "gemini",
    aspectRatios: ["16:9", "9:16"],
    durations: [4, 6, 8],
    resolutions: ["720p", "1080p"],
    supportsReferenceImages: false,
    maxReferenceImages: 0,
    supportsExtension: false,
    extensionResolutions: [],
    notes: [
      "supports text-to-video and image-to-video",
      "does not support reference images or extension",
      "1080p requires 8 second duration",
    ],
  },
} as const

export type Provider = "openai" | "gemini"
export type OpenAiImageModel = keyof typeof OPENAI_IMAGE_MODELS
export type GeminiImageModel = keyof typeof GEMINI_IMAGE_MODELS
export type VeoModel = keyof typeof VEO_MODELS

export const DEFAULT_OPENAI_IMAGE_MODEL: OpenAiImageModel = "gpt-image-2"
export const DEFAULT_GEMINI_IMAGE_MODEL: GeminiImageModel = "gemini-3.1-flash-image-preview"
export const DEFAULT_VEO_MODEL: VeoModel = "veo-3.1-generate-preview"

export function isOpenAiImageModel(model: string): model is OpenAiImageModel {
  return model in OPENAI_IMAGE_MODELS
}

export function isGeminiImageModel(model: string): model is GeminiImageModel {
  return model in GEMINI_IMAGE_MODELS
}

export function isVeoModel(model: string): model is VeoModel {
  return model in VEO_MODELS
}
