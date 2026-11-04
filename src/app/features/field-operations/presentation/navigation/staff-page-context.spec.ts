import { convertToParamMap } from "@angular/router"
import { describe, expect, it } from "vitest"
import {
  staffPageContext,
  staffPagingParams,
  staffRouteId,
  staffReturnFilters,
  staffReturnState
} from "./staff-page-context"

const owner = { userId: 19, sessionDeadline: 2000000000000 }

describe("Staff navigation control context", () => {
  it("round-trips effective paging rather than an initial requested size", () => {
    expect(staffPageContext(convertToParamMap({ page: "2", size: "5" }))).toEqual({
      offset: 10,
      limit: 5
    })
    expect(staffPagingParams({ offset: 10, limit: 5 })).toEqual({ page: 2, size: 5 })
  })
  it.each([
    {},
    { page: "2" },
    { size: "5" },
    { page: ["1", "2"], size: "5" },
    { page: "1", size: ["5", "10"] },
    { page: "-1", size: "5" },
    { page: "1.5", size: "5" },
    { page: "1", size: "0" },
    { page: "2147483648", size: "1" },
    { page: "2147483647", size: "2147483647" }
  ])("defaults a missing, duplicate, invalid or unsafe pair: %j", params => {
    expect(staffPageContext(convertToParamMap(params))).toEqual({ offset: 0, limit: 20 })
  })
  it("parses only positive decimal int32 record IDs", () => {
    expect(staffRouteId("27")).toBe(27)
    expect(staffRouteId("00027")).toBe(27)
    expect(staffRouteId("2147483647")).toBe(2147483647)
  })
  it.each([null, "", "0", "-1", "+1", "1.0", "1e2", " 1", "x", "2147483648"])(
    "rejects ID %j before a consumer read",
    value => {
      expect(staffRouteId(value)).toBeNull()
    }
  )
  it("round-trips trimmed controls and false status only for the same public identity/deadline", () => {
    const state = staffReturnState({ search: "  DOC-7  ", isActive: false }, owner)
    expect(staffReturnFilters(state, owner)).toEqual({ search: "DOC-7", isActive: false })
    expect(state).toEqual({
      staffReturn: { userId: 19, sessionDeadline: 2000000000000, search: "DOC-7", isActive: false }
    })
    expect(staffReturnFilters(state, { ...owner, userId: 20 })).toEqual({})
    expect(staffReturnFilters(state, { ...owner, sessionDeadline: 2000000000001 })).toEqual({})
    expect(staffReturnFilters(state, null)).toEqual({})
  })
  it("keeps blank/all controls empty, true explicit, and invalid owners unserialized", () => {
    expect(staffReturnFilters(staffReturnState({}, owner), owner)).toEqual({})
    expect(staffReturnFilters(staffReturnState({ isActive: true }, owner), owner)).toEqual({
      isActive: true
    })
    expect(staffReturnState({}, null)).toBeUndefined()
    expect(staffReturnState({}, { ...owner, userId: 0 })).toBeUndefined()
    expect(staffReturnState({}, { ...owner, sessionDeadline: 0 })).toBeUndefined()
    for (const query of [
      { offset: -1, limit: 5 },
      { offset: 1, limit: 5 },
      { offset: 0, limit: 0 },
      { offset: NaN, limit: 5 }
    ])
      expect(staffPagingParams(query)).toEqual({ page: 0, size: 20 })
  })
  it.each([
    undefined,
    null,
    [],
    {},
    { staffReturn: null },
    { staffReturn: { ...owner, search: 1, isActive: null } },
    { staffReturn: { ...owner, search: "", isActive: "false" } }
  ])("ignores malformed return state %j", state => {
    expect(staffReturnFilters(state, owner)).toEqual({})
  })
})
