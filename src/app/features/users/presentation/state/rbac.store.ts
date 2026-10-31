import { inject } from "@angular/core"
import { patchState, signalStore, withMethods, withState } from "@ngrx/signals"
import { catchError, defer, EMPTY, finalize, map, Observable, of, takeUntil, tap } from "rxjs"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import {
  createReadResource,
  ReadResource,
  ReadResourceState
} from "@/app/shared/state/read-resource"
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
      const assignments = new Map<
        number,
        ReadResource<PermissionAssignment | undefined, RbacError>
      >()
      const writes = new Set<number>()
      const retained = new Map<number, number>()
      let pendingWrites = 0
      const scope = createSessionReadScope(() => {
        const previous = [...assignments.values()]
        assignments.clear()
        writes.clear()
        retained.clear()
        pendingWrites = 0
        previous.forEach(resource => resource.reset())
        catalogResource.reset()
        patchState(store, { ...initialState, sessionRevision: store.sessionRevision() + 1 })
      })
      const updateLoading = () =>
        patchState(store, {
          loading:
            pendingWrites > 0 ||
            catalogResource.isPending() ||
            [...assignments.values()].some(resource => resource.isPending())
        })
      const project = <T>(
        entry: RbacReadEntry<T>
      ): ReadResourceState<T | undefined, RbacError> => ({
        data: entry.result,
        loaded: entry.result !== undefined,
        refreshing: entry.refreshing,
        expires: entry.expires,
        error: entry.error
      })
      // RBAC settles entry status on delivery, while aggregate loading counts every live read/write.
      const apply = <T>(
        entry: RbacReadEntry<T>,
        patch: Partial<ReadResourceState<T | undefined, RbacError>>
      ): RbacReadEntry<T> => ({
        result: "data" in patch ? patch.data : entry.result,
        loading:
          patch.loaded !== undefined || patch.error !== undefined
            ? false
            : patch.refreshing !== undefined
              ? (patch.pendingReads ?? 0) > 0 && entry.result === undefined
              : entry.loading,
        refreshing:
          patch.loaded !== undefined || patch.error !== undefined
            ? false
            : (patch.refreshing ?? entry.refreshing),
        error: "error" in patch ? patch.error : entry.error,
        expires: patch.expires ?? entry.expires
      })
      const catalogResource = createReadResource<Permission[] | undefined, RbacError>({
        state: {
          get: () => project(store.catalogEntry()),
          update: update => {
            const entry = apply(store.catalogEntry(), update(project(store.catalogEntry())))
            patchState(store, { catalogEntry: entry, catalog: entry.result ?? [] })
            updateLoading()
          }
        },
        initialData: () => undefined,
        request: () =>
          catalog
            .execute()
            .pipe(
              map(result =>
                result.success ? Result.success(result.data.map(p => ({ ...p }))) : result
              )
            ),
        normalizeError: () => new RbacError("UNEXPECTED"),
        obsoleteResult: () => Result.failure(new RbacError("BUSY")),
        ttl: RBAC_READ_TTL_MS,
        scope
      })
      function execute<T>(request: () => Observable<Result<T, RbacError>>) {
        return defer(() => {
          const session = scope.generation()
          pendingWrites++
          updateLoading()
          return defer(request).pipe(
            catchError(() => of(Result.failure(new RbacError("UNEXPECTED")))),
            takeUntil(scope.cancelled$),
            finalize(() => {
              if (session !== scope.generation()) return
              pendingWrites--
              updateLoading()
            })
          )
        })
      }
      function updateAssignment(roleId: number, entry: RbacReadEntry<PermissionAssignment>) {
        patchState(store, state => ({
          assignmentEntries: { ...state.assignmentEntries, [roleId]: entry },
          ...(entry.result
            ? { matrices: { ...state.matrices, [roleId]: copyAssignment(entry.result) } }
            : {})
        }))
      }
      function assignmentResource(roleId: number) {
        let resource = assignments.get(roleId)
        if (resource) return resource
        resource = createReadResource<PermissionAssignment | undefined, RbacError>({
          state: {
            get: () => project(store.assignmentEntries()[roleId] ?? emptyEntry()),
            update: update => {
              // Eviction/reset must not let an old coordinator reinsert a removed role.
              if (assignments.get(roleId) !== resource) return
              const entry = store.assignmentEntries()[roleId] ?? emptyEntry<PermissionAssignment>()
              updateAssignment(roleId, apply(entry, update(project(entry))))
              updateLoading()
            }
          },
          initialData: () => undefined,
          request: () =>
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
          normalizeError: () => new RbacError("UNEXPECTED"),
          obsoleteResult: () => Result.failure(new RbacError("BUSY")),
          ttl: RBAC_READ_TTL_MS,
          scope
        })
        assignments.set(roleId, resource)
        return resource
      }
      function admit(roleId: number) {
        if (store.assignmentEntries()[roleId]) return true
        const ids = Object.keys(store.assignmentEntries()).map(Number)
        if (ids.length < RBAC_ROLE_HISTORY_LIMIT) return true
        const oldest = ids.find(
          id => !assignments.get(id)?.isPending() && !writes.has(id) && !retained.has(id)
        )
        if (oldest === undefined) return false
        const entries = { ...store.assignmentEntries() },
          matrices = { ...store.matrices() }
        delete entries[oldest]
        delete matrices[oldest]
        const resource = assignments.get(oldest)
        assignments.delete(oldest)
        patchState(store, { assignmentEntries: entries, matrices })
        resource?.reset()
        return true
      }
      // Undefined is only the adapter's unverified state, never a successful public result.
      const verified = <T>(result: Result<T | undefined, RbacError>): Result<T, RbacError> =>
        result.success
          ? result.data === undefined
            ? Result.failure(new RbacError("INVALID_RESPONSE"))
            : Result.success(result.data)
          : Result.failure(result.error)
      return {
        retainRole(roleId: number) {
          const session = scope.generation()
          retained.set(roleId, (retained.get(roleId) ?? 0) + 1)
          return () => {
            if (session !== scope.generation()) return
            const count = (retained.get(roleId) ?? 1) - 1
            if (count > 0) retained.set(roleId, count)
            else retained.delete(roleId)
          }
        },
        loadCatalog(force = false) {
          return catalogResource.read(force).pipe(map(verified))
        },
        loadPermissions(roleId: number, force = false) {
          return defer(() => {
            if (!scope.check()) return EMPTY
            if (writes.has(roleId) || !admit(roleId))
              return of(Result.failure(new RbacError("BUSY")))
            return assignmentResource(roleId).read(force).pipe(map(verified))
          })
        },
        savePermissionIds(roleId: number, ids: readonly number[]) {
          const snapshot = [...ids]
          return defer(() => {
            if (!scope.check()) return EMPTY
            if (writes.has(roleId)) return of(Result.failure(new RbacError("BUSY")))
            writes.add(roleId)
            const session = scope.generation()
            assignments.get(roleId)?.invalidate()
            return execute(() => save.execute(roleId, snapshot)).pipe(
              map(result =>
                result.success && result.data.roleId !== roleId
                  ? Result.failure(new RbacError("INVALID_RESPONSE"))
                  : result
              ),
              tap(result => {
                if (session !== scope.generation() || !result.success) return
                // A confirmed write updates visible data but is not a successful cache read.
                if (admit(roleId))
                  updateAssignment(roleId, {
                    ...emptyEntry<PermissionAssignment>(),
                    result: copyAssignment(result.data)
                  })
              }),
              finalize(() => {
                if (session === scope.generation()) writes.delete(roleId)
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
