import { computed, inject } from "@angular/core"
import { patchState, signalStore, withComputed, withMethods, withState } from "@ngrx/signals"
import { defer, EMPTY, finalize, Observable } from "rxjs"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import {
  createReadResource,
  ReadResource,
  ReadResourceState
} from "@/app/shared/state/read-resource"
import { Result } from "@/app/shared/utils/result"
import { GetCustomerHistoryUseCase } from "../../application/use-cases/get-customer-history.use-case"
import { CustomerHistory } from "../../domain/entities/customer-history"
import { CustomerError } from "../../domain/errors/customer.error"

type HistoryRead = ReadResourceState<CustomerHistory | null, CustomerError>
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
    const resources = new Map<string, ReadResource<CustomerHistory | null, CustomerError>>()
    const scope = createSessionReadScope(() => {
      resources.forEach(resource => resource.reset())
      resources.clear()
      patchState(store, { histories: {} })
    })
    const selectHistory = (customerId: number, limit?: number): HistoryRead =>
      store.histories()[keyOf(customerId, limit)] ?? emptyRead()
    function trim() {
      const inactive = [...resources].filter(([, value]) => !value.isPending())
      for (const [key] of inactive.slice(0, Math.max(0, inactive.length - 20))) {
        resources.delete(key)
        patchState(store, state => {
          const histories = { ...state.histories }
          delete histories[key]
          return { histories }
        })
      }
    }
    function resource(customerId: number, limit?: number) {
      const key = keyOf(customerId, limit)
      let value = resources.get(key)
      if (!value)
        value = createReadResource<CustomerHistory | null, CustomerError>({
          state: {
            get: () => selectHistory(customerId, limit),
            update: update =>
              patchState(store, state => {
                const current = state.histories[key] ?? emptyRead()
                return {
                  histories: { ...state.histories, [key]: { ...current, ...update(current) } }
                }
              })
          },
          initialData: () => null,
          request: () => getHistory.execute(customerId, limit),
          normalizeError: error =>
            error instanceof CustomerError ? error : new CustomerError("UNEXPECTED"),
          ttl: 30000,
          scope,
          forcePolicy: "join",
          cancelOnInvalidate: true
        })
      resources.delete(key)
      resources.set(key, value)
      return value
    }
    return {
      selectHistory,
      loadHistory(
        customerId: number,
        limit?: number,
        force = false
      ): Observable<Result<CustomerHistory | null, CustomerError>> {
        return defer(() => {
          if (!scope.check()) return EMPTY
          return resource(customerId, limit).read(force).pipe(finalize(trim))
        })
      },
      /** Confirmed customer/property/relation changes invalidate every limit variant, not other owners. */
      invalidateCustomer(customerId: number): void {
        if (!scope.check()) return
        const generation = scope.generation()
        for (const [key, value] of [...resources]) {
          // An invalidated reader can synchronously replace the session from completion.
          if (!scope.check() || generation !== scope.generation()) return
          if ((JSON.parse(key) as [string, string])[0] === String(customerId)) value.invalidate()
        }
      }
    }
  })
)
