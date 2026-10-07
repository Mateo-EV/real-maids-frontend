import { describe, expect, it } from "vitest"
import { normalizePagination, PaginationError } from "./normalize-pagination"
import { PaginationParams } from "./pagination.params"

const invalid = [null, "1", NaN, Infinity, -Infinity, 1.5, -1, Number.MAX_SAFE_INTEGER + 1]

describe("Shared offset pagination", () => {
  it("defaults only omitted values", () => {
    for (const params of [undefined, {}, { offset: undefined, limit: undefined }]) {
      expect(normalizePagination(params)).toMatchObject({
        success: true,
        data: { offset: 0, limit: 20 }
      })
    }
    expect(normalizePagination({ offset: 7 })).toMatchObject({
      success: true,
      data: { offset: 7, limit: 20 }
    })
    expect(normalizePagination({ limit: 1 })).toMatchObject({
      success: true,
      data: { offset: 0, limit: 1 }
    })
  })

  it("accepts inclusive safe boundaries", () => {
    for (const limit of [1, 100]) {
      expect(normalizePagination({ offset: Number.MAX_SAFE_INTEGER, limit })).toMatchObject({
        success: true,
        data: { offset: Number.MAX_SAFE_INTEGER, limit }
      })
    }
  })

  for (const field of ["offset", "limit"] as const) {
    for (const value of [...invalid, ...(field === "limit" ? [0, 101] : [])]) {
      it(`rejects ${field}=${String(value)} with a typed Result`, () => {
        const result = normalizePagination({ [field]: value } as unknown as PaginationParams)
        expect(result.success).toBe(false)
        if (result.success) throw new Error("Expected invalid pagination")
        expect(result.error).toBeInstanceOf(PaginationError)
        expect(result.error.code).toBe("INVALID_PAGINATION")
      })
    }
  }
})
