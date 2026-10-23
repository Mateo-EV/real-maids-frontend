import { computed, Signal } from "@angular/core"
import { UserListQuery } from "../../domain/models/user-list-query"
import type { UserQueryEntry } from "./user.store"

/** Read-only projections, not a store: all asynchronous state lives in root UserStore. */
export function selectUserQuery(
  entries: Signal<Readonly<Record<string, UserQueryEntry>>>,
  requested: Signal<UserListQuery>,
  keyForQuery: (query: UserListQuery) => string
) {
  const entry = computed(() => entries()[keyForQuery(requested())])
  return {
    entry,
    query: computed(() => entry()?.query ?? requested()),
    result: computed(() => entry()?.result),
    loading: computed(() => entry()?.loading ?? false),
    refreshing: computed(() => entry()?.refreshing ?? false),
    loaded: computed(() => entry()?.result !== undefined),
    error: computed(() => entry()?.error),
    expires: computed(() => entry()?.expires ?? 0)
  }
}
