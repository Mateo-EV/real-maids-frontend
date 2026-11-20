import { convertToParamMap } from "@angular/router"
import type { PaginationParams } from "@/app/shared/pagination/pagination.params"
import { describe, expect, it } from "vitest"
import {
  portalFirstPage,
  portalMaxPageSize,
  portalPageContext,
  portalPagingParams,
  portalRouteId
} from "./portal-paging"

/**
 * The portal has exactly one paging contract. Every portal list, row link and return link reads and
 * writes page context through this module, so its whole fallback matrix is asserted once, here.
 */

// Public navigation contract only; no route, store or HTTP implementation is installed here.
describe("portal paging: page/size URL context", () => {
  it("interprets page as a zero-based index and maps it to the read offset", () => {
    expect(portalPageContext(convertToParamMap({ page: "2", size: "5" }))).toEqual({
      offset: 10,
      limit: 5
    })
    expect(portalPageContext(convertToParamMap({ page: "0", size: "5" }))).toEqual({
      offset: 0,
      limit: 5
    })
  })

  it("accepts decimal leading zeros", () => {
    expect(portalPageContext(convertToParamMap({ page: "0002", size: "0010" }))).toEqual({
      offset: 20,
      limit: 10
    })
  })

  it("accepts the documented maximum size and never clamps it", () => {
    expect(portalPageContext(convertToParamMap({ page: "1", size: "100" }))).toEqual({
      offset: 100,
      limit: 100
    })
  })

  it.each([
    {},
    { page: "2" },
    { size: "5" },
    { page: ["1", "2"], size: "5" },
    { page: "2", size: ["5", "5"] }
  ])("falls back to the whole first page for missing, incomplete or duplicate context %j", p => {
    expect(portalPageContext(convertToParamMap(p))).toEqual({ offset: 0, limit: 20 })
  })

  it.each([
    { page: "", size: "5" },
    { page: "-1", size: "5" },
    { page: "+1", size: "5" },
    { page: "1.5", size: "5" },
    { page: "1e2", size: "5" },
    { page: "0x10", size: "5" },
    { page: " 1", size: "5" },
    { page: "1 ", size: "5" },
    { page: "abc", size: "5" },
    { page: "2", size: "" },
    { page: "2", size: "5\n" },
    { page: "2", size: "0" },
    { page: "2", size: "-5" },
    { page: "2", size: "5.5" },
    { page: "2", size: "one" }
  ])("falls back to the whole first page for malformed, fractional or nonpositive %j", p => {
    expect(portalPageContext(convertToParamMap(p))).toEqual({ offset: 0, limit: 20 })
  })

  it.each([
    { page: "2147483648", size: "1" },
    { page: "1", size: "2147483648" },
    { page: "9007199254740992", size: "5" },
    { page: "1", size: "9007199254740992" }
  ])("falls back to the whole first page for out-of-int32 values %j", p => {
    expect(portalPageContext(convertToParamMap(p))).toEqual({ offset: 0, limit: 20 })
  })

  it.each([
    { page: "1", size: "101" },
    { page: "0", size: "101" },
    { page: "3", size: "1000" },
    { page: "0", size: "2147483647" }
  ])("refuses a size above the documented maximum instead of dispatching it %j", p => {
    const context = portalPageContext(convertToParamMap(p))
    expect(context).toEqual({ offset: 0, limit: 20 })
    // Never a clamped size: the pair falls back as a whole.
    expect(context.limit).toBeLessThanOrEqual(portalMaxPageSize)
    expect(context).not.toEqual({ offset: 0, limit: portalMaxPageSize })
  })

  it("returns a fresh object so no consumer can rewrite the documented first page", () => {
    const first = portalPageContext(convertToParamMap({}))
    const second = portalPageContext(convertToParamMap({ page: "-1", size: "5" }))
    expect(first).toEqual(portalFirstPage)
    expect(second).toEqual(portalFirstPage)
    expect(first).not.toBe(portalFirstPage)
    expect(second).not.toBe(first)
  })
})

describe("portal paging: link serialization", () => {
  it("serializes the effective metadata rather than the stale requested size", () => {
    const requested: PaginationParams = { offset: 20, limit: 10 }
    const returned: Required<PaginationParams> = { offset: 10, limit: 5 }
    const link = portalPagingParams(returned)
    expect(link).toEqual({ page: 2, size: 5 })
    expect(link).not.toEqual({ page: 2, size: requested.limit })
  })

  it("keeps the documented defaults for absent optional fields", () => {
    expect(portalPagingParams({})).toEqual({ page: 0, size: 20 })
    expect(portalPagingParams({ offset: 40 })).toEqual({ page: 2, size: 20 })
    expect(portalPagingParams({ limit: 5 })).toEqual({ page: 0, size: 5 })
  })

  it.each([
    { offset: 1, limit: 5 },
    { offset: -5, limit: 5 },
    { offset: 2.5, limit: 5 },
    { offset: Number.NaN, limit: 5 },
    { offset: Number.POSITIVE_INFINITY, limit: 5 },
    { offset: 9007199254740992, limit: 1 },
    { offset: 2147483648, limit: 1 },
    { offset: 10, limit: 0 },
    { offset: 10, limit: -5 },
    { offset: 10, limit: 2.5 },
    { offset: 10, limit: Number.NaN },
    { offset: 200, limit: 101 },
    { offset: 0, limit: 2147483647 }
  ])("never emits an unaligned, invalid or out-of-contract pair %j", context => {
    expect(portalPagingParams(context)).toEqual({ page: 0, size: 20 })
  })

  it("emits only numeric page/size even when a structurally wider caller supplies extra controls", () => {
    const wider: PaginationParams & { search: string; estado: string } = {
      offset: 10,
      limit: 5,
      search: "",
      estado: "registrada"
    }
    const params = portalPagingParams(wider)
    expect(params).toEqual({ page: 2, size: 5 })
    expect(Object.keys(params).sort()).toEqual(["page", "size"])
    expect(typeof params.page).toBe("number")
    expect(typeof params.size).toBe("number")
  })
})

describe("portal paging: round trip list, link and return", () => {
  it("reads back exactly the effective page a row link carries", () => {
    const effective: Required<PaginationParams> = { offset: 10, limit: 5 }
    const rowLink = portalPagingParams(effective)
    expect(portalPageContext(convertToParamMap(rowLink))).toEqual(effective)
    expect(portalPagingParams(portalPageContext(convertToParamMap(rowLink)))).toEqual(rowLink)
  })

  it("lands on the documented first page from a link the module would refuse to emit", () => {
    // Both sides agree on the same refusal, so a hand-edited URL cannot dispatch an out-of-contract read.
    const refused = portalPagingParams({ offset: 101, limit: 101 })
    expect(refused).toEqual({ page: 0, size: 20 })
    expect(portalPageContext(convertToParamMap(refused))).toEqual(portalFirstPage)
    expect(portalPageContext(convertToParamMap({ page: "1", size: "101" }))).toEqual(
      portalFirstPage
    )
  })
})

describe("portal paging: route ids", () => {
  it("accepts positive decimal int32 ids including leading zeros and the boundary", () => {
    expect(portalRouteId(convertToParamMap({ id: "1" }))).toBe(1)
    expect(portalRouteId(convertToParamMap({ id: "27" }))).toBe(27)
    expect(portalRouteId(convertToParamMap({ id: "00027" }))).toBe(27)
    expect(portalRouteId(convertToParamMap({ id: "2147483647" }))).toBe(2147483647)
  })

  it.each([
    null,
    "",
    "0",
    "000",
    "-1",
    "+1",
    "1.0",
    "1.5",
    "1e2",
    "0x10",
    " 1",
    "1 ",
    "1\n",
    "x",
    "2147483648",
    "9007199254740992"
  ])("returns null for the invalid id %j so no page dispatches a read", value => {
    expect(portalRouteId(convertToParamMap(value === null ? {} : { id: value }))).toBeNull()
  })

  it("returns null for a missing or duplicated id", () => {
    expect(portalRouteId(convertToParamMap({}))).toBeNull()
    expect(portalRouteId(convertToParamMap({ id: ["7", "8"] }))).toBeNull()
  })
})
