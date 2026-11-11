import { computed, inject, Injector } from "@angular/core"
import { patchState, signalStore, withComputed, withMethods, withState } from "@ngrx/signals"
import {
  catchError,
  defaultIfEmpty,
  defer,
  EMPTY,
  finalize,
  map,
  Observable,
  of,
  take,
  takeUntil,
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
import { createKeyedReads, keyedState, KeyedEntry } from "@/app/shared/state/keyed-reads"
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
const bounds = (query: ServiceRequestQuery) => ({
  offset: query.offset === undefined ? 0 : query.offset,
  limit: query.limit === undefined ? 20 : query.limit
})
const REQUEST_STATES = ["registrada", "atendida", "cancelada"]
// Validate before registry admission, so rejected inputs cannot evict verified history.
// Transport validation remains authoritative; this only protects presentation keys/admission.
const supported = (query: ServiceRequestQuery): boolean => {
  const { offset, limit } = bounds(query)
  const status = query.status?.trim().toLowerCase()
  return (
    typeof offset === "number" &&
    Number.isSafeInteger(offset) &&
    offset >= 0 &&
    positiveId(limit) &&
    offset % limit === 0 &&
    offset / limit <= 2147483647 &&
    (query.customerId === undefined || positiveId(query.customerId)) &&
    (query.status === undefined || typeof query.status === "string") &&
    (query.from === undefined || calendar(query.from)) &&
    (query.until === undefined || calendar(query.until)) &&
    (query.from === undefined || query.until === undefined || query.from <= query.until) &&
    (!status || REQUEST_STATES.includes(status))
  )
}
// Canonical form for registry keys and requests; every entry point validates first.
const normalize = (query: ServiceRequestQuery): ServiceRequestQuery => {
  const { offset, limit } = bounds(query)
  const status = query.status?.trim().toLowerCase()
  return {
    offset,
    limit,
    ...(query.customerId !== undefined ? { customerId: query.customerId } : {}),
    ...(status ? { status } : {}),
    ...(query.from !== undefined ? { from: query.from } : {}),
    ...(query.until !== undefined ? { until: query.until } : {})
  }
}
const snapshotOf = (query: ServiceRequestQuery): ServiceRequestQuery | undefined =>
  supported(query) ? normalize(query) : undefined
const queryKey = (query: ServiceRequestQuery) =>
  JSON.stringify([
    query.offset,
    query.limit,
    query.customerId ?? null,
    query.status ?? null,
    query.from ?? null,
    query.until ?? null
  ])
const initialState = {
  _pendingWrites: 0,
  _pages: {} as Readonly<Record<string, KeyedEntry<ServiceRequestQuery, Page, OperationsError>>>,
  _details: {} as Readonly<
    Record<string, KeyedEntry<number, ServiceRequestSummary, OperationsError>>
  >
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
    // Verified results live exclusively in SignalStore; the registries retain coordination.
    // Cold, single-emission requests; an empty completion is an invalid response.
    const settle = <T>(source: Observable<Result<T, OperationsError>>) =>
      source.pipe(take(1), defaultIfEmpty(Result.failure(error("INVALID_RESPONSE"))))
    const pages = createKeyedReads<ServiceRequestQuery, Page, OperationsError>({
      key: queryKey,
      normalize,
      request: query => settle(injector.get(ListServiceRequestsUseCase).execute(query)),
      state: keyedState(
        () => store._pages(),
        next => patchState(store, { _pages: next })
      ),
      scope,
      ttl: 30000,
      normalizeError: value => (value instanceof OperationsError ? value : error("UNKNOWN")),
      // Admission refuses instead of throwing: the documented unavailability failure is kept.
      overflow: () => error("UNAVAILABLE"),
      // A direct read fails closed; observation simply completes without a session.
      noSession: "failure",
      noSessionError: () => error("UNAUTHENTICATED"),
      noSessionObserve: "empty",
      // A failed read rescinds freshness instead of leaving the entry verified.
      expireOnError: true
    })
    const details = createKeyedReads<number, ServiceRequestSummary, OperationsError>({
      key: id => String(id),
      request: id => settle(injector.get(GetServiceRequestByIdUseCase).execute(id)),
      state: keyedState(
        () => store._details(),
        next => patchState(store, { _details: next })
      ),
      scope,
      ttl: 30000,
      normalizeError: value => (value instanceof OperationsError ? value : error("UNKNOWN")),
      overflow: () => error("UNAVAILABLE"),
      noSession: "failure",
      noSessionError: () => error("UNAUTHENTICATED"),
      noSessionObserve: "empty",
      expireOnError: true
    })
    resets.push(
      () => pages.reset(),
      () => details.reset()
    )
    return {
      // Order creation owns history invalidation. This seam affects only
      // already-admitted request pages and the linked request detail.
      invalidateAfterOrderCreation(linkedRequestId: number): void {
        if (!positiveId(linkedRequestId) || !scope.check()) return
        const generation = scope.generation()
        pages.markMutated()
        if (!scope.check() || generation !== scope.generation()) return
        details.markMutated(entry => entry.query === linkedRequestId)
      },
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
              pages.markMutated()
              if (!current()) return
              details.markMutated(entry => entry.query === id)
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
              pages.markMutated()
              if (!current()) return
              details.markMutated(entry => entry.query === id)
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
              pages.markMutated()
              if (!current()) return
              details.markMutated(entry => entry.query === result.data.id)
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
        const snapshot = snapshotOf(query)
        return snapshot ? (pages.select(snapshot) ?? empty<Page>()) : empty<Page>()
      },
      observeRequests(
        query: ServiceRequestQuery = {},
        force = false
      ): Observable<Result<Page, OperationsError>> {
        const snapshot = snapshotOf(query)
        if (!snapshot) return failure<Page>("INVALID_DATA")
        return pages.observe(snapshot, { force })
      },
      selectRequest: (id: number): ServiceRequestsReadEntry<ServiceRequestSummary> =>
        positiveId(id)
          ? (details.select(id) ?? empty<ServiceRequestSummary>())
          : empty<ServiceRequestSummary>(),
      observeRequest(
        id: number,
        force = false
      ): Observable<Result<ServiceRequestSummary, OperationsError>> {
        if (!positiveId(id)) return failure<ServiceRequestSummary>("INVALID_DATA")
        return details.observe(id, { force })
      }
    }
  })
)
