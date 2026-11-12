import { computed, inject, Injector } from "@angular/core"
import { patchState, signalStore, withComputed, withMethods, withState } from "@ngrx/signals"
import { catchError, defer, EMPTY, finalize, Observable, of, takeUntil, tap } from "rxjs"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { createKeyedReads, KeyedEntry, keyedState } from "@/app/shared/state/keyed-reads"
import { ReadResourceState } from "@/app/shared/state/read-resource"
import { Result } from "@/app/shared/utils/result"
import {
  CreatePropertyUseCase,
  ListCustomerPropertiesUseCase,
  SetPropertyStatusUseCase,
  UpdatePropertyUseCase
} from "../../application/use-cases/property.use-cases"
import { Property } from "../../domain/entities/property.entity"
import { CustomerError } from "../../domain/errors/customer.error"
import { CreatePropertyParams, UpdatePropertyParams } from "../../domain/params/property.params"
import { CustomerHistoryStore } from "./customer-history.store"

type PropertyRead = ReadResourceState<readonly Property[], CustomerError>
type PropertyEntry = KeyedEntry<number, readonly Property[], CustomerError>

const PROPERTY_READ_TTL_MS = 120000
/** Only the inactive part of the history is bounded: an active or in-flight owner is kept. */
const UNBOUNDED_ACTIVE_READS = Number.POSITIVE_INFINITY
const PROPERTY_INACTIVE_HISTORY_LIMIT = 20

const emptyRead = (): PropertyRead => ({
  data: [],
  loaded: false,
  pendingReads: 0,
  refreshing: false,
  expires: 0,
  error: undefined
})
const initialState = {
  properties: {} as Record<number, PropertyRead>,
  pendingWrites: 0,
  writeError: undefined as CustomerError | undefined
}

/** One shared flight per key, whatever the number of subscribers of that flight. */
const pendingReads = (entry: PropertyEntry): number => (entry.loading || entry.refreshing ? 1 : 0)
/** Only a verified response produces `loaded` data; an unverified key reads as empty. */
const propertyRead = (entry: PropertyEntry | undefined): PropertyRead =>
  entry
    ? {
        data: entry.result ?? [],
        loaded: entry.result !== undefined,
        pendingReads: pendingReads(entry),
        refreshing: entry.refreshing,
        expires: entry.expires,
        error: entry.error
      }
    : emptyRead()
const toEntries = (
  entries: Readonly<Record<number, PropertyRead>>
): Record<string, PropertyEntry> => {
  const keyed: Record<string, PropertyEntry> = {}
  for (const [key, entry] of Object.entries(entries))
    keyed[key] = {
      query: Number(key),
      result: entry.loaded ? entry.data : undefined,
      loading: !entry.loaded && (entry.pendingReads ?? 0) > 0,
      refreshing: entry.refreshing,
      error: entry.error,
      expires: entry.expires
    }
  return keyed
}
const fromEntries = (
  entries: Readonly<Record<string, PropertyEntry>>
): Record<number, PropertyRead> => {
  const properties: Record<number, PropertyRead> = {}
  for (const [key, entry] of Object.entries(entries)) properties[Number(key)] = propertyRead(entry)
  return properties
}

/** Owner-specific lists; subscribe to load, select within a computed, unsubscribe on teardown. */
export const CustomerPropertiesStore = signalStore(
  { providedIn: "root" },
  withState(initialState),
  withComputed(store => ({
    loading: computed(
      () =>
        store.pendingWrites() > 0 ||
        Object.values(store.properties()).some(value => (value.pendingReads ?? 0) > 0)
    )
  })),
  withMethods(
    (
      store,
      list = inject(ListCustomerPropertiesUseCase),
      create = inject(CreatePropertyUseCase),
      update = inject(UpdatePropertyUseCase),
      status = inject(SetPropertyStatusUseCase),
      injector = inject(Injector)
    ) => {
      const normalizeError = (error: unknown) =>
        error instanceof CustomerError ? error : new CustomerError("UNEXPECTED")
      // Verified data lives exclusively in SignalStore; the registry retains flights only.
      const scope = createSessionReadScope(() => {
        properties.reset()
        patchState(store, initialState)
      })
      const properties = createKeyedReads<number, readonly Property[], CustomerError>({
        key: id => String(id),
        request: id => list.execute(id),
        state: keyedState(
          () => toEntries(store.properties()),
          next => patchState(store, { properties: fromEntries(next) })
        ),
        scope,
        ttl: PROPERTY_READ_TTL_MS,
        maxEntries: UNBOUNDED_ACTIVE_READS,
        inactiveHistoryLimit: PROPERTY_INACTIVE_HISTORY_LIMIT,
        normalizeError,
        overflow: () => new CustomerError("UNEXPECTED")
      })
      const selectProperties = (id: number): PropertyRead => propertyRead(properties.select(id))
      function mutate<T>(id: number, request: () => Observable<Result<T, CustomerError>>) {
        return defer(() => {
          if (!scope.check()) return EMPTY
          const generation = scope.generation()
          patchState(store, state => ({
            pendingWrites: state.pendingWrites + 1,
            writeError: undefined
          }))
          return defer(request).pipe(
            catchError((error: unknown) => of(Result.failure(normalizeError(error)))),
            tap(result => {
              if (generation !== scope.generation()) return
              result.either(
                () => {
                  // Only the written owner expires; the key is never refreshed by a write.
                  properties.invalidate(String(id))
                  // Cancelling readers invokes caller completion callbacks synchronously.
                  if (!scope.check() || generation !== scope.generation()) return
                  const history = injector.get(CustomerHistoryStore)
                  if (!scope.check() || generation !== scope.generation()) return
                  history.invalidateCustomer(id)
                },
                error => patchState(store, { writeError: error })
              )
            }),
            takeUntil(scope.cancelled$),
            finalize(() => {
              if (generation === scope.generation())
                patchState(store, state => ({ pendingWrites: state.pendingWrites - 1 }))
            })
          )
        })
      }
      return {
        selectProperties,
        loadProperties(
          id: number,
          force = false
        ): Observable<Result<readonly Property[], CustomerError>> {
          return properties.read(id, force)
        },
        createProperty(id: number, params: CreatePropertyParams) {
          return mutate(id, () => create.execute(id, params))
        },
        updateProperty(id: number, params: UpdatePropertyParams) {
          return mutate(id, () => update.execute(id, params))
        },
        setPropertyStatus(id: number, propertyId: number, isActive: boolean) {
          return mutate(id, () => status.execute(id, propertyId, isActive))
        }
      }
    }
  )
)
