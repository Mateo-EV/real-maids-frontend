import { isPlatformBrowser } from "@angular/common"
import { computed, DestroyRef, inject, Injector, PLATFORM_ID } from "@angular/core"
import { patchState, signalStore, withComputed, withMethods, withState } from "@ngrx/signals"
import {
  catchError,
  defer,
  EMPTY,
  finalize,
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
    const injector = inject(Injector),
      destroyRef = inject(DestroyRef)
    const browser = isPlatformBrowser(inject(PLATFORM_ID))
    const flights = new Map<string, Observable<Response>>()
    const cancelled = new Subject<void>()
    let globalFlight: Observable<Response> | undefined
    let latest = 0,
      sequence = 0,
      globalSequence = 0,
      generation = 0
    let observing = false,
      sessionKey: string | null = null
    const identity = (session: AuthSession | null) =>
      session && (session.expiresAt === null || session.expiresAt > Date.now())
        ? JSON.stringify([session.id, session.email, session.expiresAt])
        : null
    const clear = () => {
      generation++
      latest++
      flights.clear()
      globalFlight = undefined
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
      cancelled.next()
    }
    const acceptSession = (session: AuthSession | null) => {
      const key = identity(session)
      if (key === sessionKey) return
      sessionKey = key
      clear()
    }
    const checkSession = () => {
      if (!browser) return false
      // Auth must be acquired before observing source changes (restoration can publish synchronously).
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
    const update = (key: string, entry: AuditEntry) =>
      patchState(store, { entries: { ...store.entries(), [key]: entry } })
    const admit = (key: string) => {
      if (store.entries()[key]) return true
      const entries = { ...store.entries() }
      if (Object.keys(entries).length >= 20) {
        const oldest = Object.keys(entries).find(
          candidate => candidate !== store.currentKey() && !flights.has(candidate)
        )
        if (!oldest) return false
        delete entries[oldest]
      }
      patchState(store, { entries: { ...entries, [key]: emptyEntry } })
      return true
    }
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
    return {
      load(params: AuditQuery, force = false): Observable<Response> {
        const input = { ...params },
          key = queryKey(input)
        return defer(() => {
          if (!checkSession()) return EMPTY
          if (!admit(key)) return of(Result.failure(new AuditLogError("UNEXPECTED")))
          if (store.currentKey() !== key) {
            latest++
            patchState(store, { currentKey: key })
          }
          const entry = store.entries()[key]
          const existing = flights.get(key)
          if (existing) return existing
          if (!force && entry.result && Date.now() < entry.expires)
            return of(Result.success(entry.result))
          const request = ++latest,
            globalRequest = ++sequence,
            epoch = generation
          update(key, {
            ...entry,
            loading: !entry.result,
            refreshing: !!entry.result,
            error: undefined
          })
          const flight = defer(() => query.execute(input)).pipe(
            catchError(() => of(Result.failure(new AuditLogError("UNEXPECTED")))),
            takeUntil(cancelled),
            tap(result => {
              if (epoch !== generation) return
              const current = store.entries()[key]
              if (result.success) {
                update(key, {
                  ...current,
                  result: result.data,
                  expires: Date.now() + ttl,
                  error: undefined
                })
                if (request === latest) acceptGlobal(result.data, globalRequest)
              } else update(key, { ...current, error: result.error })
            }),
            finalize(() => {
              if (epoch !== generation) return
              flights.delete(key)
              update(key, { ...store.entries()[key], loading: false, refreshing: false })
            }),
            shareReplay({ bufferSize: 1, refCount: true })
          )
          flights.set(key, flight)
          return flight
        })
      },
      loadGlobalTotal(force = false): Observable<Response> {
        return defer(() => {
          if (!checkSession()) return EMPTY
          if (globalFlight) return globalFlight
          const cached = store.globalResult()
          if (!force && cached && Date.now() < store.globalExpires())
            return of(Result.success(cached))
          const request = ++sequence,
            epoch = generation
          patchState(store, {
            globalLoading: store.globalTotal() === null,
            globalRefreshing: store.globalTotal() !== null,
            globalError: undefined
          })
          globalFlight = defer(() => query.execute({ page: 0, size: 1 })).pipe(
            catchError(() => of(Result.failure(new AuditLogError("UNEXPECTED")))),
            takeUntil(cancelled),
            tap(result => {
              if (epoch !== generation) return
              if (result.success) acceptGlobal(result.data, request)
              else if (request >= globalSequence) patchState(store, { globalError: result.error })
            }),
            finalize(() => {
              if (epoch !== generation) return
              globalFlight = undefined
              patchState(store, { globalLoading: false, globalRefreshing: false })
            }),
            shareReplay({ bufferSize: 1, refCount: true })
          )
          return globalFlight
        })
      }
    }
  })
)
