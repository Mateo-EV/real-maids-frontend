import { computed, inject, Injector } from "@angular/core"
import { patchState, signalStore, withComputed, withMethods, withState } from "@ngrx/signals"
import {
  catchError,
  defaultIfEmpty,
  defer,
  EMPTY,
  finalize,
  Observable,
  of,
  shareReplay,
  take,
  takeUntil,
  tap
} from "rxjs"
import {
  createSessionReadScope,
  SessionReadScope
} from "@/app/features/auth/presentation/state/session-read-scope"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { Result } from "@/app/shared/utils/result"
import {
  GenerateReportUseCase,
  ListGeneratedReportsUseCase,
  ListReportTypesUseCase
} from "../../application/use-cases/report.use-cases"
import {
  ReportsSettingsError,
  ReportsSettingsErrorCode
} from "../../domain/errors/reports-settings.error"
import { GeneratedReportSummary, ReportTable, ReportType } from "../../domain/models/report.models"
import {
  GenerateReportParams,
  ReportHistoryQuery,
  normalizeGenerateReportParams,
  normalizeReportHistoryQuery,
  reportRequestKey
} from "../../domain/params/reports-settings.params"

type HistoryPage = PaginationResponse<GeneratedReportSummary>
type Read<T> = Result<T, ReportsSettingsError>

/** One finite read entry: verified data, its status and the last safe error. */
export interface ReportsReadEntry<T, K> {
  readonly params: K | undefined
  readonly result: T | undefined
  readonly loading: boolean
  readonly refreshing: boolean
  readonly error: ReportsSettingsError | undefined
}

const failure = <T>(code: ReportsSettingsErrorCode): Read<T> =>
  Result.failure(new ReportsSettingsError(code))
const entry = <T, K>(): ReportsReadEntry<T, K> => ({
  params: undefined,
  result: undefined,
  loading: false,
  refreshing: false,
  error: undefined
})
const typesKey = () => "types"
const queryKey = (query: ReportHistoryQuery) => JSON.stringify([query.offset, query.limit])

interface GroupOptions<T, K> {
  readonly read: () => ReportsReadEntry<T, K>
  readonly write: (patch: Partial<ReportsReadEntry<T, K>>) => void
  readonly key: (params: K) => string
  readonly request: (params: K) => Observable<Read<T>>
  readonly scope: SessionReadScope
}

/**
 * One no-cache read group: sharing is limited to an in-flight read of the same key, so a
 * settled result is never replayed to a later subscriber. `force` supersedes a pending read
 * (detaching it without cancelling it) instead of joining it.
 */
function createGroup<T, K>(options: GroupOptions<T, K>) {
  let revision = 0
  let flight: { key: string; stream: Observable<Read<T>> } | undefined
  return {
    reset(): void {
      revision++
      flight = undefined
    },
    observe(params: K, force = false): Observable<Read<T>> {
      const key = options.key(params)
      return defer(() => {
        // SSR, no session or an expired credential fails closed: no read, no state.
        if (!options.scope.check()) return EMPTY
        if (flight && flight.key === key && !force) return flight.stream
        const generation = options.scope.generation()
        const requestRevision = ++revision
        const current = options.read()
        const sameKey = current.params !== undefined && options.key(current.params) === key
        const previous = sameKey ? current.result : undefined
        options.write({
          params,
          result: previous,
          loading: previous === undefined,
          refreshing: previous !== undefined,
          error: undefined
        })
        const isCurrent = () =>
          generation === options.scope.generation() && requestRevision === revision
        let shared: Observable<Read<T>> | undefined
        // A settled, cancelled or detached read never touches a newer generation's state.
        const settle = () => {
          if (shared !== undefined && flight?.stream === shared) flight = undefined
          if (isCurrent()) options.write({ loading: false, refreshing: false })
        }
        const stream: Observable<Read<T>> = defer(() => options.request(params)).pipe(
          take(1),
          defaultIfEmpty(failure<T>("INVALID_RESPONSE")),
          catchError(() => of(failure<T>("UNEXPECTED"))),
          tap(result => {
            settle()
            if (!isCurrent()) return
            result.either(
              data => options.write({ params, result: data, error: undefined }),
              // A failed revalidation keeps the verified result visible next to its error.
              error => options.write({ error })
            )
          }),
          takeUntil(options.scope.cancelled$),
          finalize(settle),
          shareReplay({ bufferSize: 1, refCount: true })
        )
        shared = stream
        flight = { key, stream }
        return stream
      })
    }
  }
}

const initialState = {
  /** One shared pending gate: a second explicit generation is refused, never queued. */
  _pendingGenerations: 0,
  _types: entry<ReportType[], null>(),
  _history: entry<HistoryPage, ReportHistoryQuery>(),
  _report: entry<ReportTable, GenerateReportParams>()
}

/**
 * Root presentation state for reports (W6, S4, S5, D2-like freshness): the type catalog, the
 * paged generated-report history and the last generated report.
 *
 * There is deliberately **no cross-visit cache and no TTL**: a settled read is never replayed,
 * so mounting the screen reads the catalog and the history once and only an explicit refresh
 * reads them again. The history is a read and never generates.
 *
 * Generating is the exception in this feature: the backend records it, so `generate()` is the
 * only place the generation request is dispatched at all, it refuses a concurrent duplicate
 * and it never retries. Session replacement/expiry clears and fences; same-session renewal
 * preserves; SSR dispatches nothing.
 */
export const ReportsStore = signalStore(
  { providedIn: "root" },
  withState(initialState),
  withComputed(store => ({
    generating: computed(() => store._pendingGenerations() > 0),
    /** Verified catalog types, or none: an unverified catalog offers no choice. */
    reportTypes: computed(() => store._types().result ?? [])
  })),
  withMethods(store => {
    const injector = inject(Injector)
    const groups: { reset(): void }[] = []
    const scope = createSessionReadScope(() => {
      groups.forEach(group => group.reset())
      patchState(store, initialState)
    })
    const types = createGroup<ReportType[], null>({
      read: () => store._types(),
      write: patch => patchState(store, { _types: { ...store._types(), ...patch } }),
      key: typesKey,
      request: () => injector.get(ListReportTypesUseCase).execute(),
      scope
    })
    const history = createGroup<HistoryPage, ReportHistoryQuery>({
      read: () => store._history(),
      write: patch => patchState(store, { _history: { ...store._history(), ...patch } }),
      key: queryKey,
      request: query => injector.get(ListGeneratedReportsUseCase).execute(query),
      scope
    })
    groups.push(types, history)
    const writeReport = (patch: Partial<ReportsReadEntry<ReportTable, GenerateReportParams>>) =>
      patchState(store, { _report: { ...store._report(), ...patch } })
    return {
      selectTypes: (): ReportsReadEntry<ReportType[], null> => store._types(),
      observeTypes(force = false): Observable<Read<ReportType[]>> {
        return types.observe(null, force)
      },
      selectHistory: (): ReportsReadEntry<HistoryPage, ReportHistoryQuery> => store._history(),
      observeHistory(query: ReportHistoryQuery = {}, force = false): Observable<Read<HistoryPage>> {
        const normalized = normalizeReportHistoryQuery(query)
        if (!normalized) return of(failure<HistoryPage>("VALIDATION"))
        return history.observe(normalized, force)
      },
      selectReport: (): ReportsReadEntry<ReportTable, GenerateReportParams> => store._report(),
      /**
       * The only dispatch path of `GET /api/reportes/{tipo}` (S5). Callers are explicit user
       * actions; the action is refused — not queued — while another one is in flight, and it
       * is never retried by this store.
       *
       * Honest scope of that guarantee: it is client-side and per store instance. Another tab
       * or another browser session can still generate independently, and cancelling a
       * subscription cannot undo a generation the backend already recorded. Nothing here claims
       * idempotency, deduplication or rollback.
       */
      generate(params: GenerateReportParams): Observable<Read<ReportTable>> {
        return defer(() => {
          if (!scope.check()) return EMPTY
          const requested = normalizeGenerateReportParams(params)
          if (!requested) return of(failure<ReportTable>("VALIDATION"))
          // The catalog is the only authority on valid types: an unknown type is refused
          // before dispatch instead of asking the backend to reject it.
          const catalog = store._types().result
          if (!catalog || !catalog.some(type => type.type === requested.type))
            return of(failure<ReportTable>("VALIDATION"))
          if (store._pendingGenerations()) return of(failure<ReportTable>("CONFLICT"))
          const generation = scope.generation()
          const current = () => scope.check() && generation === scope.generation()
          patchState(store, { _pendingGenerations: store._pendingGenerations() + 1 })
          writeReport({
            params: requested,
            result: undefined,
            loading: true,
            refreshing: false,
            error: undefined
          })
          return defer(() => injector.get(GenerateReportUseCase).execute(requested)).pipe(
            take(1),
            defaultIfEmpty(failure<ReportTable>("INVALID_RESPONSE")),
            catchError(() => of(failure<ReportTable>("UNEXPECTED"))),
            tap(result => {
              if (!current()) return
              result.either(
                table => writeReport({ params: requested, result: table, error: undefined }),
                error => writeReport({ params: requested, error })
              )
            }),
            takeUntil(scope.cancelled$),
            finalize(() => {
              if (!current()) return
              writeReport({ loading: false, refreshing: false })
              patchState(store, { _pendingGenerations: store._pendingGenerations() - 1 })
            })
          )
        })
      },
      /** Identity of one generation: callers compare it to hide a stale report. */
      reportRequestKey
    }
  })
)
