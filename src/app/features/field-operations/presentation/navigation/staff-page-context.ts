import type { ParamMap } from "@angular/router"
import type { FieldStaffQuery } from "../../domain/params/field-operations.params"

// Navigation controls only: this is not authorization or a server session identifier.
export interface StaffNavigationOwner {
  readonly userId: number | null
  readonly sessionDeadline: number
}
const maxId = 2147483647
const defaultPaging = () => ({ offset: 0, limit: 20 })
const positiveId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= maxId
const decimal = (value: string | null, zero: boolean) => {
  if (value === null || !/^\d+$/.test(value)) return null
  const number = Number(value)
  return Number.isSafeInteger(number) && number >= (zero ? 0 : 1) && number <= maxId ? number : null
}

export function staffPageContext(params: ParamMap) {
  if (params.getAll("page").length !== 1 || params.getAll("size").length !== 1)
    return defaultPaging()
  const page = decimal(params.get("page"), true),
    size = decimal(params.get("size"), false)
  return page !== null && size !== null && Number.isSafeInteger(page * size)
    ? { offset: page * size, limit: size }
    : defaultPaging()
}

export function staffPagingParams(query: FieldStaffQuery) {
  const offset = query.offset ?? 0,
    limit = query.limit ?? 20
  return Number.isSafeInteger(offset) &&
    offset >= 0 &&
    positiveId(limit) &&
    offset % limit === 0 &&
    offset / limit <= maxId
    ? { page: offset / limit, size: limit }
    : { page: 0, size: 20 }
}

export const staffRouteId = (value: string | null): number | null => decimal(value, false)

function validOwner(
  owner: StaffNavigationOwner | null
): owner is StaffNavigationOwner & { userId: number } {
  return (
    !!owner &&
    positiveId(owner.userId) &&
    Number.isSafeInteger(owner.sessionDeadline) &&
    owner.sessionDeadline > 0
  )
}
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

export function staffReturnState(query: FieldStaffQuery, owner: StaffNavigationOwner | null) {
  const search = query.search ?? "",
    isActive = query.isActive ?? null
  if (
    !validOwner(owner) ||
    typeof search !== "string" ||
    (isActive !== null && typeof isActive !== "boolean")
  )
    return undefined
  return {
    staffReturn: {
      userId: owner.userId,
      sessionDeadline: owner.sessionDeadline,
      search: search.trim(),
      isActive
    }
  }
}

export function staffReturnFilters(
  state: unknown,
  owner: StaffNavigationOwner | null
): Pick<FieldStaffQuery, "search" | "isActive"> {
  if (!validOwner(owner)) return {}
  const controls = record(record(state)?.["staffReturn"])
  if (
    !controls ||
    controls["userId"] !== owner.userId ||
    controls["sessionDeadline"] !== owner.sessionDeadline ||
    typeof controls["search"] !== "string" ||
    (controls["isActive"] !== null && typeof controls["isActive"] !== "boolean")
  )
    return {}
  const search = controls["search"].trim(),
    isActive = controls["isActive"]
  return { ...(search ? { search } : {}), ...(typeof isActive === "boolean" ? { isActive } : {}) }
}
