import { computed, inject } from "@angular/core"
import { patchState, signalStore, withComputed, withMethods, withState } from "@ngrx/signals"
import { Observable } from "rxjs"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { createKeyedReads, KeyedEntry, keyedState } from "@/app/shared/state/keyed-reads"
import { ReadResourceState } from "@/app/shared/state/read-resource"
import { Result } from "@/app/shared/utils/result"
import { GetCustomerHistoryUseCase } from "../../application/use-cases/get-customer-history.use-case"
import { CustomerHistory } from "../../domain/entities/customer-history"
import { CustomerError } from "../../domain/errors/customer.error"

type HistoryRead = ReadResourceState<CustomerHistory | null, CustomerError>
interface HistoryQuery {
  readonly customerId: number
  readonly limit?: number
}
type HistoryEntry = KeyedEntry<HistoryQuery, CustomerHistory | null, CustomerError>

const HISTORY_READ_TTL_MS = 30000
/** Only the inactive part of the history is bounded: an active or in-flight owner is kept. */
const UNBOUNDED_ACTIVE_READS = Number.POSITIVE_INFINITY
const HISTORY_INACTIVE_HISTORY_LIMIT = 20

const emptyRead = (): HistoryRead => ({
  data: null,
  loaded: false,
  pendingReads: 0,
  refreshing: false,
  expires: 0,
  error: undefined
})
// Preserve non-finite inputs as distinct keys so a cache hit cannot bypass source validation.
const keyOf = (customerId: number, limit?: number) =>
  JSON.stringify([String(customerId), String(limit)])
/** The stored key is the only identity an entry keeps, so the request pair is recovered from it. */
const queryOfKey = (key: string): HistoryQuery => {
  const [customerId, limit] = JSON.parse(key) as [string, string]
  return limit === "undefined"
    ? { customerId: Number(customerId) }
    : { customerId: Number(customerId), limit: Number(limit) }
}
const ownerOfKey = (key: string) => (JSON.parse(key) as [string, string])[0]
/** One shared flight per key, whatever the number of subscribers of that flight. */
const pendingReads = (entry: HistoryEntry): number => (entry.loading || entry.refreshing ? 1 : 0)
/** An unverified key reads as an absent projection; a verified null stays distinguishable. */
const historyRead = (entry: HistoryEntry | undefined): HistoryRead =>
  entry
    ? {
        data: entry.result === undefined ? null : entry.result,
        loaded: entry.result !== undefined,
        pendingReads: pendingReads(entry),
        refreshing: entry.refreshing,
        expires: entry.expires,
        error: entry.error
      }
    : emptyRead()
const toEntries = (
  histories: Readonly<Record<string, HistoryRead>>
): Record<string, HistoryEntry> => {
  const keyed: Record<string, HistoryEntry> = {}
  for (const [key, entry] of Object.entries(histories))
    keyed[key] = {
      query: queryOfKey(key),
      result: entry.loaded ? entry.data : undefined,
      loading: !entry.loaded && (entry.pendingReads ?? 0) > 0,
      refreshing: entry.refreshing,
      error: entry.error,
      expires: entry.expires
    }
  return keyed
}
const fromEntries = (
  entries: Readonly<Record<string, HistoryEntry>>
): Record<string, HistoryRead> => {
  const histories: Record<string, HistoryRead> = {}
  for (const [key, entry] of Object.entries(entries)) histories[key] = historyRead(entry)
  return histories
}

/** Keeps the permission-aware, independently paged server projection intact. */
export const CustomerHistoryStore = signalStore(
  { providedIn: "root" },
  withState({ histories: {} as Record<string, HistoryRead> }),
  withComputed(store => ({
    loading: computed(() =>
      Object.values(store.histories()).some(value => (value.pendingReads ?? 0) > 0)
    )
  })),
  withMethods((store, getHistory = inject(GetCustomerHistoryUseCase)) => {
    const normalizeError = (error: unknown) =>
      error instanceof CustomerError ? error : new CustomerError("UNEXPECTED")
    const scope = createSessionReadScope(() => {
      histories.reset()
      patchState(store, { histories: {} })
    })
    const histories = createKeyedReads<HistoryQuery, CustomerHistory | null, CustomerError>({
      key: query => keyOf(query.customerId, query.limit),
      request: query => getHistory.execute(query.customerId, query.limit),
      state: keyedState(
        () => toEntries(store.histories()),
        next => patchState(store, { histories: fromEntries(next) })
      ),
      scope,
      ttl: HISTORY_READ_TTL_MS,
      maxEntries: UNBOUNDED_ACTIVE_READS,
      inactiveHistoryLimit: HISTORY_INACTIVE_HISTORY_LIMIT,
      normalizeError,
      overflow: () => new CustomerError("UNEXPECTED")
    })
    const selectHistory = (customerId: number, limit?: number): HistoryRead =>
      historyRead(histories.select({ customerId, limit }))
    return {
      selectHistory,
      loadHistory(
        customerId: number,
        limit?: number,
        force = false
      ): Observable<Result<CustomerHistory | null, CustomerError>> {
        return histories.read({ customerId, limit }, force)
      },
      /** Confirmed customer/property/relation changes invalidate every limit variant, not other owners. */
      invalidateCustomer(customerId: number): void {
        if (!scope.check()) return
        const generation = scope.generation()
        for (const key of histories.keys) {
          // An invalidated reader can synchronously replace the session from completion.
          if (!scope.check() || generation !== scope.generation()) return
          // Expire only: a write never refreshes the variant it touched.
          if (ownerOfKey(key) === String(customerId)) histories.invalidate(key)
        }
      }
    }
  })
)
