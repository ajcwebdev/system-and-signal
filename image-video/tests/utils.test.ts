import { describe, expect, test } from "bun:test"

import { paint } from "../src/utils.ts"

describe("paint", () => {
  test("returns plain text when ansi colors are unavailable", () => {
    const color = Bun.color
    let args: unknown[] = []
    Reflect.set(Bun, "color", (...received: unknown[]) => {
      args = received
      return ""
    })

    try {
      expect(paint("Wrote", "success")).toBe("Wrote")
      expect(args).toEqual(["#34d399", "ansi"])
    } finally {
      Reflect.set(Bun, "color", color)
    }
  })

  test("wraps text with ansi color and reset codes", () => {
    const color = Bun.color
    Reflect.set(Bun, "color", () => "\x1b[38;2;52;211;153m")

    try {
      expect(paint("Wrote", "success")).toBe("\x1b[38;2;52;211;153mWrote\x1b[0m")
    } finally {
      Reflect.set(Bun, "color", color)
    }
  })
})
