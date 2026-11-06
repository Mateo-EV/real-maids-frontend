import { convertToParamMap } from "@angular/router"
import { describe, expect, it } from "vitest"
import {
  serviceOrderPageContext,
  serviceOrderPagingParams,
  serviceOrderRouteId
} from "./service-order-page-context"

// T6B [S1, S3, S4]: public numeric navigation rules, independent of order read state.
describe("Service order page/size URL context", () => {
  it("uses zero-based page and positive size without silently clamping sizes above 100", () => {
    expect(serviceOrderPageContext(convertToParamMap({ page: "0", size: "5" }))).toEqual({
      offset: 0,
      limit: 5
    })
    expect(serviceOrderPageContext(convertToParamMap({ page: "0002", size: "00101" }))).toEqual({
      offset: 202,
      limit: 101
    })
  })

  it("accepts int32 wire boundaries and safe derived offsets beyond int32", () => {
    expect(serviceOrderPageContext(convertToParamMap({ page: "2147483647", size: "2" }))).toEqual({
      offset: 4294967294,
      limit: 2
    })
    expect(serviceOrderPageContext(convertToParamMap({ page: "0", size: "2147483647" }))).toEqual({
      offset: 0,
      limit: 2147483647
    })
  })

  it.each([
    {},
    { page: "2" },
    { size: "5" },
    { page: ["2", "2"], size: "5" },
    { page: "2", size: ["5", "10"] },
    { page: "", size: "5" },
    { page: "-1", size: "5" },
    { page: "+1", size: "5" },
    { page: "1.5", size: "5" },
    { page: "1e2", size: "5" },
    { page: " 1", size: "5" },
    { page: "1", size: "5\n" },
    { page: "1", size: "0" },
    { page: "1", size: "invalid" },
    { page: "2147483648", size: "1" },
    { page: "0", size: "2147483648" },
    { page: "9007199254740992", size: "1" },
    { page: "2147483647", size: "2147483647" }
  ])("defaults BOTH fields to 0/20 for absent, malformed, duplicate or unsafe pair %j", params => {
    expect(serviceOrderPageContext(convertToParamMap(params))).toEqual({ offset: 0, limit: 20 })
  })
})

describe("Service order effective paging links and explicit return", () => {
  it("round-trips actual effective metadata rather than the initial requested size", () => {
    // A requested offset 20/limit 10 can return effective offset 10/limit 5.
    const effective = { offset: 10, limit: 5 }
    const link = serviceOrderPagingParams(effective)
    expect(link).toEqual({ page: 2, size: 5 })
    const returned = serviceOrderPageContext(convertToParamMap(link))
    expect(returned).toEqual(effective)
    expect(serviceOrderPagingParams(returned)).toEqual(link)
    expect(effective).toEqual({ offset: 10, limit: 5 })
  })

  it("defaults optional offset/limit independently before serialization", () => {
    expect(serviceOrderPagingParams({})).toEqual({ page: 0, size: 20 })
    expect(serviceOrderPagingParams({ offset: 40 })).toEqual({ page: 2, size: 20 })
    expect(serviceOrderPagingParams({ limit: 5 })).toEqual({ page: 0, size: 5 })
  })

  it("preserves valid wire boundaries and sizes above 100", () => {
    expect(serviceOrderPagingParams({ offset: 202, limit: 101 })).toEqual({ page: 2, size: 101 })
    expect(serviceOrderPagingParams({ offset: 4294967294, limit: 2 })).toEqual({
      page: 2147483647,
      size: 2
    })
    expect(serviceOrderPagingParams({ offset: 0, limit: 2147483647 })).toEqual({
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
  ])("defaults BOTH link fields for unaligned, unsafe or invalid metadata %j", context => {
    expect(serviceOrderPagingParams(context)).toEqual({ page: 0, size: 20 })
  })

  it("ignores wider caller controls and emits only numeric page/size", () => {
    const context = {
      offset: 10,
      limit: 5,
      search: "sample search",
      customerId: 7,
      staffId: 9,
      status: "PENDIENTE",
      from: "2026-01-01",
      role: "sample role",
      sessionDeadline: 2000000000000
    }
    const link = serviceOrderPagingParams(context)
    expect(link).toEqual({ page: 2, size: 5 })
    expect(Object.keys(link).sort()).toEqual(["page", "size"])
    expect(typeof link.page).toBe("number")
    expect(typeof link.size).toBe("number")
    expect(serviceOrderPageContext(convertToParamMap({ ...context, ...link }))).toEqual({
      offset: 10,
      limit: 5
    })
  })
})

describe("Service order route ID independent of paging", () => {
  it.each(["1", "00027", "2147483647"])("accepts positive decimal int32 ID %j", id => {
    expect(serviceOrderRouteId(convertToParamMap({ id }))).toBe(Number(id))
  })

  it.each(["", "0", "-1", "+1", "1.0", "1e2", "0x10", " 1", "1\n", "x", "2147483648"])(
    "rejects invalid route ID %j before consumer dispatch",
    id => {
      expect(serviceOrderRouteId(convertToParamMap({ id }))).toBeNull()
    }
  )

  it("does not infer an order ID from customer, staff or paging controls", () => {
    expect(
      serviceOrderRouteId(
        convertToParamMap({ customerId: "7", staffId: "9", page: "1", size: "5" })
      )
    ).toBeNull()
  })

  it("validates ID and numeric return context independently", () => {
    const validId = convertToParamMap({ id: "27", page: "invalid", size: "5" })
    expect(serviceOrderRouteId(validId)).toBe(27)
    expect(serviceOrderPageContext(validId)).toEqual({ offset: 0, limit: 20 })
    const invalidId = convertToParamMap({ id: "-1", page: "2", size: "5" })
    expect(serviceOrderRouteId(invalidId)).toBeNull()
    expect(serviceOrderPageContext(invalidId)).toEqual({ offset: 10, limit: 5 })
  })
})
