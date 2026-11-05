import { convertToParamMap } from "@angular/router"
import type { PaginationParams } from "@/app/shared/pagination/pagination.params"
import { describe, expect, it } from "vitest"
import {
  serviceRequestPageContext,
  serviceRequestPagingParams,
  serviceRequestRouteId
} from "./service-request-page-context"

// Public navigation contracts only; no route, store or HTTP implementation is installed here.
describe("Service request route IDs", () => {
  it("accepts positive decimal int32 IDs including leading zeros and both boundaries", () => {
    expect(serviceRequestRouteId("1")).toBe(1)
    expect(serviceRequestRouteId("27")).toBe(27)
    expect(serviceRequestRouteId("00027")).toBe(27)
    expect(serviceRequestRouteId("2147483647")).toBe(2147483647)
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
  ])("returns null for invalid ID %j so consumers can skip dispatch", value => {
    expect(serviceRequestRouteId(value)).toBeNull()
  })
})

describe("Service request page/size URL context", () => {
  it("interprets page as a zero-based index, not an offset", () => {
    expect(serviceRequestPageContext(convertToParamMap({ page: "2", size: "5" }))).toEqual({
      offset: 10,
      limit: 5
    })
    expect(serviceRequestPageContext(convertToParamMap({ page: "0", size: "5" }))).toEqual({
      offset: 0,
      limit: 5
    })
  })

  it("accepts decimal leading zeros and requested sizes above 100 without clamping", () => {
    expect(serviceRequestPageContext(convertToParamMap({ page: "0002", size: "00101" }))).toEqual({
      offset: 202,
      limit: 101
    })
  })

  it("allows int32 wire boundaries and safe offsets larger than int32", () => {
    expect(serviceRequestPageContext(convertToParamMap({ page: "2147483647", size: "2" }))).toEqual(
      { offset: 4294967294, limit: 2 }
    )
    expect(serviceRequestPageContext(convertToParamMap({ page: "0", size: "2147483647" }))).toEqual(
      { offset: 0, limit: 2147483647 }
    )
  })

  it.each([
    {},
    { page: "2" },
    { size: "5" },
    { page: ["1", "2"], size: "5" },
    { page: "2", size: ["5", "5"] }
  ])("defaults BOTH fields for missing, incomplete or duplicate context %j", params => {
    expect(serviceRequestPageContext(convertToParamMap(params))).toEqual({ offset: 0, limit: 20 })
  })

  it.each([
    { page: "", size: "5" },
    { page: "-1", size: "5" },
    { page: "+1", size: "5" },
    { page: "1.5", size: "5" },
    { page: "1e2", size: "5" },
    { page: " 1", size: "5" },
    { page: "2", size: "5\n" },
    { page: "2", size: "0" },
    { page: "2", size: "-5" },
    { page: "2", size: "5.5" },
    { page: "2", size: "invalid" }
  ])("defaults BOTH fields for malformed or nonpositive context %j", params => {
    expect(serviceRequestPageContext(convertToParamMap(params))).toEqual({ offset: 0, limit: 20 })
  })

  it.each([
    { page: "2147483648", size: "1" },
    { page: "1", size: "2147483648" },
    { page: "9007199254740992", size: "5" },
    { page: "1", size: "9007199254740992" },
    { page: "2147483647", size: "2147483647" }
  ])("defaults BOTH fields for wire overflow or unsafe derived offset %j", params => {
    expect(serviceRequestPageContext(convertToParamMap(params))).toEqual({ offset: 0, limit: 20 })
  })
})

describe("Service request effective paging links and explicit return", () => {
  it("serializes actual returned metadata rather than the stale requested size, then round-trips", () => {
    // A request at 20/10 (wire page 2) can return effective 10/5.
    const requested: PaginationParams = { offset: 20, limit: 10 }
    const returned: Required<PaginationParams> = { offset: 10, limit: 5 }
    const detailLink = serviceRequestPagingParams(returned)
    expect(detailLink).toEqual({ page: 2, size: 5 })
    expect(detailLink).not.toEqual({ page: 2, size: requested.limit })
    const explicitReturn = serviceRequestPageContext(convertToParamMap(detailLink))
    expect(explicitReturn).toEqual({ offset: 10, limit: 5 })
    expect(serviceRequestPagingParams(explicitReturn)).toEqual({ page: 2, size: 5 })
    expect(returned).toEqual({ offset: 10, limit: 5 })
  })

  it("keeps default optional fields consistent with the Operations read contract", () => {
    expect(serviceRequestPagingParams({})).toEqual({ page: 0, size: 20 })
    expect(serviceRequestPagingParams({ offset: 40 })).toEqual({ page: 2, size: 20 })
    expect(serviceRequestPagingParams({ limit: 5 })).toEqual({ page: 0, size: 5 })
  })

  it("serializes valid int32 wire boundaries without imposing a size-100 maximum", () => {
    expect(serviceRequestPagingParams({ offset: 202, limit: 101 })).toEqual({ page: 2, size: 101 })
    expect(serviceRequestPagingParams({ offset: 4294967294, limit: 2 })).toEqual({
      page: 2147483647,
      size: 2
    })
    expect(serviceRequestPagingParams({ offset: 0, limit: 2147483647 })).toEqual({
      page: 0,
      size: 2147483647
    })
  })

  it.each([
    { offset: 1, limit: 5 },
    { offset: -5, limit: 5 },
    { offset: 2.5, limit: 5 },
    { offset: NaN, limit: 5 },
    { offset: Infinity, limit: 5 },
    { offset: 9007199254740992, limit: 1 },
    { offset: 2147483648, limit: 1 },
    { offset: 10, limit: 0 },
    { offset: 10, limit: -5 },
    { offset: 10, limit: 2.5 },
    { offset: 10, limit: NaN },
    { offset: 0, limit: 2147483648 }
  ])("defaults BOTH link fields for unaligned, invalid or unsafe context %j", context => {
    // Integer page/size input is inherently aligned; alignment is checked at offset serialization.
    expect(serviceRequestPagingParams(context)).toEqual({ page: 0, size: 20 })
  })

  it("emits only numeric page/size even when a structurally wider caller supplies extra controls", () => {
    const context = { offset: 10, limit: 5, search: "", status: "registrada" }
    const params = serviceRequestPagingParams(context)
    expect(params).toEqual({ page: 2, size: 5 })
    expect(Object.keys(params).sort()).toEqual(["page", "size"])
    expect(typeof params.page).toBe("number")
    expect(typeof params.size).toBe("number")
  })
})
