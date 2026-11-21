import { convertToParamMap } from "@angular/router"
import type {
  NormalizedPagination,
  PaginationParams
} from "@/app/shared/pagination/pagination.params"
import { describe, expect, it } from "vitest"
import {
  staffServicesFirstPage,
  staffServiceRouteId,
  staffServicesMaxPageSize,
  staffServicesPageContext,
  staffServicesPagingParams
} from "./staff-services-paging"

/**
 * WP11 T3 / S4 — the staff experience has exactly one paging contract, and this module is it: the
 * list reads its entry page here, every row link and the detail's return link serialize their
 * effective page here, so the round trip cannot drift. Its whole fallback matrix is asserted once.
 *
 * Public navigation contract only: no route, store or HTTP implementation is installed.
 */
describe("staff services paging: entry context", () => {
  it("reads page as a zero-based index and maps it to the read offset", () => {
    expect(staffServicesPageContext(convertToParamMap({ page: "2", size: "5" }))).toEqual({
      offset: 10,
      limit: 5
    })
    expect(staffServicesPageContext(convertToParamMap({ page: "0", size: "20" }))).toEqual({
      offset: 0,
      limit: 20
    })
  })

  it("accepts the documented maximum size and never clamps it", () => {
    expect(staffServicesPageContext(convertToParamMap({ page: "1", size: "100" }))).toEqual({
      offset: 100,
      limit: 100
    })
  })

  it.each([{}, { page: "2" }, { size: "5" }, { page: ["1", "2"], size: "5" }])(
    "falls back to the whole first page for missing, incomplete or duplicate context %j",
    params => {
      expect(staffServicesPageContext(convertToParamMap(params))).toEqual(staffServicesFirstPage)
    }
  )

  it.each([
    { page: "", size: "5" },
    { page: "-1", size: "5" },
    { page: "1.5", size: "5" },
    { page: "1e2", size: "5" },
    { page: " 1", size: "5" },
    { page: "2", size: "0" },
    { page: "2", size: "5.5" },
    { page: "2147483648", size: "1" },
    { page: "1", size: "9007199254740992" }
  ])("falls back to the whole first page for malformed or invalid numbers %j", params => {
    expect(staffServicesPageContext(convertToParamMap(params))).toEqual(staffServicesFirstPage)
  })

  it.each([
    { page: "1", size: "101" },
    { page: "3", size: "1000" },
    { page: "0", size: "2147483647" }
  ])("refuses a size above the documented maximum instead of clamping it %j", params => {
    const context = staffServicesPageContext(convertToParamMap(params))
    // Never a clamped size: the pair falls back as a whole.
    expect(context).toEqual(staffServicesFirstPage)
    expect(context).not.toEqual({ offset: 0, limit: staffServicesMaxPageSize })
  })

  it("returns a fresh object so no consumer can rewrite the documented first page", () => {
    const first = staffServicesPageContext(convertToParamMap({}))
    expect(first).toEqual(staffServicesFirstPage)
    expect(first).not.toBe(staffServicesFirstPage)
  })
})

describe("staff services paging: link serialization", () => {
  it("serializes the effective metadata rather than the requested size", () => {
    const returned: Required<PaginationParams> = { offset: 10, limit: 5 }
    expect(staffServicesPagingParams(returned)).toEqual({ page: 2, size: 5 })
  })

  it("keeps the documented defaults for absent optional fields", () => {
    expect(staffServicesPagingParams({})).toEqual({ page: 0, size: 20 })
    expect(staffServicesPagingParams({ offset: 40 })).toEqual({ page: 2, size: 20 })
  })

  it.each([
    { offset: 1, limit: 5 },
    { offset: -5, limit: 5 },
    { offset: 2.5, limit: 5 },
    { offset: 10, limit: 0 },
    { offset: 200, limit: 101 },
    { offset: 0, limit: 2147483647 }
  ])("never emits an unaligned or out-of-contract pair %j", context => {
    expect(staffServicesPagingParams(context)).toEqual({ page: 0, size: 20 })
  })

  it("emits only numeric page/size even when a wider caller supplies extra controls", () => {
    const wider: PaginationParams & { status: string } = { offset: 10, limit: 5, status: "X" }
    const params = staffServicesPagingParams(wider)
    expect(Object.keys(params).sort()).toEqual(["page", "size"])
    expect(typeof params.page).toBe("number")
    expect(typeof params.size).toBe("number")
  })
})

describe("staff services paging: list, row link and return round trip", () => {
  it("reads back exactly the effective page a row link carries", () => {
    const effective: NormalizedPagination = { offset: 10, limit: 5 }
    const rowLink = staffServicesPagingParams(effective)
    expect(staffServicesPageContext(convertToParamMap(rowLink))).toEqual(effective)
    expect(staffServicesPagingParams(staffServicesPageContext(convertToParamMap(rowLink)))).toEqual(
      rowLink
    )
  })

  it("lands on the first page from a pair the module would refuse to emit", () => {
    expect(staffServicesPagingParams({ offset: 101, limit: 101 })).toEqual({ page: 0, size: 20 })
    expect(staffServicesPageContext(convertToParamMap({ page: "1", size: "101" }))).toEqual(
      staffServicesFirstPage
    )
  })
})

describe("staff services paging: route ids", () => {
  it("accepts positive decimal int32 ids including leading zeros and the boundary", () => {
    expect(staffServiceRouteId(convertToParamMap({ id: "17" }))).toBe(17)
    expect(staffServiceRouteId(convertToParamMap({ id: "00017" }))).toBe(17)
    expect(staffServiceRouteId(convertToParamMap({ id: "2147483647" }))).toBe(2147483647)
  })

  it.each([
    {},
    { id: "" },
    { id: "0" },
    { id: "-1" },
    { id: "1.5" },
    { id: "1e2" },
    { id: " 1" },
    { id: "abc" },
    { id: "2147483648" },
    { id: ["17", "18"] }
  ])("returns null for the invalid id %j so no page dispatches a read", params => {
    expect(staffServiceRouteId(convertToParamMap(params))).toBeNull()
  })
})
