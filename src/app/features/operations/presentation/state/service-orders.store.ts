import { inject, Injector } from "@angular/core"
import { patchState, signalStore, withMethods, withState } from "@ngrx/signals"
import {
  concatWith,
  defaultIfEmpty,
  defer,
  EMPTY,
  finalize,
  NEVER,
  Observable,
  of,
  take,
  takeUntil
} from "rxjs"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
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
import { OperationsError, OperationsErrorCode } from "../../domain/errors/operations.error"
import { ServiceOrderDetail, ServiceOrderSummary } from "../../domain/models/operations-read.models"
import { ServiceOrderQuery } from "../../domain/params/operations.params"

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
  _pages: {} as Entries<Page>,
  _details: {} as Entries<ServiceOrderDetail>
}

export const ServiceOrdersStore = signalStore(
  { providedIn: "root" },
  withState(initialState),
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
            return read(key, request, force).pipe(
              // A completed GET settles the flight, not the caller's view lifetime.
              // No polling or root-owned subscription keeps the observation alive.
              concatWith(NEVER),
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
