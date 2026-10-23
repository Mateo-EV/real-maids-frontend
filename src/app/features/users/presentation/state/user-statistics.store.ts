import { computed, Signal } from "@angular/core"
import { UserError } from "../../domain/errors/user.error"
import { UserStatistics } from "../../domain/models/user-statistics"

export interface UserStatisticsEntry {
  readonly result: UserStatistics | undefined
  readonly loading: boolean
  readonly refreshing: boolean
  readonly error: UserError | undefined
  readonly expires: number
}

/** Readonly view of root-owned statistics, not a second writable store. */
export function selectUserStatistics(entry: Signal<UserStatisticsEntry>) {
  return {
    result: computed(() => entry().result),
    loaded: computed(() => entry().result !== undefined),
    loading: computed(() => entry().loading),
    refreshing: computed(() => entry().refreshing),
    error: computed(() => entry().error),
    expires: computed(() => entry().expires)
  }
}
