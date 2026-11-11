import { inject, Injector } from "@angular/core"
import { patchState, signalStore, withMethods, withState } from "@ngrx/signals"
import { defaultIfEmpty, Observable, take } from "rxjs"
import { createKeyedReads, keyedState, KeyedEntry } from "@/app/shared/state/keyed-reads"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { Result } from "@/app/shared/utils/result"
import {
  GetFieldStaffUseCase,
  GetFieldStaffByIdUseCase,
  GetMyStaffProfileUseCase
} from "../../application/use-cases/field-staff.use-cases"
import { FieldOperationsError } from "../../domain/errors/field-operations.error"
import { FieldStaffSummary } from "../../domain/models/field-staff-summary"
import { FieldStaffQuery } from "../../domain/params/field-operations.params"

export interface FieldStaffReadEntry<T> {
  readonly result: T | undefined
  readonly loading: boolean
  readonly refreshing: boolean
  readonly error: FieldOperationsError | undefined
  readonly expires: number
}
type Page = PaginationResponse<FieldStaffSummary>
const empty = <T>(): FieldStaffReadEntry<T> => ({
  result: undefined,
  loading: false,
  refreshing: false,
  error: undefined,
  expires: 0
})
const normalize = (q: FieldStaffQuery): FieldStaffQuery => ({
  offset: q.offset ?? 0,
  limit: q.limit ?? 20,
  ...(q.search?.trim() ? { search: q.search.trim() } : {}),
  ...(q.isActive !== undefined ? { isActive: q.isActive } : {})
})
export const fieldStaffQueryKey = (q: FieldStaffQuery = {}) => {
  const n = normalize(q)
  return JSON.stringify([n.offset, n.limit, n.search ?? null, n.isActive ?? null])
}
const error = (code: "UNAUTHENTICATED" | "UNAVAILABLE" | "INVALID_RESPONSE" | "UNKNOWN") =>
  new FieldOperationsError(code, "Staff read could not be completed")
const normalizeError = (e: unknown) => (e instanceof FieldOperationsError ? e : error("UNKNOWN"))
const initialState = {
  _pages: {} as Readonly<Record<string, KeyedEntry<FieldStaffQuery, Page, FieldOperationsError>>>,
  _details: {} as Readonly<
    Record<string, KeyedEntry<number, FieldStaffSummary, FieldOperationsError>>
  >,
  _profiles: {} as Readonly<
    Record<string, KeyedEntry<"me", FieldStaffSummary, FieldOperationsError>>
  >
}

export const FieldStaffStore = signalStore(
  { providedIn: "root" },
  withState(initialState),
  withMethods(store => {
    const injector = inject(Injector)
    const resets: (() => void)[] = []
    const scope = createSessionReadScope(() => {
      resets.forEach(reset => reset())
      patchState(store, initialState)
    })
    // Every family shares one lazily resolved request shape; the registry owns the rest.
    const settle = <T>(source: Observable<Result<T, FieldOperationsError>>) =>
      source.pipe(take(1), defaultIfEmpty(Result.failure(error("INVALID_RESPONSE"))))
    const pages = createKeyedReads<FieldStaffQuery, Page, FieldOperationsError>({
      key: fieldStaffQueryKey,
      normalize,
      request: query => settle(injector.get(GetFieldStaffUseCase).execute(query)),
      state: keyedState(
        () => store._pages(),
        next => patchState(store, { _pages: next })
      ),
      scope,
      ttl: 120000,
      normalizeError,
      overflow: () => error("UNAVAILABLE"),
      // A direct read fails closed; observation simply completes without a session.
      noSession: "failure",
      noSessionError: () => error("UNAUTHENTICATED"),
      noSessionObserve: "empty",
      // An error must rescind freshness instead of leaving the entry verified.
      expireOnError: true
    })
    const details = createKeyedReads<number, FieldStaffSummary, FieldOperationsError>({
      key: id => String(id),
      request: id => settle(injector.get(GetFieldStaffByIdUseCase).execute(id)),
      state: keyedState(
        () => store._details(),
        next => patchState(store, { _details: next })
      ),
      scope,
      ttl: 120000,
      normalizeError,
      overflow: () => error("UNAVAILABLE"),
      noSession: "failure",
      noSessionError: () => error("UNAUTHENTICATED"),
      noSessionObserve: "empty",
      expireOnError: true
    })
    const profiles = createKeyedReads<"me", FieldStaffSummary, FieldOperationsError>({
      key: () => "me",
      request: () => settle(injector.get(GetMyStaffProfileUseCase).execute()),
      state: keyedState(
        () => store._profiles(),
        next => patchState(store, { _profiles: next })
      ),
      scope,
      ttl: 120000,
      normalizeError,
      overflow: () => error("UNAVAILABLE"),
      noSession: "failure",
      noSessionError: () => error("UNAUTHENTICATED"),
      noSessionObserve: "empty",
      expireOnError: true
    })
    resets.push(
      () => pages.reset(),
      () => details.reset(),
      () => profiles.reset()
    )
    return {
      selectStaff: (q: FieldStaffQuery = {}): FieldStaffReadEntry<Page> =>
        pages.select(q) ?? empty<Page>(),
      selectStaffById: (id: number): FieldStaffReadEntry<FieldStaffSummary> =>
        details.select(id) ?? empty<FieldStaffSummary>(),
      selectMyStaffProfile: (): FieldStaffReadEntry<FieldStaffSummary> =>
        profiles.select("me") ?? empty<FieldStaffSummary>(),
      readStaff: (q: FieldStaffQuery = {}, force = false) => pages.read(q, force),
      observeStaff: (q: FieldStaffQuery = {}, force = false) => pages.observe(q, { force }),
      readStaffById: (id: number, force = false) => details.read(id, force),
      observeStaffById: (id: number, force = false) => details.observe(id, { force }),
      readMyStaffProfile: (force = false) => profiles.read("me", force),
      observeMyStaffProfile: (force = false) => profiles.observe("me", { force })
    }
  })
)
