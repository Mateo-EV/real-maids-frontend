import { inject } from "@angular/core"
import { patchState, signalStore, withMethods, withState } from "@ngrx/signals"
import { catchError, defer, EMPTY, finalize, map, Observable, of, takeUntil, tap } from "rxjs"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { createKeyedReads, KeyedEntry, keyedState } from "@/app/shared/state/keyed-reads"
import { createReadResource, ReadResourceState } from "@/app/shared/state/read-resource"
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
type AssignmentEntry = KeyedEntry<number, PermissionAssignment, RbacError>
type AssignmentEntries = Record<number, RbacReadEntry<PermissionAssignment>>
type KeyedAssignments = Record<string, AssignmentEntry>
/** Public role entries keep their shape; only the registry adapter speaks `KeyedEntry`. */
const toKeyed = (entries: Readonly<AssignmentEntries>): KeyedAssignments => {
  const keyed: KeyedAssignments = {}
  for (const [key, entry] of Object.entries(entries))
    keyed[key] = {
      // Role identity is the cache key, so the entry query is the parsed key.
      query: Number(key),
      result: entry.result,
      loading: entry.loading,
      refreshing: entry.refreshing,
      error: entry.error,
      expires: entry.expires
    }
  return keyed
}
/**
 * Assignment entries plus their defensive mirror. Only verified data is mirrored, and a role
 * keeps its mirrored object until its verified data changes.
 */
const publish = (
  entries: Readonly<KeyedAssignments>,
  previous: Readonly<AssignmentEntries>,
  mirrored: Readonly<Record<number, PermissionAssignment>>
) => {
  const assignmentEntries: AssignmentEntries = {}
  const matrices: Record<number, PermissionAssignment> = {}
  for (const [key, entry] of Object.entries(entries)) {
    const roleId = Number(key)
    assignmentEntries[roleId] = {
      result: entry.result,
      loading: entry.loading,
      refreshing: entry.refreshing,
      error: entry.error,
      expires: entry.expires
    }
    if (!entry.result) continue
    matrices[roleId] =
      previous[roleId]?.result === entry.result && mirrored[roleId]
        ? mirrored[roleId]
        : copyAssignment(entry.result)
  }
  return { assignmentEntries, matrices }
}
const initialState = {
  matrices: {} as Record<number, PermissionAssignment>,
  catalog: [] as Permission[],
  loading: false,
  catalogEntry: emptyEntry<Permission[]>(),
  assignmentEntries: {} as AssignmentEntries,
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
      const writes = new Set<number>()
      const retained = new Map<number, number>()
      // Live reads per role: the registry joins forced reads, so a forced read detaches first.
      const flights = new Map<number, number>()
      let pendingWrites = 0
      const scope = createSessionReadScope(() => {
        writes.clear()
        retained.clear()
        flights.clear()
        pendingWrites = 0
        assignments.reset()
        catalogResource.reset()
        patchState(store, { ...initialState, sessionRevision: store.sessionRevision() + 1 })
      })
      const updateLoading = () =>
        patchState(store, {
          loading:
            pendingWrites > 0 ||
            catalogResource.isPending() ||
            [...flights.values()].some(live => live > 0)
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
      /** Registry state adapter: keyed role entries in, public entries plus mirror out. */
      const adaptAssignments = keyedState<number, PermissionAssignment, RbacError>(
        () => toKeyed(store.assignmentEntries()),
        next => patchState(store, publish(next, store.assignmentEntries(), store.matrices()))
      )
      const assignments = createKeyedReads<number, PermissionAssignment, RbacError>({
        key: roleId => String(roleId),
        request: roleId =>
          defer(() => {
            const session = scope.generation()
            flights.set(roleId, (flights.get(roleId) ?? 0) + 1)
            updateLoading()
            return defer(() => query.execute(roleId)).pipe(
              map(result =>
                result.success
                  ? result.data.roleId === roleId
                    ? Result.success(copyAssignment(result.data))
                    : Result.failure(new RbacError("INVALID_RESPONSE"))
                  : result
              ),
              finalize(() => {
                // A reset already cleared the bookkeeping this flight belonged to.
                if (session !== scope.generation()) return
                const live = (flights.get(roleId) ?? 1) - 1
                if (live > 0) flights.set(roleId, live)
                else flights.delete(roleId)
                updateLoading()
              })
            )
          }),
        state: adaptAssignments,
        scope,
        ttl: RBAC_READ_TTL_MS,
        maxEntries: RBAC_ROLE_HISTORY_LIMIT,
        // A role with a dispatched write or an open dialog is never evicted to admit another.
        isPinned: key => writes.has(Number(key)) || retained.has(Number(key)),
        // A superseded read is detached rather than cancelled, so it can still settle as BUSY.
        obsoleteResult: () => Result.failure(new RbacError("BUSY")),
        cancelOnInvalidate: false,
        normalizeError: () => new RbacError("UNEXPECTED"),
        overflow: () => new RbacError("BUSY")
      })
      /**
       * A confirmed write publishes its own verified data; it is not a successful cache read.
       * When the role is not cached and the history is full, the oldest role that no write, open
       * dialog or open flight pins makes room, so a confirmed save is never left invisible.
       */
      function publishAssignment(roleId: number, data: PermissionAssignment) {
        const key = String(roleId)
        let entries = toKeyed(store.assignmentEntries())
        if (!entries[key] && Object.keys(entries).length >= RBAC_ROLE_HISTORY_LIMIT) {
          const evictable = Object.keys(entries).find(
            candidate =>
              !writes.has(Number(candidate)) &&
              !retained.has(Number(candidate)) &&
              (flights.get(Number(candidate)) ?? 0) === 0
          )
          if (evictable === undefined) return
          assignments.evict(evictable)
          entries = toKeyed(store.assignmentEntries())
        }
        adaptAssignments.update({
          ...entries,
          [key]: {
            query: roleId,
            result: data,
            loading: false,
            refreshing: false,
            error: undefined,
            expires: 0
          }
        })
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
            if (writes.has(roleId)) return of(Result.failure(new RbacError("BUSY")))
            // Replace, do not join: the superseded flight settles as BUSY for its own readers.
            if (force && (flights.get(roleId) ?? 0) > 0) assignments.invalidate(String(roleId))
            return assignments.read(roleId, force).pipe(map(verified))
          })
        },
        savePermissionIds(roleId: number, ids: readonly number[]) {
          const snapshot = [...ids]
          return defer(() => {
            if (!scope.check()) return EMPTY
            if (writes.has(roleId)) return of(Result.failure(new RbacError("BUSY")))
            writes.add(roleId)
            const session = scope.generation()
            assignments.invalidate(String(roleId))
            return execute(() => save.execute(roleId, snapshot)).pipe(
              map(result =>
                result.success && result.data.roleId !== roleId
                  ? Result.failure(new RbacError("INVALID_RESPONSE"))
                  : result
              ),
              tap(result => {
                if (session !== scope.generation() || !result.success) return
                publishAssignment(roleId, copyAssignment(result.data))
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
