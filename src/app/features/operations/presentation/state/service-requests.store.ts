import { computed, inject, Injector } from "@angular/core"
import { patchState, signalStore, withComputed, withMethods, withState } from "@ngrx/signals"
import {
  catchError,
  defaultIfEmpty,
  defer,
  EMPTY,
  finalize,
  filter,
  map,
  merge,
  Observable,
  of,
  take,
  takeUntil,
  shareReplay,
  Subject,
  switchMap,
  tap
} from "rxjs"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { CustomerHistoryStore } from "@/app/features/customers/presentation/state/customer-history.store"
import {
  CancelServiceRequestUseCase,
  CreateServiceRequestUseCase,
  UpdateServiceRequestUseCase
} from "../../application/use-cases/service-request-write.use-cases"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import {
  createReadResource,
  ReadResource,
  ReadResourceState
} from "@/app/shared/state/read-resource"
import { Result } from "@/app/shared/utils/result"
import {
  GetServiceRequestByIdUseCase,
  ListServiceRequestsUseCase
} from "../../application/use-cases/service-request-read.use-cases"
import { OperationsError, OperationsErrorCode } from "../../domain/errors/operations.error"
import { ServiceRequestSummary } from "../../domain/models/operations-read.models"
import {
  CancelServiceRequestParams,
  CreateServiceRequestParams,
  ServiceRequestQuery,
  UpdateServiceRequestParams
} from "../../domain/params/operations.params"

export interface ServiceRequestsReadEntry<T> {
  readonly result: T | undefined
  readonly loading: boolean
  readonly refreshing: boolean
  readonly error: OperationsError | undefined
  readonly expires: number
}

type Page = PaginationResponse<ServiceRequestSummary>
type Entries<T> = Readonly<Record<string, ServiceRequestsReadEntry<T>>>
const empty = <T>(): ServiceRequestsReadEntry<T> => ({
  result: undefined,
  loading: false,
  refreshing: false,
  error: undefined,
  expires: 0
})
const error = (code: OperationsErrorCode) =>
  new OperationsError(code, "Request reads could not be completed.")
const failure = <T>(code: OperationsErrorCode): Observable<Result<T, OperationsError>> =>
  defer(() => of(Result.failure(error(code))))
const positiveId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 2147483647

// Calendar validation never interprets business dates in a browser timezone.
const calendar = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
}
// Validate before registry admission, so rejected inputs cannot evict verified history.
// Transport validation remains authoritative; this only protects presentation keys/admission.
const normalize = (query: ServiceRequestQuery): ServiceRequestQuery | undefined => {
  const offset = query.offset === undefined ? 0 : query.offset
  const limit = query.limit === undefined ? 20 : query.limit
  if (
    typeof offset !== "number" ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !positiveId(limit) ||
    offset % limit !== 0 ||
    offset / limit > 2147483647 ||
    (query.customerId !== undefined && !positiveId(query.customerId)) ||
    (query.status !== undefined && typeof query.status !== "string") ||
    (query.from !== undefined && !calendar(query.from)) ||
    (query.until !== undefined && !calendar(query.until)) ||
    (query.from !== undefined && query.until !== undefined && query.from > query.until)
  )
    return undefined
  const status = query.status?.trim().toLowerCase()
  if (status && !["registrada", "atendida", "cancelada"].includes(status)) return undefined
  return {
    offset,
    limit,
    ...(query.customerId !== undefined ? { customerId: query.customerId } : {}),
    ...(status ? { status } : {}),
    ...(query.from !== undefined ? { from: query.from } : {}),
    ...(query.until !== undefined ? { until: query.until } : {})
  }
}
const queryKey = (query: ServiceRequestQuery) =>
  JSON.stringify([
    query.offset,
    query.limit,
    query.customerId ?? null,
    query.status ?? null,
    query.from ?? null,
    query.until ?? null
  ])
const resourceState = <T>(
  entry: ServiceRequestsReadEntry<T>
): ReadResourceState<T | undefined, OperationsError> => ({
  data: entry.result,
  loaded: entry.result !== undefined,
  refreshing: entry.refreshing,
  error: entry.error,
  expires: entry.expires
})
const initialState = {
  _pendingWrites: 0,
  _pages: {} as Entries<Page>,
  _details: {} as Entries<ServiceRequestSummary>
}

export const ServiceRequestsStore = signalStore(
  { providedIn: "root" },
  withState(initialState),
  withComputed(store => ({ writing: computed(() => store._pendingWrites() > 0) })),
  withMethods(store => {
    const injector = inject(Injector)
    const resets: (() => void)[] = []
    const scope = createSessionReadScope(() => {
      resets.forEach(reset => reset())
      patchState(store, initialState)
    })
    // Only coordinators/pins live here. Reactive results live exclusively in SignalStore.
    function registry<T>(get: () => Entries<T>, set: (entries: Entries<T>) => void) {
      const resources = new Map<string, ReadResource<T | undefined, OperationsError>>()
      const active = new Map<string, number>()
      const refreshes = new Subject<Map<string, Observable<Result<T, OperationsError>>>>()
      resets.push(() => {
        const previous = [...resources.values()]
        resources.clear()
        previous.forEach(resource => resource.reset())
      })
      const admit = (key: string) => {
        if (get()[key]) return true
        const entries = { ...get() }
        if (Object.keys(entries).length >= 20) {
          const oldest = Object.keys(entries).find(
            key => !active.has(key) && !resources.get(key)?.isPending()
          )
          if (oldest === undefined) return false
          delete entries[oldest]
          resources.delete(oldest)
        }
        set({ ...entries, [key]: empty<T>() })
        return true
      }
      const read = (
        key: string,
        request: () => Observable<Result<T, OperationsError>>,
        force: boolean
      ): Observable<Result<T, OperationsError>> =>
        defer(() => {
          if (!scope.check()) return failure<T>("UNAUTHENTICATED")
          if (!admit(key)) return failure<T>("UNAVAILABLE")
          let resource = resources.get(key)
          if (!resource) {
            const coordinator = createReadResource<T | undefined, OperationsError>({
              state: {
                get: () => resourceState(get()[key]),
                update: update => {
                  const entry = get()[key]
                  if (!entry || resources.get(key) !== coordinator) return
                  const patch = update(resourceState(entry))
                  const next = { ...resourceState(entry), ...patch }
                  const settled = "data" in patch || patch.error !== undefined
                  set({
                    ...get(),
                    [key]: {
                      result: next.data,
                      loading:
                        !settled &&
                        (next.pendingReads ?? coordinator.pendingReads) > 0 &&
                        !next.loaded,
                      refreshing: !settled && next.refreshing,
                      error: next.error,
                      expires: patch.error ? 0 : next.expires
                    }
                  })
                }
              },
              initialData: () => undefined,
              request: () =>
                request().pipe(take(1), defaultIfEmpty(Result.failure(error("INVALID_RESPONSE")))),
              normalizeError: value =>
                value instanceof OperationsError ? value : error("UNKNOWN"),
              ttl: 30000,
              scope,
              forcePolicy: "join",
              cancelOnInvalidate: true
            })
            resources.set(key, coordinator)
            resource = coordinator
          }
          return resource.read(force) as Observable<Result<T, OperationsError>>
        })
      return {
        invalidate(predicate: (key: string) => boolean = () => true) {
          const generation = scope.generation()
          const current = () => scope.check() && generation === scope.generation()
          const keys = [...resources.keys()].filter(predicate)
          for (const key of keys) {
            if (!current()) return
            resources.get(key)?.invalidate()
          }
          const batch = new Map<string, Observable<Result<T, OperationsError>>>()
          for (const key of keys) {
            if (!current()) return
            const resource = resources.get(key)
            if (active.has(key) && resource) {
              // Forced reads call the T-valued request; undefined is only the unloaded state.
              const refresh = resource.read(true) as Observable<Result<T, OperationsError>>
              batch.set(key, refresh.pipe(shareReplay({ bufferSize: 1, refCount: true })))
            }
          }
          if (current()) refreshes.next(batch)
        },
        select: (key: string) => get()[key] ?? empty<T>(),
        observe: (
          key: string,
          request: () => Observable<Result<T, OperationsError>>,
          force = false
        ): Observable<Result<T, OperationsError>> =>
          defer(() => {
            if (!scope.check()) return EMPTY
            if (!admit(key)) return failure<T>("UNAVAILABLE")
            active.set(key, (active.get(key) ?? 0) + 1)
            return merge(
              refreshes.pipe(
                map(batch => batch.get(key)),
                filter(value => value !== undefined)
              ),
              of(read(key, request, force))
            ).pipe(
              switchMap(request => request),
              takeUntil(scope.cancelled$),
              finalize(() => {
                const count = (active.get(key) ?? 1) - 1
                if (count) active.set(key, count)
                else active.delete(key)
              })
            )
          })
      }
    }
    const pages = registry(
      () => store._pages(),
      entries => patchState(store, { _pages: entries })
    )
    const details = registry(
      () => store._details(),
      entries => patchState(store, { _details: entries })
    )
    return {
      cancelRequest(
        id: number,
        params: CancelServiceRequestParams,
        expectedCustomerId: number
      ): Observable<Result<ServiceRequestSummary, OperationsError>> {
        const snapshot = { ...params }
        const writeError = (code: OperationsErrorCode) =>
          new OperationsError(code, "No se pudo cancelar la solicitud de servicio.")
        return defer(() => {
          if (!scope.check()) return EMPTY
          if (!positiveId(id) || !positiveId(expectedCustomerId))
            return of(Result.failure(writeError("INVALID_DATA")))
          if (store._pendingWrites()) return of(Result.failure(writeError("CONFLICT")))
          const generation = scope.generation()
          const current = () => scope.check() && generation === scope.generation()
          patchState(store, { _pendingWrites: store._pendingWrites() + 1 })
          return defer(() => injector.get(CancelServiceRequestUseCase).execute(id, snapshot)).pipe(
            take(1),
            defaultIfEmpty(Result.failure(writeError("INVALID_RESPONSE"))),
            catchError((error: unknown) =>
              of(Result.failure(error instanceof OperationsError ? error : writeError("UNKNOWN")))
            ),
            map(result =>
              result.success && result.data.customerId !== expectedCustomerId
                ? Result.failure(writeError("INVALID_RESPONSE"))
                : result
            ),
            tap(result => {
              if (!result.success || !current()) return
              pages.invalidate()
              if (!current()) return
              details.invalidate(key => key === String(id))
              if (!current()) return
              injector.get(CustomerHistoryStore).invalidateCustomer(result.data.customerId)
            }),
            takeUntil(scope.cancelled$),
            finalize(() => {
              if (generation === scope.generation())
                patchState(store, { _pendingWrites: store._pendingWrites() - 1 })
            })
          )
        })
      },
      updateRequest(
        id: number,
        params: UpdateServiceRequestParams,
        expectedCustomerId: number
      ): Observable<Result<ServiceRequestSummary, OperationsError>> {
        const snapshot = { ...params }
        const writeError = (code: OperationsErrorCode) =>
          new OperationsError(code, "No se pudo actualizar la solicitud de servicio.")
        return defer(() => {
          if (!scope.check()) return EMPTY
          if (!positiveId(id) || !positiveId(expectedCustomerId))
            return of(Result.failure(writeError("INVALID_DATA")))
          if (store._pendingWrites()) return of(Result.failure(writeError("CONFLICT")))
          const generation = scope.generation()
          const current = () => scope.check() && generation === scope.generation()
          patchState(store, { _pendingWrites: store._pendingWrites() + 1 })
          return defer(() => injector.get(UpdateServiceRequestUseCase).execute(id, snapshot)).pipe(
            take(1),
            defaultIfEmpty(Result.failure(writeError("INVALID_RESPONSE"))),
            catchError((error: unknown) =>
              of(Result.failure(error instanceof OperationsError ? error : writeError("UNKNOWN")))
            ),
            // Expected owner is captured presentation context, never a wire field
            // or an authenticated-user/customer identity inference.
            map(result =>
              result.success && result.data.customerId !== expectedCustomerId
                ? Result.failure(writeError("INVALID_RESPONSE"))
                : result
            ),
            tap(result => {
              if (!result.success || !current()) return
              pages.invalidate()
              if (!current()) return
              details.invalidate(key => key === String(id))
              if (!current()) return
              injector.get(CustomerHistoryStore).invalidateCustomer(result.data.customerId)
            }),
            takeUntil(scope.cancelled$),
            finalize(() => {
              if (generation === scope.generation())
                patchState(store, { _pendingWrites: store._pendingWrites() - 1 })
            })
          )
        })
      },
      createRequest(
        params: CreateServiceRequestParams
      ): Observable<Result<ServiceRequestSummary, OperationsError>> {
        const snapshot = { ...params }
        const writeError = (code: OperationsErrorCode) =>
          new OperationsError(code, "No se pudo crear la solicitud de servicio.")
        return defer(() => {
          if (!scope.check()) return EMPTY
          if (store._pendingWrites()) return of(Result.failure(writeError("CONFLICT")))
          const generation = scope.generation()
          const current = () => scope.check() && generation === scope.generation()
          patchState(store, { _pendingWrites: store._pendingWrites() + 1 })
          return defer(() => injector.get(CreateServiceRequestUseCase).execute(snapshot)).pipe(
            take(1),
            defaultIfEmpty(Result.failure(writeError("INVALID_RESPONSE"))),
            catchError((error: unknown) =>
              of(Result.failure(error instanceof OperationsError ? error : writeError("UNKNOWN")))
            ),
            tap(result => {
              if (!result.success || !current()) return
              pages.invalidate()
              if (!current()) return
              details.invalidate(key => key === String(result.data.id))
              if (!current()) return
              injector.get(CustomerHistoryStore).invalidateCustomer(result.data.customerId)
            }),
            takeUntil(scope.cancelled$),
            finalize(() => {
              if (generation === scope.generation())
                patchState(store, { _pendingWrites: store._pendingWrites() - 1 })
            })
          )
        })
      },
      selectRequests(query: ServiceRequestQuery = {}): ServiceRequestsReadEntry<Page> {
        const snapshot = normalize(query)
        return snapshot ? pages.select(queryKey(snapshot)) : empty<Page>()
      },
      observeRequests(
        query: ServiceRequestQuery = {},
        force = false
      ): Observable<Result<Page, OperationsError>> {
        const snapshot = normalize(query)
        if (!snapshot) return failure<Page>("INVALID_DATA")
        return pages.observe(
          queryKey(snapshot),
          () => injector.get(ListServiceRequestsUseCase).execute(snapshot),
          force
        )
      },
      selectRequest: (id: number): ServiceRequestsReadEntry<ServiceRequestSummary> =>
        positiveId(id) ? details.select(String(id)) : empty<ServiceRequestSummary>(),
      observeRequest(
        id: number,
        force = false
      ): Observable<Result<ServiceRequestSummary, OperationsError>> {
        if (!positiveId(id)) return failure<ServiceRequestSummary>("INVALID_DATA")
        return details.observe(
          String(id),
          () => injector.get(GetServiceRequestByIdUseCase).execute(id),
          force
        )
      }
    }
  })
)
