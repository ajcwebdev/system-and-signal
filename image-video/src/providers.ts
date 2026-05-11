import { basename } from "node:path"

import { DEFAULT_VEO_MODEL } from "./models.ts"
import type {
  GeminiGenerateContentResponse,
  GeminiImageRequest,
  GeminiOperation,
  OpenAiImageRequest,
  OpenAiImageResponse,
  VeoRequest,
} from "./types.ts"
import { fetchBinary, fetchJson, fileForFormData, l, readBinary, readInlineData, readRestInlineData, writeBase64, writeBytes } from "./utils.ts"

const OPENAI_BASE_URL = "https://api.openai.com/v1"
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

export async function runOpenAiImage(request: OpenAiImageRequest): Promise<void> {
  const url = `${OPENAI_BASE_URL}/images/${request.endpoint}`
  const headers = {
    Authorization: `Bearer ${request.apiKey}`,
  }

  let response: unknown
  if (request.endpoint === "generations") {
    const body = compactObject({
      model: request.model,
      prompt: request.prompt,
      size: request.size,
      quality: request.quality,
      output_format: request.format,
      output_compression: request.compression,
      background: request.background,
      moderation: request.moderation,
    })

    response = await fetchJson(url, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })
  } else {
    const formData = new FormData()
    formData.set("model", request.model)
    formData.set("prompt", request.prompt)
    appendIfDefined(formData, "size", request.size)
    appendIfDefined(formData, "quality", request.quality)
    appendIfDefined(formData, "output_format", request.format)
    appendIfDefined(formData, "background", request.background)
    appendIfDefined(formData, "moderation", request.moderation)
    if (request.compression !== undefined) {
      formData.set("output_compression", String(request.compression))
    }

    for (const image of request.images ?? []) {
      formData.append("image[]", await fileForFormData(image), basename(image))
    }

    if (request.mask) {
      formData.set("mask", await fileForFormData(request.mask), basename(request.mask))
    }

    response = await fetchJson(url, {
      method: "POST",
      headers,
      body: formData,
    })
  }

  const imageResponse = response as OpenAiImageResponse
  const base64 = imageResponse.data?.[0]?.b64_json
  if (!base64) {
    throw new Error(`OpenAI response did not include data[0].b64_json: ${JSON.stringify(response).slice(0, 1000)}`)
  }

  if (imageResponse.data?.[0]?.revised_prompt) {
    l(`Revised prompt: ${imageResponse.data[0].revised_prompt}`)
  }

  await writeBase64(request.out, base64)
  l(`Wrote ${request.out}`)
}

export async function runGeminiImage(request: GeminiImageRequest): Promise<void> {
  const url = `${GEMINI_BASE_URL}/models/${request.model}:generateContent`
  const parts: unknown[] = [{ text: request.prompt }]

  for (const image of request.images ?? []) {
    parts.push(await readRestInlineData(image))
  }

  const generationConfig = compactObject({
    responseModalities: ["TEXT", "IMAGE"],
    imageConfig:
      request.aspect || request.resolution
        ? compactObject({
            aspectRatio: request.aspect,
            imageSize: request.resolution,
          })
        : undefined,
    thinkingConfig:
      request.thinkingLevel || request.includeThoughts
        ? compactObject({
            thinkingLevel: request.thinkingLevel,
            includeThoughts: request.includeThoughts,
          })
        : undefined,
  })

  const body = compactObject({
    contents: [
      {
        role: "user",
        parts,
      },
    ],
    generationConfig,
  })

  const response = (await fetchJson(url, {
    method: "POST",
    headers: {
      "x-goog-api-key": request.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })) as GeminiGenerateContentResponse

  const partsOut = response.candidates?.[0]?.content?.parts ?? []
  const imagePart = partsOut.find((part) => part.inlineData?.data || part.inline_data?.data)
  const imageBase64 = imagePart?.inlineData?.data ?? imagePart?.inline_data?.data

  for (const part of partsOut) {
    if (part.text) {
      const label = part.thought ? "Thought summary" : "Text"
      l(`${label}: ${part.text}`)
    }
  }

  if (!imageBase64) {
    throw new Error(`Gemini response did not include an image part: ${JSON.stringify(response).slice(0, 1000)}`)
  }

  await writeBase64(request.out, imageBase64)
  l(`Wrote ${request.out}`)
}

export async function runVeo(request: VeoRequest): Promise<void> {
  const model = request.model || DEFAULT_VEO_MODEL
  const url = `${GEMINI_BASE_URL}/models/${model}:predictLongRunning`
  const instance = await buildVeoInstance(request)

  const parameters = compactObject({
    numberOfVideos: 1,
    aspectRatio: request.aspect,
    resolution: request.resolution,
    durationSeconds: request.duration,
    personGeneration: request.personGeneration,
    seed: request.seed,
  })

  const operation = (await fetchJson(url, {
    method: "POST",
    headers: {
      "x-goog-api-key": request.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      instances: [instance],
      parameters,
    }),
  })) as GeminiOperation

  if (!operation.name) {
    throw new Error(`Veo response did not include an operation name: ${JSON.stringify(operation).slice(0, 1000)}`)
  }

  l(`Started ${operation.name}`)
  const completed = await pollVeoOperation(request.apiKey, operation.name, request.pollIntervalSeconds)
  const videoBytes = await resolveVeoVideoBytes(request.apiKey, completed)
  await writeBytes(request.out, videoBytes)
  l(`Wrote ${request.out}`)
}

async function buildVeoInstance(request: VeoRequest): Promise<Record<string, unknown>> {
  const instance: Record<string, unknown> = {
    prompt: request.prompt,
  }

  if (request.image) {
    instance.image = await readInlineData(request.image)
  }

  if (request.lastFrame) {
    instance.lastFrame = await readInlineData(request.lastFrame)
  }

  if (request.references.length > 0) {
    instance.referenceImages = await Promise.all(
      request.references.map(async (reference) => ({
        image: await readInlineData(reference),
        referenceType: "asset",
      })),
    )
  }

  if (request.video) {
    instance.video = {
      inlineData: {
        mimeType: "video/mp4",
        data: Buffer.from(await readBinary(request.video)).toString("base64"),
      },
    }
  }

  return instance
}

async function pollVeoOperation(apiKey: string, operationName: string, pollIntervalSeconds: number): Promise<GeminiOperation> {
  while (true) {
    await Bun.sleep(pollIntervalSeconds * 1000)
    const operation = (await fetchJson(`${GEMINI_BASE_URL}/${operationName}`, {
      method: "GET",
      headers: {
        "x-goog-api-key": apiKey,
      },
    })) as GeminiOperation

    if (operation.error) {
      throw new Error(`Veo operation failed: ${operation.error.status ?? operation.error.code ?? "error"} ${operation.error.message ?? ""}`.trim())
    }

    if (operation.done) {
      return operation
    }

    l("Waiting for video generation to complete...")
  }
}

async function resolveVeoVideoBytes(apiKey: string, operation: GeminiOperation): Promise<Uint8Array> {
  const sample = operation.response?.generateVideoResponse?.generatedSamples?.[0]?.video
  if (sample?.bytesBase64Encoded) {
    return new Uint8Array(Buffer.from(sample.bytesBase64Encoded, "base64"))
  }

  const generatedVideo = operation.response?.generatedVideos?.[0]?.video
  if (generatedVideo?.videoBytes) {
    return new Uint8Array(Buffer.from(generatedVideo.videoBytes, "base64"))
  }

  const uri = sample?.uri ?? generatedVideo?.uri
  if (!uri) {
    throw new Error(`Veo operation did not include downloadable video data: ${JSON.stringify(operation).slice(0, 1000)}`)
  }

  return fetchBinary(uri, {
    method: "GET",
    headers: {
      "x-goog-api-key": apiKey,
    },
  })
}

function appendIfDefined(formData: FormData, key: string, value: string | undefined): void {
  if (value !== undefined) {
    formData.set(key, value)
  }
}

function compactObject<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined))
}
