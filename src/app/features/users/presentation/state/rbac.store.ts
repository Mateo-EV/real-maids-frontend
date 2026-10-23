import { DestroyRef, inject, Injector, PLATFORM_ID } from "@angular/core"
import { isPlatformBrowser } from "@angular/common"
import { patchState, signalStore, withMethods, withState } from "@ngrx/signals"
import {
  catchError,
  defer,
  EMPTY,
  finalize,
  map,
  Observable,
  of,
  shareReplay,
  Subject,
  takeUntil,
  tap
} from "rxjs"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { Result } from "@/app/shared/utils/result"
import { GetPermissionsUseCase } from "../../application/use-cases/get-permissions.use-case"
import { GetRolePermissionsUseCase } from "../../application/use-cases/get-role-permissions.use-case"
import { SaveRolePermissionsUseCase } from "../../application/use-cases/save-role-permissions.use-case"
import {
  Permission,
  PermissionAssignment,
  copyAssignment
} from "../../domain/entities/permission.entity"
import { RbacGrant, RbacMatrix } from "../../domain/models/rbac-matrix"
import { RbacError } from "../../domain/errors/rbac.error"

export const RBAC_READ_TTL_MS = 30000
export const RBAC_ROLE_HISTORY_LIMIT = 20
export interface RbacReadEntry<T> {
  readonly result: T | undefined
  readonly loading: boolean
  readonly refreshing: boolean
  readonly error: RbacError | undefined
  readonly expires: number
}
const emptyEntry = <T>(): RbacReadEntry<T> => ({
  result: undefined,
  loading: false,
  refreshing: false,
  error: undefined,
  expires: 0
})
const initialState = {
  matrices: {} as Record<number, PermissionAssignment>,
  catalog: [] as Permission[],
  loading: false,
  catalogEntry: emptyEntry<Permission[]>(),
  assignmentEntries: {} as Record<number, RbacReadEntry<PermissionAssignment>>,
  sessionRevision: 0
}
export const RbacStore = signalStore(
  { providedIn: "root" },
  withState(initialState),
  withMethods(
    (
      store,
      query = inject(GetRolePermissionsUseCase),
      save = inject(SaveRolePermissionsUseCase),
      catalog = inject(GetPermissionsUseCase)
    ) => {
      const injector = inject(Injector),
        destroyRef = inject(DestroyRef)
      const browser = isPlatformBrowser(inject(PLATFORM_ID)),
        cancelled = new Subject<void>()
      const revisions = new Map<number, number>(),
        loads = new Map<string, number>(),
        writes = new Set<number>()
      const flights = new Map<string, Observable<unknown>>()
      const retained = new Map<number, number>()
      const activeReads = new Map<string, number>()
      let pending = 0,
        loadSequence = 0,
        generation = 0,
        observing = false,
        sessionKey: string | null = null
      const identity = (session: AuthSession | null) =>
        session && (session.expiresAt === null || session.expiresAt > Date.now())
          ? JSON.stringify([session.id, session.email, session.expiresAt])
          : null
      const clear = () => {
        generation++
        flights.clear()
        activeReads.clear()
        cancelled.next()
        revisions.clear()
        loads.clear()
        writes.clear()
        retained.clear()
        patchState(store, { ...initialState, sessionRevision: store.sessionRevision() + 1 })
      }
      const acceptSession = (session: AuthSession | null) => {
        const key = identity(session)
        if (key === sessionKey) return
        sessionKey = key
        clear()
      }
      const checkSession = () => {
        if (!browser) return false
        const auth = injector.get(AuthStore)
        if (!observing) {
          observing = true
          sessionKey = identity(auth.session())
          const subscription = injector
            .get(ObserveAuthSessionUseCase)
            .execute()
            .subscribe(acceptSession)
          destroyRef.onDestroy(() => subscription.unsubscribe())
        } else acceptSession(auth.session())
        return sessionKey !== null
      }
      destroyRef.onDestroy(clear)
      function execute<T>(request: () => Observable<Result<T, RbacError>>) {
        return defer(() => {
          pending++
          patchState(store, { loading: true })
          return defer(request).pipe(
            catchError(() => of(Result.failure(new RbacError("UNEXPECTED")))),
            takeUntil(cancelled),
            finalize(() => {
              pending--
              patchState(store, { loading: pending > 0 })
            })
          )
        })
      }
      // This helper is local to RBAC's two read contracts, not a shared cache framework.
      function read<T>(
        key: string,
        force: boolean,
        entry: () => RbacReadEntry<T>,
        update: (value: RbacReadEntry<T>) => void,
        request: () => Observable<Result<T, RbacError>>,
        current: () => boolean = () => true
      ): Observable<Result<T, RbacError>> {
        if (flights.has(key) && !force) return flights.get(key) as Observable<Result<T, RbacError>>
        const previous = entry()
        if (!force && previous.result !== undefined && previous.expires > Date.now())
          return of(Result.success(previous.result))
        // Never reuse a request identity after eviction and readmission.
        const id = ++loadSequence,
          session = generation
        loads.set(key, id)
        const valid = () => generation === session && loads.get(key) === id && current()
        const flight = execute(() => {
          activeReads.set(key, (activeReads.get(key) ?? 0) + 1)
          update({
            ...entry(),
            loading: entry().result === undefined,
            refreshing: entry().result !== undefined,
            error: undefined
          })
          return request()
        }).pipe(
          map(result => (valid() ? result : Result.failure(new RbacError("BUSY")))),
          tap(result => {
            if (!valid()) return
            update(
              result.success
                ? {
                    result: result.data,
                    loading: false,
                    refreshing: false,
                    error: undefined,
                    expires: Date.now() + RBAC_READ_TTL_MS
                  }
                : { ...entry(), loading: false, refreshing: false, error: result.error }
            )
          }),
          finalize(() => {
            if (session === generation) {
              const count = (activeReads.get(key) ?? 1) - 1
              if (count > 0) activeReads.set(key, count)
              else activeReads.delete(key)
            }
            if (flights.get(key) === flight) {
              flights.delete(key)
              if (valid()) update({ ...entry(), loading: false, refreshing: false })
            }
          }),
          shareReplay({ bufferSize: 1, refCount: true })
        )
        flights.set(key, flight)
        return flight
      }
      function updateAssignment(roleId: number, entry: RbacReadEntry<PermissionAssignment>) {
        patchState(store, state => ({
          assignmentEntries: { ...state.assignmentEntries, [roleId]: entry },
          ...(entry.result
            ? { matrices: { ...state.matrices, [roleId]: copyAssignment(entry.result) } }
            : {})
        }))
      }
      function admit(roleId: number) {
        if (store.assignmentEntries()[roleId]) return true
        const ids = Object.keys(store.assignmentEntries()).map(Number)
        if (ids.length < RBAC_ROLE_HISTORY_LIMIT) return true
        const oldest = ids.find(
          id => !activeReads.has(String(id)) && !writes.has(id) && !retained.has(id)
        )
        if (oldest === undefined) return false
        const entries = { ...store.assignmentEntries() },
          matrices = { ...store.matrices() }
        delete entries[oldest]
        delete matrices[oldest]
        revisions.delete(oldest)
        loads.delete(String(oldest))
        patchState(store, { assignmentEntries: entries, matrices })
        return true
      }
      return {
        retainRole(roleId: number) {
          const session = generation
          retained.set(roleId, (retained.get(roleId) ?? 0) + 1)
          return () => {
            if (session !== generation) return
            const count = (retained.get(roleId) ?? 1) - 1
            if (count > 0) retained.set(roleId, count)
            else retained.delete(roleId)
          }
        },
        loadCatalog(force = false) {
          return defer(() => {
            if (!checkSession()) return EMPTY
            return read(
              "catalog",
              force,
              () => store.catalogEntry(),
              entry => patchState(store, { catalogEntry: entry, catalog: entry.result ?? [] }),
              () =>
                catalog
                  .execute()
                  .pipe(
                    map(result =>
                      result.success ? Result.success(result.data.map(p => ({ ...p }))) : result
                    )
                  )
            )
          })
        },
        loadPermissions(roleId: number, force = false) {
          return defer(() => {
            if (!checkSession()) return EMPTY
            if (writes.has(roleId) || !admit(roleId))
              return of(Result.failure(new RbacError("BUSY")))
            const revision = revisions.get(roleId) ?? 0
            return read(
              String(roleId),
              force,
              () => store.assignmentEntries()[roleId] ?? emptyEntry(),
              entry => updateAssignment(roleId, entry),
              () =>
                query
                  .execute(roleId)
                  .pipe(
                    map(result =>
                      result.success
                        ? result.data.roleId === roleId
                          ? Result.success(copyAssignment(result.data))
                          : Result.failure(new RbacError("INVALID_RESPONSE"))
                        : result
                    )
                  ),
              () => (revisions.get(roleId) ?? 0) === revision
            )
          })
        },
        savePermissionIds(roleId: number, ids: readonly number[]) {
          const snapshot = [...ids]
          return defer(() => {
            if (!checkSession()) return EMPTY
            if (writes.has(roleId)) return of(Result.failure(new RbacError("BUSY")))
            writes.add(roleId)
            const session = generation
            revisions.set(roleId, (revisions.get(roleId) ?? 0) + 1)
            flights.delete(String(roleId))
            if (store.assignmentEntries()[roleId])
              updateAssignment(roleId, {
                ...store.assignmentEntries()[roleId],
                expires: 0,
                loading: false,
                refreshing: false
              })
            return execute(() => save.execute(roleId, snapshot)).pipe(
              map(result =>
                result.success && result.data.roleId !== roleId
                  ? Result.failure(new RbacError("INVALID_RESPONSE"))
                  : result
              ),
              tap(result => {
                if (session !== generation || !result.success) return
                // A confirmed write updates visible data but is not a successful cache read.
                if (admit(roleId))
                  updateAssignment(roleId, {
                    ...emptyEntry<PermissionAssignment>(),
                    result: copyAssignment(result.data)
                  })
              }),
              finalize(() => {
                if (session === generation) {
                  writes.delete(roleId)
                  if (!store.assignmentEntries()[roleId] && !activeReads.has(String(roleId)))
                    revisions.delete(roleId)
                }
              })
            )
          })
        },
        // Compatibility for the unwired legacy illustration dialog: never dispatch its grants.
        savePermissions(
          _roleId: number,
          _grants: readonly RbacGrant[]
        ): Observable<Result<RbacMatrix, RbacError>> {
          return of(Result.failure(new RbacError("UNSUPPORTED")))
        }
      }
    }
  )
)
