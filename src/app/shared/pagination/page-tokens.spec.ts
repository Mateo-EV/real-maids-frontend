import { describe, expect, it } from "vitest"
import { pageTokens } from "./page-tokens"

describe("pageTokens", () => {
  it.each([
    [1, [1, 2, 3, "ellipsis-end", 50]],
    [2, [1, 2, 3, "ellipsis-end", 50]],
    [3, [1, 2, 3, 4, "ellipsis-end", 50]],
    [4, [1, 2, 3, 4, 5, "ellipsis-end", 50]],
    [5, [1, "ellipsis-start", 4, 5, 6, "ellipsis-end", 50]],
    [25, [1, "ellipsis-start", 24, 25, 26, "ellipsis-end", 50]],
    [46, [1, "ellipsis-start", 45, 46, 47, "ellipsis-end", 50]],
    [47, [1, "ellipsis-start", 46, 47, 48, 49, 50]],
    [48, [1, "ellipsis-start", 47, 48, 49, 50]],
    [49, [1, "ellipsis-start", 48, 49, 50]],
    [50, [1, "ellipsis-start", 48, 49, 50]]
  ])("shows the shifted window and single gaps for page %s", (page, expected) => {
    expect(pageTokens(page as number, 50)).toEqual(expected)
  })

  it.each([1, 2, 3, 4, 5, 6, 7])("shows all %s pages in a short list", count => {
    for (let page = 1; page <= count; page++)
      expect(pageTokens(page, count)).toEqual(Array.from({ length: count }, (_, i) => i + 1))
  })

  it("keeps huge counts bounded without allocating the full list", () => {
    const count = Number.MAX_SAFE_INTEGER
    expect(pageTokens(1000000, count)).toEqual([
      1, "ellipsis-start", 999999, 1000000, 1000001, "ellipsis-end", count
    ])
  })

  it.each([
    [1, 0], [1, -1], [1, 2.5], [1, NaN], [1, Infinity], [1, Number.MAX_SAFE_INTEGER + 1],
    [0, 50], [-1, 50], [51, 50], [2.5, 50], [NaN, 50], [Infinity, 50]
  ])("returns no tokens for invalid one-based page inputs %s / %s", (page, count) => {
    expect(pageTokens(page, count)).toEqual([])
  })

  it("produces ordered unique valid pages and only multi-page gaps", () => {
    for (const count of [8, 9, 10, 50, 1000000, Number.MAX_SAFE_INTEGER]) {
      for (const current of [1, 2, 3, 4, 5, Math.ceil(count / 2), count - 4, count - 1, count]) {
        const tokens = pageTokens(current, count)
        const pages = tokens.filter((token): token is number => typeof token === "number")
        expect(tokens.length).toBeLessThanOrEqual(7)
        expect(new Set(tokens).size).toBe(tokens.length)
        expect(pages).toEqual([...pages].sort((a, b) => a - b))
        expect(pages[0]).toBe(1)
        expect(pages.at(-1)).toBe(count)
        expect(pages).toContain(current)
        expect(pages.every(page => Number.isSafeInteger(page) && page >= 1 && page <= count)).toBe(true)
        for (let i = 1; i < tokens.length - 1; i++) {
          if (typeof tokens[i] === "string")
            expect((tokens[i + 1] as number) - (tokens[i - 1] as number)).toBeGreaterThan(2)
        }
      }
    }
  })
})
