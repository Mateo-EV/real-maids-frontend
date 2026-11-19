import { inject, Injector } from "@angular/core"
import { patchState, signalStore, withMethods, withState } from "@ngrx/signals"
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
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { Result } from "@/app/shared/utils/result"
import { GetDashboardUseCase } from "../../application/use-cases/get-dashboard.use-case"
import { DashboardError } from "../../domain/errors/dashboard.error"
import { DashboardView } from "../../domain/models/dashboard-views"
import { DashboardParams, normalizeDashboardParams } from "../../domain/params/dashboard.params"

type Read = Result<DashboardView, DashboardError>

const failure = (code: DashboardError["code"]): Read => Result.failure(new DashboardError(code))
const windowKey = (params: DashboardParams) =>
  JSON.stringify([params.fromDate ?? null, params.toDate ?? null])

/**
 * Internal `_params` records which window the verified entry belongs to, so numbers
 * from one window are never presented as another window's dashboard.
 */
const initialState = {
  _params: undefined as DashboardParams | undefined,
  result: undefined as DashboardView | undefined,
  loading: false,
  refreshing: false,
  error: undefined as DashboardError | undefined,
  verifiedAt: undefined as number | undefined
}

/**
 * Root read state for the dashboard (W3, D2, S6, S9): one finite entry with no
 * cross-visit cache and no TTL. Every caller-owned subscription reads — or joins the
 * one in-flight read of the same window — and only an explicit `force` supersedes a
 * pending read. A failed revalidation keeps the verified result and its instant
 * visible, so a verified zero never degrades into "no data", and the last
 * unsubscribe releases the request. Session replacement/expiry clears and fences;
 * SSR or a missing/expired credential dispatches nothing; same-session credential
 * renewal preserves the entry. Screens own their subscriptions.
 */
export const DashboardStore = signalStore(
  { providedIn: "root" },
  withState(initialState),
  withMethods(store => {
    const injector = inject(Injector)
    let revision = 0
    let flight: { key: string; stream: Observable<Read> } | undefined
    const clear = () => {
      revision++
      flight = undefined
      patchState(store, initialState)
    }
    const scope = createSessionReadScope(clear)
    return {
      observe(params: DashboardParams = {}, force = false): Observable<Read> {
        // Call-time capture; the transport uses the same normalizer, so both refuse alike.
        const window = normalizeDashboardParams(params)
        if (window === undefined) return of(failure("VALIDATION"))
        const key = windowKey(window)
        return defer(() => {
          // SSR, no session or an expired credential fails closed: no read, no state.
          if (!scope.check()) return EMPTY
          // Sharing is limited to an in-flight read of the same window: a settled read
          // is never replayed, because this store keeps no cross-visit cache. `force`
          // only supersedes a pending read, detaching it without cancelling it.
          if (flight && flight.key === key && !force) return flight.stream
          const generation = scope.generation()
          const requestRevision = ++revision
          const sameWindow = store._params() !== undefined && windowKey(store._params()!) === key
          const previous = sameWindow ? store.result() : undefined
          const previousVerifiedAt = sameWindow ? store.verifiedAt() : undefined
          patchState(store, {
            _params: window,
            result: previous,
            verifiedAt: previousVerifiedAt,
            loading: previous === undefined,
            refreshing: previous !== undefined,
            error: undefined
          })
          const current = () => generation === scope.generation() && requestRevision === revision
          let shared: Observable<Read> | undefined
          // A settled, cancelled or detached read never touches a newer generation's state.
          const settle = () => {
            if (shared !== undefined && flight?.stream === shared) flight = undefined
            if (current()) patchState(store, { loading: false, refreshing: false })
          }
          const read: Observable<Read> = defer(() =>
            injector.get(GetDashboardUseCase).execute(window)
          ).pipe(
            take(1),
            defaultIfEmpty(failure("INVALID_RESPONSE")),
            catchError(() => of(failure("UNEXPECTED"))),
            tap(result => {
              settle()
              if (!current()) return
              result.either(
                view =>
                  patchState(store, { result: view, verifiedAt: Date.now(), error: undefined }),
                // The verified result and its instant survive a failed revalidation.
                error => patchState(store, { error })
              )
            }),
            takeUntil(scope.cancelled$),
            finalize(settle),
            shareReplay({ bufferSize: 1, refCount: true })
          )
          shared = read
          flight = { key, stream: read }
          return read
        })
      }
    }
  })
)
