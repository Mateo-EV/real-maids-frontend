import { computed, inject } from "@angular/core"
import { patchState, signalStore, withComputed, withMethods, withState } from "@ngrx/signals"
import { defer, EMPTY, map, Observable, of, tap } from "rxjs"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import {
  createReadResource,
  ReadResource,
  ReadResourceState
} from "@/app/shared/state/read-resource"
import { Result } from "@/app/shared/utils/result"
import { GetAuditLogsUseCase } from "../../application/use-cases/get-audit-logs.use-case"
import { AuditLogError } from "../../domain/errors/audit-log.error"
import { AuditQuery } from "../../domain/models/audit-query"
import { AuditPage } from "../../domain/models/audit-page"

type Response = Result<AuditPage, AuditLogError>
interface AuditEntry {
  readonly result?: AuditPage
  readonly loading: boolean
  readonly refreshing: boolean
  readonly error?: AuditLogError
  readonly expires: number
}
const emptyEntry: AuditEntry = { loading: false, refreshing: false, expires: 0 }
const ttl = 30000
// Preserve contradictory inputs in the key: invalid requests must never hit a valid cached query.
function queryKey(q: AuditQuery): string {
  const size = q.size ?? q.limit ?? 20
  const page = q.page ?? (q.offset ?? 0) / size
  return JSON.stringify(
    [
      page,
      size,
      q.offset ?? page * size,
      q.limit ?? size,
      q.userId,
      q.dayUTC ?? q.fromUTC,
      q.dayUTC ?? q.toUTC,
      q.entity,
      q.action,
      q.dayUTC !== undefined ? q.fromUTC : undefined,
      q.dayUTC !== undefined ? q.toUTC : undefined
    ].map(value => [typeof value, String(value)])
  )
}

export const AuditLogsStore = signalStore(
  { providedIn: "root" },
  withState({
    entries: {} as Record<string, AuditEntry>,
    currentKey: "",
    globalTotal: null as number | null,
    globalResult: undefined as AuditPage | undefined,
    globalExpires: 0,
    globalLoading: false,
    globalRefreshing: false,
    globalError: undefined as AuditLogError | undefined,
    sessionRevision: 0
  }),
  withComputed(store => {
    const current = computed(() => store.entries()[store.currentKey()] ?? emptyEntry)
    return {
      hasVerifiedResult: computed(() => current().result !== undefined),
      items: computed(() => current().result?.items ?? []),
      total: computed(() => current().result?.total ?? 0),
      totalPages: computed(() => current().result?.totalPages ?? 0),
      page: computed(() => current().result?.page ?? 0),
      size: computed(() => current().result?.size ?? 20),
      loading: computed(() => current().loading),
      refreshing: computed(() => current().refreshing),
      error: computed(() => current().error)
    }
  }),
  withMethods((store, query = inject(GetAuditLogsUseCase)) => {
    const resources = new Map<string, ReadResource<AuditPage | undefined, AuditLogError>>()
    let latest = 0,
      sequence = 0,
      globalSequence = 0,
      globalRequest = 0
    const scope = createSessionReadScope(() => {
      latest++
      const previous = [...resources.values()]
      resources.clear()
      previous.forEach(resource => resource.reset())
      globalResource.reset()
      patchState(store, {
        entries: {},
        currentKey: "",
        globalTotal: null,
        globalResult: undefined,
        globalExpires: 0,
        globalLoading: false,
        globalRefreshing: false,
        globalError: undefined,
        sessionRevision: store.sessionRevision() + 1
      })
    })
    const project = (
      entry: AuditEntry
    ): ReadResourceState<AuditPage | undefined, AuditLogError> => ({
      data: entry.result,
      loaded: entry.result !== undefined,
      refreshing: entry.refreshing,
      expires: entry.expires,
      error: entry.error
    })
    const update = (key: string, entry: AuditEntry) =>
      patchState(store, { entries: { ...store.entries(), [key]: entry } })
    const admit = (key: string) => {
      if (store.entries()[key]) return true
      const entries = { ...store.entries() }
      if (Object.keys(entries).length >= 20) {
        const oldest = Object.keys(entries).find(
          candidate => candidate !== store.currentKey() && !resources.get(candidate)?.isPending()
        )
        if (!oldest) return false
        delete entries[oldest]
        const resource = resources.get(oldest)
        resources.delete(oldest)
        resource?.reset()
      }
      patchState(store, { entries: { ...entries, [key]: emptyEntry } })
      return true
    }
    // Global identity/order is a capability policy spanning distinct resources, not a cache rule.
    const acceptGlobal = (result: AuditPage, request: number) => {
      if (request < globalSequence) return
      globalSequence = request
      patchState(store, {
        globalTotal: result.globalTotal,
        globalResult: result,
        globalExpires: Date.now() + ttl,
        globalError: undefined
      })
    }
    const globalState = (): ReadResourceState<AuditPage | undefined, AuditLogError> => ({
      data: store.globalResult(),
      loaded: store.globalResult() !== undefined,
      refreshing: store.globalRefreshing(),
      expires: store.globalExpires(),
      error: store.globalError()
    })
    const globalResource = createReadResource<AuditPage | undefined, AuditLogError>({
      state: {
        get: globalState,
        update: update => {
          const patch = update(globalState())
          if (patch.data !== undefined) acceptGlobal(patch.data, globalRequest)
          if (
            "error" in patch &&
            (patch.pendingReads !== undefined || globalRequest >= globalSequence)
          )
            patchState(store, { globalError: patch.error })
          if (patch.pendingReads !== undefined)
            patchState(store, {
              globalLoading: patch.pendingReads > 0 && store.globalTotal() === null,
              globalRefreshing: patch.pendingReads > 0 && store.globalTotal() !== null
            })
        }
      },
      initialData: () => undefined,
      request: () => {
        globalRequest = ++sequence
        return query.execute({ page: 0, size: 1 })
      },
      normalizeError: () => new AuditLogError("UNEXPECTED"),
      ttl,
      forcePolicy: "join",
      scope
    })
    function requestPage(input: AuditQuery) {
      const request = ++latest,
        globalRequest = ++sequence,
        epoch = scope.generation()
      return query.execute(input).pipe(
        tap(result => {
          if (epoch === scope.generation() && result.success && request === latest)
            acceptGlobal(result.data, globalRequest)
        })
      )
    }
    function pageResource(key: string, input: AuditQuery) {
      let resource = resources.get(key)
      if (resource) return resource
      resource = createReadResource<AuditPage | undefined, AuditLogError>({
        state: {
          get: () => project(store.entries()[key] ?? emptyEntry),
          update: updateState => {
            if (resources.get(key) !== resource || !store.entries()[key]) return
            const entry = store.entries()[key],
              patch = updateState(project(entry))
            update(key, {
              result: "data" in patch ? patch.data : entry.result,
              loading:
                patch.pendingReads !== undefined
                  ? patch.pendingReads > 0 && entry.result === undefined
                  : entry.loading,
              refreshing: patch.refreshing ?? entry.refreshing,
              error: "error" in patch ? patch.error : entry.error,
              expires: patch.expires ?? entry.expires
            })
          }
        },
        initialData: () => undefined,
        request: () => requestPage(input),
        normalizeError: () => new AuditLogError("UNEXPECTED"),
        ttl,
        forcePolicy: "join",
        scope
      })
      resources.set(key, resource)
      return resource
    }
    const verified = (result: Result<AuditPage | undefined, AuditLogError>): Response =>
      result.success
        ? result.data === undefined
          ? Result.failure(new AuditLogError("UNEXPECTED"))
          : Result.success(result.data)
        : Result.failure(result.error)
    return {
      load(params: AuditQuery, force = false): Observable<Response> {
        const input = { ...params },
          key = queryKey(input)
        return defer(() => {
          if (!scope.check()) return EMPTY
          if (!admit(key)) return of(Result.failure(new AuditLogError("UNEXPECTED")))
          if (store.currentKey() !== key) {
            latest++
            patchState(store, { currentKey: key })
          }
          return pageResource(key, input)
            .read(force, () => requestPage(input))
            .pipe(map(verified))
        })
      },
      loadGlobalTotal(force = false): Observable<Response> {
        return globalResource.read(force).pipe(map(verified))
      }
    }
  })
)
