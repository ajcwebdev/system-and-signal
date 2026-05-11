# Image And Video CLI

A Bun and TypeScript companion project for running current image and video generation APIs directly from the terminal.

The CLI intentionally uses REST requests instead of SDK wrappers so new model fields can be passed as soon as they appear in the public API.

## Install

```bash
bun install
cp .env.example .env
```

Set the keys you need:

```bash
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
```

## Commands

Show the supported provider and model matrices:

```bash
bun iv models
```

Run this first when you forget which flags belong to which model. It prints the OpenAI image options, the current Gemini image model, and the Veo video variants.

Generate with OpenAI `gpt-image-2`:

```bash
bun iv generate \
  --provider openai \
  --model gpt-image-2 \
  --prompt "A clean editorial product photo of a translucent field recorder on a steel desk" \
  --size 1536x1024 \
  --quality high \
  --format png \
  --out out/openai-recorder.png
```

This writes a PNG to `out/openai-recorder.png`. OpenAI image generation uses an explicit pixel size plus optional quality and format controls.

Generate with Gemini 3.1 Flash Image Preview:

```bash
bun iv generate \
  --provider gemini \
  --model gemini-3.1-flash-image-preview \
  --prompt "A clean editorial product photo of a translucent field recorder on a steel desk" \
  --aspect 16:9 \
  --resolution 2K \
  --out out/gemini-recorder.png
```

This writes a Nano Banana 2 image to `out/gemini-recorder.png`. Gemini image generation uses aspect ratio and resolution tiers instead of exact pixel dimensions.

Edit with OpenAI using an input image and prompt instructions:

```bash
bun iv edit \
  --provider openai \
  --image out/openai-recorder.png \
  --prompt "Replace only the display with a crisp waveform UI. Keep the desk and product unchanged." \
  --size 1536x1024 \
  --out out/openai-recorder-edit.png
```

Use the OpenAI edit path when you want the source image to anchor the result and the prompt to describe both the change and what should stay fixed.

Edit with Gemini Nano Banana 2 using one or more reference images:

```bash
bun iv edit \
  --provider gemini \
  --model gemini-3.1-flash-image-preview \
  --image out/gemini-recorder.png \
  --prompt "Keep the object and camera angle, but restyle it as a rugged field prototype with visible screws." \
  --aspect 16:9 \
  --resolution 2K \
  --thinking-level high \
  --out out/gemini-recorder-edit.png
```

Use the Gemini edit path when the image itself is the reference and the prompt describes the transformation. Repeat `--image` to provide additional references for style, object shape, material, or lighting.

Turn a still image into a Veo 3.1 video:

```bash
bun iv video \
  --model veo-3.1-generate-preview \
  --prompt "Slow dolly-in. The display wakes up with a moving waveform. Subtle room tone and a soft switch click." \
  --image out/gemini-recorder.png \
  --aspect 16:9 \
  --resolution 720p \
  --duration 6 \
  --person-generation allow_adult \
  --out out/recorder.mp4
```

The CLI starts a long-running Veo operation, polls until it completes, downloads the video, and writes the MP4 to the path in `--out`.

Interpolate between first and last frames:

```bash
bun iv video \
  --prompt "A smooth cinematic transition from packed travel kit to deployed recording setup." \
  --image frames/first.png \
  --last-frame frames/last.png \
  --duration 8 \
  --out out/interpolation.mp4
```

Use interpolation when you already know the starting and ending frame. Veo fills in the motion between them.

Use up to three reference images with Veo 3.1 or Veo 3.1 Fast:

```bash
bun iv video \
  --prompt "A short launch spot using the product silhouette, the brushed metal material, and the warm studio lighting from the references." \
  --reference refs/product.png \
  --reference refs/material.png \
  --reference refs/lighting.png \
  --duration 8 \
  --out out/reference-video.mp4
```

Use references when you want separate images to define the product, material, and visual mood for the generated clip.

Extend a previous Veo output:

```bash
bun iv video \
  --prompt "Continue the same motion as the recorder is picked up and the camera follows it toward a window." \
  --video "https://generativelanguage.googleapis.com/v1beta/files/VIDEO_ID:download?alt=media" \
  --resolution 720p \
  --duration 8 \
  --out out/recorder-extended.mp4
```

Use extension to build a sequence from a previous Veo result. Prefer the file URI from the previous Veo operation for `--video`; the new prompt should describe what happens next while preserving continuity.

## Validation

The CLI validates the model-specific configuration before making API calls:

- `gpt-image-2`: flexible `WIDTHxHEIGHT` sizes, multiple-of-16 edges, pixel limits, no transparent background, and compression only for JPEG/WebP.
- `gemini-3.1-flash-image-preview`: the latest Gemini native image model, also called Nano Banana 2, with the supported aspect-ratio matrix plus `512`, `1K`, `2K`, and `4K`.
- Veo 3.1 variants: `16:9` or `9:16`, `4`, `6`, or `8` seconds, 8 seconds for `1080p` and `4k`, reference-image limits, and extension restrictions.

## Development

```bash
bun run check
bun test
```

The test suite only checks local validation behavior. It does not call OpenAI or Gemini.
