import { computed, inject } from "@angular/core"
import { patchState, signalStore, withComputed, withMethods, withState } from "@ngrx/signals"
import { defer, EMPTY, map, Observable, tap } from "rxjs"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { createKeyedReads, KeyedEntry, keyedState } from "@/app/shared/state/keyed-reads"
import { createReadResource, ReadResourceState } from "@/app/shared/state/read-resource"
import { Result } from "@/app/shared/utils/result"
import { GetAuditLogsUseCase } from "../../application/use-cases/get-audit-logs.use-case"
import { AuditLogError } from "../../domain/errors/audit-log.error"
import { AuditQuery } from "../../domain/models/audit-query"
import { AuditPage } from "../../domain/models/audit-page"

type Response = Result<AuditPage, AuditLogError>
type PageEntry = KeyedEntry<AuditQuery, AuditPage, AuditLogError>
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
    let latest = 0,
      sequence = 0,
      globalSequence = 0,
      globalRequest = 0
    // The key keeps contradictory paging aliases apart, so the caller's own shape is remembered:
    // a retained key must dispatch what the latest caller asked for, not its first input.
    const inputs = new Map<string, AuditQuery>()
    const remember = (key: string, input: AuditQuery) => {
      const entries = store.entries()
      for (const cached of [...inputs.keys()])
        if (cached !== key && !entries[cached]) inputs.delete(cached)
      inputs.set(key, input)
    }
    /** Public entries stay `AuditEntry`; the registry adapter alone speaks `KeyedEntry`. */
    const toKeyed = (entries: Readonly<Record<string, AuditEntry>>): Record<string, PageEntry> => {
      const keyed: Record<string, PageEntry> = {}
      for (const [key, entry] of Object.entries(entries))
        keyed[key] = {
          query: inputs.get(key) ?? {},
          result: entry.result,
          loading: entry.loading,
          refreshing: entry.refreshing,
          error: entry.error,
          expires: entry.expires
        }
      return keyed
    }
    const fromKeyed = (entries: Readonly<Record<string, PageEntry>>) => {
      const pages: Record<string, AuditEntry> = {}
      for (const [key, entry] of Object.entries(entries))
        pages[key] = {
          result: entry.result,
          loading: entry.loading,
          refreshing: entry.refreshing,
          error: entry.error,
          expires: entry.expires
        }
      return pages
    }
    /** The displayed page: switching it fences older requests from adopting the global total. */
    const switchKey = (key: string) => {
      if (store.currentKey() === key) return
      latest++
      patchState(store, { currentKey: key })
    }
    const scope = createSessionReadScope(() => {
      latest++
      inputs.clear()
      patchState(store, {
        currentKey: "",
        globalTotal: null,
        globalResult: undefined,
        globalExpires: 0,
        globalLoading: false,
        globalRefreshing: false,
        globalError: undefined,
        sessionRevision: store.sessionRevision() + 1
      })
      // Clears keyed entries before their coordinators reset, so no teardown write reappears.
      pages.reset()
      globalResource.reset()
    })
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
    function requestPage(input: AuditQuery): Observable<Response> {
      switchKey(queryKey(input))
      const request = ++latest,
        pageRequest = ++sequence,
        epoch = scope.generation()
      return query.execute(input).pipe(
        tap(result => {
          if (epoch === scope.generation() && result.success && request === latest)
            acceptGlobal(result.data, pageRequest)
        })
      )
    }
    const pages = createKeyedReads<AuditQuery, AuditPage, AuditLogError>({
      key: queryKey,
      // Resolved per flight: a forced or expired retained key dispatches the latest caller input.
      request: input => requestPage(inputs.get(queryKey(input)) ?? input),
      state: keyedState(
        () => toKeyed(store.entries()),
        next => patchState(store, { entries: fromKeyed(next) })
      ),
      scope,
      ttl,
      // The projection on screen is never evicted to admit another query.
      isPinned: key => key === store.currentKey(),
      normalizeError: () => new AuditLogError("UNEXPECTED"),
      overflow: () => new AuditLogError("UNEXPECTED")
    })
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
          remember(key, input)
          // An admitted key is displayed before its read; a new one is displayed when its own
          // request dispatches, so a refused admission never becomes the current projection.
          if (pages.select(input)) switchKey(key)
          return pages.read(input, force).pipe(map(verified))
        })
      },
      loadGlobalTotal(force = false): Observable<Response> {
        return globalResource.read(force).pipe(map(verified))
      }
    }
  })
)
