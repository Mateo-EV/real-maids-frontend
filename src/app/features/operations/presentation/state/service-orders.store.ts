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
  shareReplay,
  Subject,
  switchMap,
  take,
  takeUntil,
  tap
} from "rxjs"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { CustomerHistoryStore } from "@/app/features/customers/presentation/state/customer-history.store"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import {
  createReadResource,
  ReadResource,
  ReadResourceState
} from "@/app/shared/state/read-resource"
import { Result } from "@/app/shared/utils/result"
import {
  GetServiceOrderByIdUseCase,
  ListServiceOrdersUseCase
} from "../../application/use-cases/service-order-read.use-cases"
import { CreateServiceOrderUseCase } from "../../application/use-cases/service-order-write.use-cases"
import { OperationsError, OperationsErrorCode } from "../../domain/errors/operations.error"
import { ServiceOrderDetail, ServiceOrderSummary } from "../../domain/models/operations-read.models"
import { CreateServiceOrderParams, ServiceOrderQuery } from "../../domain/params/operations.params"
import { ServiceRequestsStore } from "./service-requests.store"

export interface ServiceOrdersReadEntry<T> {
  readonly result: T | undefined
  readonly loading: boolean
  readonly refreshing: boolean
  readonly error: OperationsError | undefined
  readonly expires: number
}

type Page = PaginationResponse<ServiceOrderSummary>
type Entries<T> = Readonly<Record<string, ServiceOrdersReadEntry<T>>>
const empty = <T>(): ServiceOrdersReadEntry<T> => ({
  result: undefined,
  loading: false,
  refreshing: false,
  error: undefined,
  expires: 0
})
const error = (code: OperationsErrorCode) =>
  new OperationsError(code, "No se pudieron consultar las órdenes de servicio.")
const failure = <T>(code: OperationsErrorCode): Observable<Result<T, OperationsError>> =>
  defer(() => of(Result.failure(error(code))))
const positiveId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 2147483647
const calendar = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false
  const [year, month, day] = value.split("-").map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
}

// Snapshot once before admission. Unknown/getter input cannot throw out of the
// public API or evict a verified entry. DTO validation stays in the source.
const normalize = (query: ServiceOrderQuery): ServiceOrderQuery | undefined => {
  try {
    if (!query || typeof query !== "object" || Array.isArray(query)) return undefined
    const { offset = 0, limit = 20, customerId, staffId, status, from, until } = query
    if (
      typeof offset !== "number" ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !positiveId(limit) ||
      offset % limit !== 0 ||
      offset / limit > 2147483647 ||
      (customerId !== undefined && !positiveId(customerId)) ||
      (staffId !== undefined && !positiveId(staffId)) ||
      (status !== undefined && typeof status !== "string") ||
      (from !== undefined && !calendar(from)) ||
      (until !== undefined && !calendar(until)) ||
      (from !== undefined && until !== undefined && from > until)
    )
      return undefined
    const normalizedStatus = status?.trim().toUpperCase()
    return {
      offset,
      limit,
      ...(customerId !== undefined ? { customerId } : {}),
      ...(staffId !== undefined ? { staffId } : {}),
      ...(normalizedStatus ? { status: normalizedStatus } : {}),
      ...(from !== undefined ? { from } : {}),
      ...(until !== undefined ? { until } : {})
    }
  } catch {
    return undefined
  }
}
const queryKey = (query: ServiceOrderQuery) =>
  JSON.stringify([
    query.offset,
    query.limit,
    query.customerId ?? null,
    query.staffId ?? null,
    query.status ?? null,
    query.from ?? null,
    query.until ?? null
  ])
const resourceState = <T>(
  entry: ServiceOrdersReadEntry<T>
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
  _details: {} as Entries<ServiceOrderDetail>
}

export const ServiceOrdersStore = signalStore(
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

    // Only coordinators and observation pins live outside SignalStore. Lists
    // and sensitive details have independent budgets and reactive result state.
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
            candidate => !active.has(candidate) && !resources.get(candidate)?.isPending()
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
          if (!scope.check()) return EMPTY
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
          // Undefined represents an unverified entry, never a successful response.
          return resource.read(force) as Observable<Result<T, OperationsError>>
        })
      return {
        invalidate(predicate: (key: string) => boolean = () => true) {
          const generation = scope.generation()
          const current = () => scope.check() && generation === scope.generation()
          // Only existing resources are invalidated; no missing detail is admitted.
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
              const refresh = resource.read(true) as Observable<Result<T, OperationsError>>
              // Each caller subscribes to this same lazy batch flight. No root
              // subscription survives the last observing consumer's cancellation.
              batch.set(key, refresh.pipe(shareReplay({ bufferSize: 1, refCount: true })))
            }
          }
          if (current()) refreshes.next(batch)
        },
        select: (key: string) => get()[key] ?? empty<T>(),
        observe: (
          key: string,
          request: () => Observable<Result<T, OperationsError>>,
          force: boolean
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
              // The refresh stream retains the caller's view lifetime after GET
              // completes, without keeping a root-owned read subscription.
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
      createOrder(
        params: CreateServiceOrderParams,
        expectedCustomerId: number
      ): Observable<Result<ServiceOrderDetail, OperationsError>> {
        const writeError = (code: OperationsErrorCode) =>
          new OperationsError(code, "No se pudo crear la orden de servicio.")
        // Capture only the documented payload, not the expected owner context.
        // Validation/serialization of these fields remains in the existing source.
        let snapshot: CreateServiceOrderParams
        try {
          snapshot = {
            requestId: params.requestId,
            estimatedAmount: params.estimatedAmount,
            observation: params.observation
          }
        } catch {
          return defer(() => of(Result.failure(writeError("INVALID_DATA"))))
        }
        return defer(() => {
          if (!scope.check()) return EMPTY
          if (!positiveId(expectedCustomerId)) return of(Result.failure(writeError("INVALID_DATA")))
          if (store._pendingWrites()) return of(Result.failure(writeError("CONFLICT")))
          const generation = scope.generation()
          const current = () => scope.check() && generation === scope.generation()
          patchState(store, { _pendingWrites: store._pendingWrites() + 1 })
          return defer(() => injector.get(CreateServiceOrderUseCase).execute(snapshot)).pipe(
            take(1),
            defaultIfEmpty(Result.failure(writeError("INVALID_RESPONSE"))),
            catchError((value: unknown) =>
              of(Result.failure(value instanceof OperationsError ? value : writeError("UNKNOWN")))
            ),
            map(result =>
              result.success && result.data.order.customerId !== expectedCustomerId
                ? Result.failure(writeError("INVALID_RESPONSE"))
                : result
            ),
            tap(result => {
              if (!result.success || !current()) return
              pages.invalidate()
              if (!current()) return
              details.invalidate(key => key === String(result.data.order.id))
              if (!current()) return
              // The source has verified the returned order's request linkage.
              injector.get(ServiceRequestsStore).invalidateAfterOrderCreation(snapshot.requestId)
              if (!current()) return
              injector.get(CustomerHistoryStore).invalidateCustomer(result.data.order.customerId)
            }),
            takeUntil(scope.cancelled$),
            finalize(() => {
              if (generation === scope.generation())
                patchState(store, { _pendingWrites: store._pendingWrites() - 1 })
            })
          )
        })
      },
      selectOrders(query: ServiceOrderQuery = {}): ServiceOrdersReadEntry<Page> {
        const snapshot = normalize(query)
        return snapshot ? pages.select(queryKey(snapshot)) : empty<Page>()
      },
      observeOrders(
        query: ServiceOrderQuery = {},
        force = false
      ): Observable<Result<Page, OperationsError>> {
        const snapshot = normalize(query)
        if (!snapshot) return failure<Page>("INVALID_DATA")
        return pages.observe(
          queryKey(snapshot),
          () => injector.get(ListServiceOrdersUseCase).execute(snapshot),
          force
        )
      },
      selectOrder(id: number): ServiceOrdersReadEntry<ServiceOrderDetail> {
        return positiveId(id) ? details.select(String(id)) : empty<ServiceOrderDetail>()
      },
      observeOrder(
        id: number,
        force = false
      ): Observable<Result<ServiceOrderDetail, OperationsError>> {
        if (!positiveId(id)) return failure<ServiceOrderDetail>("INVALID_DATA")
        return details.observe(
          String(id),
          () => injector.get(GetServiceOrderByIdUseCase).execute(id),
          force
        )
      }
    }
  })
)
