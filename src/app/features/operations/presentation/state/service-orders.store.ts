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
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { createKeyedReads, keyedState, KeyedEntry } from "@/app/shared/state/keyed-reads"
import { Result } from "@/app/shared/utils/result"
import {
  GetServiceOrderByIdUseCase,
  ListServiceOrdersUseCase
} from "../../application/use-cases/service-order-read.use-cases"
import {
  CreateServiceOrderUseCase,
  ScheduleServiceOrderUseCase
} from "../../application/use-cases/service-order-write.use-cases"
import { ReplaceServiceAssignmentsUseCase } from "../../application/use-cases/replace-service-assignments.use-case"
import { OperationsError, OperationsErrorCode } from "../../domain/errors/operations.error"
import { ServiceOrderDetail, ServiceOrderSummary } from "../../domain/models/operations-read.models"
import {
  CreateServiceOrderParams,
  ServiceOrderQuery,
  ScheduleServiceOrderParams,
  ReplaceServiceAssignmentsParams
} from "../../domain/params/operations.params"
import { ServiceRequestsStore } from "./service-requests.store"

export interface ServiceOrdersReadEntry<T> {
  readonly result: T | undefined
  readonly loading: boolean
  readonly refreshing: boolean
  readonly error: OperationsError | undefined
  readonly expires: number
}

type Page = PaginationResponse<ServiceOrderSummary>
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
const initialState = {
  _pendingWrites: 0,
  _pages: {} as Readonly<Record<string, KeyedEntry<ServiceOrderQuery, Page, OperationsError>>>,
  _details: {} as Readonly<Record<string, KeyedEntry<number, ServiceOrderDetail, OperationsError>>>
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

    // Every family resolves its request lazily; the registry owns the rest.
    const settle = <T>(source: Observable<Result<T, OperationsError>>) =>
      source.pipe(take(1), defaultIfEmpty(Result.failure(error("INVALID_RESPONSE"))))
    const normalizeError = (value: unknown) =>
      value instanceof OperationsError ? value : error("UNKNOWN")
    const pages = createKeyedReads<ServiceOrderQuery, Page, OperationsError>({
      key: queryKey,
      request: query => settle(injector.get(ListServiceOrdersUseCase).execute(query)),
      state: keyedState(
        () => store._pages(),
        next => patchState(store, { _pages: next })
      ),
      scope,
      ttl: 30000,
      normalizeError,
      overflow: () => error("UNAVAILABLE"),
      // A failed read rescinds freshness instead of leaving the entry verified.
      expireOnError: true
    })
    const details = createKeyedReads<number, ServiceOrderDetail, OperationsError>({
      key: id => String(id),
      request: id => settle(injector.get(GetServiceOrderByIdUseCase).execute(id)),
      state: keyedState(
        () => store._details(),
        next => patchState(store, { _details: next })
      ),
      scope,
      ttl: 30000,
      normalizeError,
      overflow: () => error("UNAVAILABLE"),
      expireOnError: true
    })
    resets.push(
      () => pages.reset(),
      () => details.reset()
    )
    // Manual writes share creation's per-store gate, but never invalidate requests.
    function manualWrite(
      id: number,
      expectedCustomerId: number,
      request: () => Observable<Result<ServiceOrderSummary, OperationsError>>
    ): Observable<Result<ServiceOrderSummary, OperationsError>> {
      const failed = (code: OperationsErrorCode) =>
        Result.failure<OperationsError>(
          new OperationsError(code, "No se pudo confirmar el cambio de la orden.")
        )
      return defer(() => {
        if (!scope.check()) return EMPTY
        if (!positiveId(id) || !positiveId(expectedCustomerId)) return of(failed("INVALID_DATA"))
        if (store._pendingWrites()) return of(failed("CONFLICT"))
        const generation = scope.generation()
        const current = () => scope.check() && generation === scope.generation()
        patchState(store, { _pendingWrites: store._pendingWrites() + 1 })
        return defer(request).pipe(
          take(1),
          defaultIfEmpty(failed("INVALID_RESPONSE")),
          map(result =>
            result.success &&
            (!result.data ||
              !positiveId(result.data.id) ||
              result.data.id !== id ||
              !positiveId(result.data.customerId) ||
              result.data.customerId !== expectedCustomerId)
              ? failed("INVALID_RESPONSE")
              : result
          ),
          catchError((value: unknown) =>
            of(
              Result.failure<OperationsError>(
                value instanceof OperationsError
                  ? value
                  : new OperationsError("UNKNOWN", "No se pudo confirmar el cambio de la orden.")
              )
            )
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
    }
    return {
      scheduleOrder(id: number, params: ScheduleServiceOrderParams, expectedCustomerId: number) {
        let snapshot: ScheduleServiceOrderParams
        try {
          snapshot = {
            date: params.date,
            startTime: params.startTime,
            endTime: params.endTime,
            reasonId: params.reasonId
          }
        } catch {
          return failure<ServiceOrderSummary>("INVALID_DATA")
        }
        return manualWrite(id, expectedCustomerId, () =>
          injector.get(ScheduleServiceOrderUseCase).execute(id, snapshot)
        )
      },
      replaceAssignments(
        id: number,
        params: ReplaceServiceAssignmentsParams,
        expectedCustomerId: number
      ) {
        let snapshot: ReplaceServiceAssignmentsParams
        try {
          const items = params.assignments
          if (
            !Array.isArray(items) ||
            !Number.isInteger(items.length) ||
            items.length < 0 ||
            items.length > 20
          )
            return failure<ServiceOrderSummary>("INVALID_DATA")
          const assignments: ReplaceServiceAssignmentsParams["assignments"] = []
          for (let index = 0; index < items.length; index++) {
            if (!Object.hasOwn(items, index)) return failure<ServiceOrderSummary>("INVALID_DATA")
            const item = items[index]
            assignments.push({ staffId: item.staffId, role: item.role })
          }
          snapshot = { assignments }
        } catch {
          return failure<ServiceOrderSummary>("INVALID_DATA")
        }
        return manualWrite(id, expectedCustomerId, () =>
          injector.get(ReplaceServiceAssignmentsUseCase).execute(id, snapshot)
        )
      },
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
              pages.markMutated()
              if (!current()) return
              details.markMutated(entry => entry.query === result.data.order.id)
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
        return snapshot ? (pages.select(snapshot) ?? empty<Page>()) : empty<Page>()
      },
      observeOrders(
        query: ServiceOrderQuery = {},
        force = false
      ): Observable<Result<Page, OperationsError>> {
        const snapshot = normalize(query)
        if (!snapshot) return failure<Page>("INVALID_DATA")
        return pages.observe(snapshot, { force })
      },
      selectOrder(id: number): ServiceOrdersReadEntry<ServiceOrderDetail> {
        return positiveId(id)
          ? (details.select(id) ?? empty<ServiceOrderDetail>())
          : empty<ServiceOrderDetail>()
      },
      observeOrder(
        id: number,
        force = false
      ): Observable<Result<ServiceOrderDetail, OperationsError>> {
        if (!positiveId(id)) return failure<ServiceOrderDetail>("INVALID_DATA")
        return details.observe(id, { force })
      }
    }
  })
)
