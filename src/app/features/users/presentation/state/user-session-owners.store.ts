import { computed, Signal } from "@angular/core"
import { UserSessionOwnerQuery } from "../../domain/models/user-session-owner-query"
import { UserSessionOwner } from "../../domain/models/user-session-owner"
import { UserSessionError } from "../../domain/errors/user-session.error"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"

export interface SessionOwnersEntry {
  readonly query: UserSessionOwnerQuery
  readonly result?: PaginationResponse<UserSessionOwner>
  readonly loading: boolean
  readonly loaded: boolean
  readonly refreshing?: boolean
  readonly expiresAt?: number
  readonly error?: UserSessionError
}
export function normalizeOwnersQuery(query: UserSessionOwnerQuery): UserSessionOwnerQuery {
  const search = query.search?.trim()
  return {
    offset: query.offset ?? 0,
    limit: query.limit ?? 5,
    ...(search ? { search } : {}),
    ...(query.hasSessions !== undefined ? { hasSessions: query.hasSessions } : {})
  }
}
export function ownersQueryKey(query: UserSessionOwnerQuery): string {
  const q = normalizeOwnersQuery(query)
  return JSON.stringify([q.offset, q.limit, q.search ?? "", q.hasSessions ?? null])
}

/** Readonly projection only; all asynchronous state belongs to UserSessionsStore. */
export function selectSessionOwners(
  entries: Signal<Readonly<Record<string, SessionOwnersEntry>>>,
  requested: Signal<UserSessionOwnerQuery>
) {
  const entry = computed(() => entries()[ownersQueryKey(requested())])
  return {
    query: computed(() => entry()?.query ?? normalizeOwnersQuery(requested())),
    result: computed(() => entry()?.result),
    loading: computed(() => entry()?.loading ?? false),
    loaded: computed(() => entry()?.loaded ?? false),
    refreshing: computed(() => entry()?.refreshing ?? false),
    expiresAt: computed(() => entry()?.expiresAt ?? 0),
    error: computed(() => entry()?.error)
  }
}
