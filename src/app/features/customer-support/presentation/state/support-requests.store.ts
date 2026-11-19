import { computed, inject, Injector } from "@angular/core"
import { patchState, signalStore, withComputed, withMethods, withState } from "@ngrx/signals"
import {
  catchError,
  defer,
  defaultIfEmpty,
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
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { createKeyedReads, keyedState, KeyedEntry } from "@/app/shared/state/keyed-reads"
import { Result } from "@/app/shared/utils/result"
import {
  GetSupportRequestByIdUseCase,
  GetSupportRequestTypesUseCase,
  ListSupportRequestsUseCase
} from "../../application/use-cases/customer-support-read.use-cases"
import {
  AddSupportMessageUseCase,
  ChangeSupportStateUseCase,
  CreateSupportRequestUseCase
} from "../../application/use-cases/customer-support-write.use-cases"
import {
  CustomerSupportError,
  CustomerSupportErrorCode
} from "../../domain/errors/customer-support.error"
import {
  SUPPORT_STATE_CODES,
  SupportDetail,
  SupportRequestTypeView,
  SupportRequestView
} from "../../domain/models/support-views"
import {
  AddSupportMessageParams,
  ChangeSupportStateParams,
  CreateSupportRequestParams,
  SupportRequestQuery
} from "../../domain/params/customer-support.params"

export interface SupportReadEntry<T> {
  readonly result: T | undefined
  readonly loading: boolean
  readonly refreshing: boolean
  readonly error: CustomerSupportError | undefined
  readonly expires: number
}

type Page = PaginationResponse<SupportRequestView>
type Types = SupportRequestTypeView[]
// The type catalog has a single entry, so its registry key carries no identity.
const TYPES_KEY = "types"

const empty = <T>(): SupportReadEntry<T> => ({
  result: undefined,
  loading: false,
  refreshing: false,
  error: undefined,
  expires: 0
})
const error = (code: CustomerSupportErrorCode) => new CustomerSupportError(code)
const failure = <T>(code: CustomerSupportErrorCode): Observable<Result<T, CustomerSupportError>> =>
  defer(() => of(Result.failure(error(code))))
const positiveId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 2147483647

// Calendar validation never interprets business dates in a browser timezone.
const calendar = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false
  const [year, month, day] = value.split("-").map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
}
const supportStates = new Set<string>(SUPPORT_STATE_CODES)

// Snapshot once before admission. Unknown/getter input cannot throw out of the
// public API or evict a verified entry. DTO validation stays in the source.
const normalize = (query: SupportRequestQuery): SupportRequestQuery | undefined => {
  try {
    if (!query || typeof query !== "object" || Array.isArray(query)) return undefined
    const { offset = 0, limit = 20, state, requestTypeId, customerId, fromDate, toDate } = query
    if (
      typeof offset !== "number" ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !positiveId(limit) ||
      limit > 100 ||
      offset % limit !== 0 ||
      offset / limit > 2147483647 ||
      (state !== undefined && typeof state !== "string") ||
      (requestTypeId !== undefined && !positiveId(requestTypeId)) ||
      (customerId !== undefined && !positiveId(customerId)) ||
      (fromDate !== undefined && !calendar(fromDate)) ||
      (toDate !== undefined && !calendar(toDate)) ||
      (fromDate !== undefined && toDate !== undefined && fromDate > toDate)
    )
      return undefined
    // The closed state vocabulary is the backend's enum; there is no status catalog.
    const normalizedState = state?.trim().toUpperCase()
    if (normalizedState && !supportStates.has(normalizedState)) return undefined
    return {
      offset,
      limit,
      ...(normalizedState ? { state: normalizedState } : {}),
      ...(requestTypeId !== undefined ? { requestTypeId } : {}),
      ...(customerId !== undefined ? { customerId } : {}),
      ...(fromDate !== undefined ? { fromDate } : {}),
      ...(toDate !== undefined ? { toDate } : {})
    }
  } catch {
    return undefined
  }
}
const queryKey = (query: SupportRequestQuery) =>
  JSON.stringify([
    query.offset,
    query.limit,
    query.state ?? null,
    query.requestTypeId ?? null,
    query.customerId ?? null,
    query.fromDate ?? null,
    query.toDate ?? null
  ])
const initialState = {
  _pendingWrites: 0,
  _pages: {} as Readonly<
    Record<string, KeyedEntry<SupportRequestQuery, Page, CustomerSupportError>>
  >,
  _details: {} as Readonly<Record<string, KeyedEntry<number, SupportDetail, CustomerSupportError>>>,
  _types: {} as Readonly<Record<string, KeyedEntry<null, Types, CustomerSupportError>>>
}

/**
 * Root presentation state for customer support (T3/T8, D2, S10): one entry per
 * normalized request query, one per request id, one finite type catalog and the
 * three supported writes. Verified read results live here only; consumers own
 * restarts, cancellation and retries. Screens are later tasks.
 */
export const SupportRequestsStore = signalStore(
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
    // Cold, single-emission requests; an empty completion is an invalid response.
    const settle = <T>(source: Observable<Result<T, CustomerSupportError>>) =>
      source.pipe(take(1), defaultIfEmpty(Result.failure(error("INVALID_RESPONSE"))))
    const normalizeError = (value: unknown) =>
      value instanceof CustomerSupportError ? value : error("UNEXPECTED")
    const pages = createKeyedReads<SupportRequestQuery, Page, CustomerSupportError>({
      key: queryKey,
      request: query => settle(injector.get(ListSupportRequestsUseCase).execute(query)),
      state: keyedState(
        () => store._pages(),
        next => patchState(store, { _pages: next })
      ),
      scope,
      // D2: success-only freshness for list, detail and the type catalog.
      ttl: 30000,
      normalizeError,
      // Admission refuses instead of throwing: the documented unavailability failure is kept.
      overflow: () => error("UNAVAILABLE"),
      // A failed read rescinds freshness instead of leaving the entry verified.
      expireOnError: true
    })
    const details = createKeyedReads<number, SupportDetail, CustomerSupportError>({
      key: id => String(id),
      request: id => settle(injector.get(GetSupportRequestByIdUseCase).execute(id)),
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
    const types = createKeyedReads<null, Types, CustomerSupportError>({
      key: () => TYPES_KEY,
      request: () => settle(injector.get(GetSupportRequestTypesUseCase).execute()),
      state: keyedState(
        () => store._types(),
        next => patchState(store, { _types: next })
      ),
      scope,
      ttl: 30000,
      normalizeError,
      overflow: () => error("UNAVAILABLE"),
      expireOnError: true
    })
    resets.push(
      () => pages.reset(),
      () => details.reset(),
      () => types.reset()
    )
    /**
     * One coordinate chain for the three writes: shared pending gate, session fence
     * and confirmed-success invalidation. Input validation stays in each action and
     * the transport remains the value/DTO authority.
     */
    const coordinate = (
      dispatch: () => Observable<Result<SupportDetail, CustomerSupportError>>,
      expectedId?: number
    ): Observable<Result<SupportDetail, CustomerSupportError>> =>
      defer(() => {
        // SSR, no session or an expired credential fails closed: no request, no state.
        if (!scope.check()) return EMPTY
        if (expectedId !== undefined && !positiveId(expectedId))
          return of(Result.failure(error("VALIDATION")))
        // The gate is per store, i.e. per presentation, and never a global
        // transaction across features: it refuses a duplicate submit from this
        // store while a write is in flight and nothing more.
        if (store._pendingWrites()) return of(Result.failure(error("CONFLICT")))
        const generation = scope.generation()
        const current = () => scope.check() && generation === scope.generation()
        patchState(store, { _pendingWrites: store._pendingWrites() + 1 })
        return defer(dispatch).pipe(
          take(1),
          defaultIfEmpty(Result.failure(error("INVALID_RESPONSE"))),
          catchError((value: unknown) => of(Result.failure(normalizeError(value)))),
          // An answer for another record is not this write's confirmed success.
          map(result =>
            result.success && expectedId !== undefined && result.data.request.id !== expectedId
              ? Result.failure(error("INVALID_RESPONSE"))
              : result
          ),
          tap(result => {
            if (!result.success || !current()) return
            // Only a confirmed current-generation success invalidates: observed keys
            // re-read once each, inactive entries only expire and never self-refresh.
            pages.markMutated()
            if (!current()) return
            details.markMutated(entry => entry.query === result.data.request.id)
          }),
          takeUntil(scope.cancelled$),
          finalize(() => {
            // A completion from a replaced/expired/destroyed generation touches nothing.
            if (generation === scope.generation())
              patchState(store, { _pendingWrites: store._pendingWrites() - 1 })
          })
        )
      })
    return {
      createRequest(
        params: CreateSupportRequestParams
      ): Observable<Result<SupportDetail, CustomerSupportError>> {
        // Call-time capture of the documented payload only; an unknown params
        // object fails inside the deferred chain instead of throwing synchronously.
        let snapshot: CreateSupportRequestParams
        try {
          snapshot = {
            customerId: params.customerId,
            orderId: params.orderId,
            requestTypeId: params.requestTypeId,
            subject: params.subject,
            description: params.description
          }
        } catch {
          return failure<SupportDetail>("VALIDATION")
        }
        // The created answer's type/customer/order linkage is validated by the source.
        // It is never seeded into the detail registry: that entry means "verified GET
        // result for a key a consumer actually read", so a pre-filled record would
        // hand fresh data to a key that was never read. A confirmed creation only
        // expires an already-cached entry for that id; the detail screen reads its own.
        return coordinate(() => injector.get(CreateSupportRequestUseCase).execute(snapshot))
      },
      addMessage(
        id: number,
        params: AddSupportMessageParams
      ): Observable<Result<SupportDetail, CustomerSupportError>> {
        let snapshot: AddSupportMessageParams
        try {
          snapshot = { message: params.message }
        } catch {
          return failure<SupportDetail>("VALIDATION")
        }
        // Server owns author, timestamp and any resulting state movement.
        return coordinate(() => injector.get(AddSupportMessageUseCase).execute(id, snapshot), id)
      },
      changeState(
        id: number,
        params: ChangeSupportStateParams
      ): Observable<Result<SupportDetail, CustomerSupportError>> {
        let snapshot: ChangeSupportStateParams
        try {
          snapshot = { state: params.state, message: params.message }
        } catch {
          return failure<SupportDetail>("VALIDATION")
        }
        // The backend validates the target state and the transition, not this store.
        return coordinate(() => injector.get(ChangeSupportStateUseCase).execute(id, snapshot), id)
      },
      selectRequests(query: SupportRequestQuery = {}): SupportReadEntry<Page> {
        const snapshot = normalize(query)
        return snapshot ? (pages.select(snapshot) ?? empty<Page>()) : empty<Page>()
      },
      observeRequests(
        query: SupportRequestQuery = {},
        force = false
      ): Observable<Result<Page, CustomerSupportError>> {
        const snapshot = normalize(query)
        if (!snapshot) return failure<Page>("VALIDATION")
        return pages.observe(snapshot, { force })
      },
      selectRequest: (id: number): SupportReadEntry<SupportDetail> =>
        positiveId(id) ? (details.select(id) ?? empty<SupportDetail>()) : empty<SupportDetail>(),
      observeRequest(
        id: number,
        force = false
      ): Observable<Result<SupportDetail, CustomerSupportError>> {
        if (!positiveId(id)) return failure<SupportDetail>("VALIDATION")
        return details.observe(id, { force })
      },
      selectRequestTypes: (): SupportReadEntry<Types> => types.select(null) ?? empty<Types>(),
      observeRequestTypes(force = false): Observable<Result<Types, CustomerSupportError>> {
        return types.observe(null, { force })
      }
    }
  })
)
