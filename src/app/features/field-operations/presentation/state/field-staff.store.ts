import { inject, Injector } from "@angular/core"
import { patchState, signalStore, withMethods, withState } from "@ngrx/signals"
import {
  concat,
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
import {
  createReadResource,
  ReadResource,
  ReadResourceState
} from "@/app/shared/state/read-resource"
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
type Entries<T> = Readonly<Record<string, FieldStaffReadEntry<T>>>
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
const resourceState = <T>(
  entry: FieldStaffReadEntry<T>
): ReadResourceState<T | undefined, FieldOperationsError> => ({
  data: entry.result,
  loaded: entry.result !== undefined,
  refreshing: entry.refreshing,
  error: entry.error,
  expires: entry.expires
})
const initialState = {
  _pages: {} as Entries<Page>,
  _details: {} as Entries<FieldStaffSummary>,
  _profiles: {} as Entries<FieldStaffSummary>
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
    // This feature-local registry owns only coordinators/pins. Results live exclusively in SignalStore.
    function registry<T>(get: () => Entries<T>, set: (entries: Entries<T>) => void) {
      const resources = new Map<string, ReadResource<T | undefined, FieldOperationsError>>()
      const active = new Map<string, number>()
      resets.push(() => {
        const previous = [...resources.values()]
        resources.clear()
        previous.forEach(r => r.reset())
      })
      const admit = (key: string) => {
        if (get()[key]) return true
        const entries = { ...get() }
        if (Object.keys(entries).length >= 20) {
          const oldest = Object.keys(entries).find(
            k => !active.has(k) && !resources.get(k)?.isPending()
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
        request: () => Observable<Result<T, FieldOperationsError>>,
        force = false
      ): Observable<Result<T, FieldOperationsError>> =>
        defer(() => {
          if (!scope.check()) return of(Result.failure(error("UNAUTHENTICATED")))
          if (!admit(key)) return of(Result.failure(error("UNAVAILABLE")))
          let resource = resources.get(key)
          if (!resource) {
            const coordinator = createReadResource<T | undefined, FieldOperationsError>({
              state: {
                get: () => resourceState(get()[key]),
                update: update => {
                  const entry = get()[key]
                  if (!entry || resources.get(key) !== coordinator) return
                  const patch = update(resourceState(entry)),
                    next = { ...resourceState(entry), ...patch }
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
              normalizeError: e => (e instanceof FieldOperationsError ? e : error("UNKNOWN")),
              ttl: 120000,
              scope,
              forcePolicy: "join",
              cancelOnInvalidate: true
            })
            resources.set(key, coordinator)
            resource = coordinator
          }
          return resource.read(force) as Observable<Result<T, FieldOperationsError>>
        })
      return {
        read,
        select: (key: string) => get()[key] ?? empty<T>(),
        observe: (
          key: string,
          request: () => Observable<Result<T, FieldOperationsError>>,
          force = false
        ): Observable<Result<T, FieldOperationsError>> =>
          defer(() => {
            if (!scope.check()) return EMPTY
            if (!admit(key)) return of(Result.failure(error("UNAVAILABLE")))
            active.set(key, (active.get(key) ?? 0) + 1)
            return concat(read(key, request, force), NEVER).pipe(
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
    const profiles = registry(
      () => store._profiles(),
      entries => patchState(store, { _profiles: entries })
    )
    const pageRequest = (q: FieldStaffQuery) => () => injector.get(GetFieldStaffUseCase).execute(q)
    const detailRequest = (id: number) => () => injector.get(GetFieldStaffByIdUseCase).execute(id)
    const meRequest = () => injector.get(GetMyStaffProfileUseCase).execute()
    return {
      selectStaff: (q: FieldStaffQuery = {}) => pages.select(fieldStaffQueryKey(q)),
      selectStaffById: (id: number) => details.select(String(id)),
      selectMyStaffProfile: () => profiles.select("me"),
      readStaff(q: FieldStaffQuery = {}, force = false) {
        const snapshot = normalize(q)
        return pages.read(fieldStaffQueryKey(snapshot), pageRequest(snapshot), force)
      },
      observeStaff(q: FieldStaffQuery = {}, force = false) {
        const snapshot = normalize(q)
        return pages.observe(fieldStaffQueryKey(snapshot), pageRequest(snapshot), force)
      },
      readStaffById: (id: number, force = false) =>
        details.read(String(id), detailRequest(id), force),
      observeStaffById: (id: number, force = false) =>
        details.observe(String(id), detailRequest(id), force),
      readMyStaffProfile: (force = false) => profiles.read("me", meRequest, force),
      observeMyStaffProfile: (force = false) => profiles.observe("me", meRequest, force)
    }
  })
)
