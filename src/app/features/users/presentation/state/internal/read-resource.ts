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
import { Result } from "@/app/shared/utils/result"

/** Reactive data lives only in the consumer's state; the coordinator retains flight identity. */
export interface ReadResourceState<T, E> {
  data: T
  loaded: boolean
  /** Includes obsolete overlapping flights until they complete or lose their last subscriber. */
  pendingReads: number
  refreshing: boolean
  expires: number
  error: E | undefined
}

interface ReadResourceOptions<T, E> {
  state: {
    get(): ReadResourceState<T, E>
    update(update: (state: ReadResourceState<T, E>) => Partial<ReadResourceState<T, E>>): void
  }
  initialData(): T
  request(): Observable<Result<T, E>>
  normalizeError(error: unknown): E
  ttl: number
  scope: { check(): boolean; generation(): number; cancelled$: Observable<void> }
}

export function createReadResource<T, E>(options: ReadResourceOptions<T, E>) {
  const { state, scope } = options
  let revision = 0
  let epoch = 0
  let latest = 0
  let flight: Observable<Result<T, E>> | undefined
  let cancelled = new Subject<void>()

  return {
    read(force = false): Observable<Result<T, E>> {
      return defer(() => {
        if (!scope.check()) return EMPTY
        if (flight && !force) return flight
        const current = state.get()
        if (!force && current.loaded && current.expires > Date.now())
          return of(Result.success(current.data))

        const requestId = ++latest,
          requestRevision = revision,
          requestEpoch = epoch,
          generation = scope.generation(),
          reset$ = cancelled
        const sameScope = () => requestEpoch === epoch && generation === scope.generation()
        const isCurrent = () => sameScope() && requestId === latest && requestRevision === revision
        const request = defer(() => {
          state.update(value => ({
            pendingReads: value.pendingReads + 1,
            refreshing: value.loaded,
            error: undefined
          }))
          return defer(options.request)
        }).pipe(
          catchError((error: unknown) => of(Result.failure(options.normalizeError(error)))),
          tap(result => {
            if (!isCurrent()) return
            result.either(
              data =>
                state.update(() => ({
                  data,
                  loaded: true,
                  expires: Date.now() + options.ttl,
                  error: undefined
                })),
              error => state.update(() => ({ error }))
            )
          }),
          takeUntil(scope.cancelled$),
          takeUntil(reset$),
          finalize(() => {
            if (!sameScope()) return
            const currentFlight = flight === request
            if (currentFlight) flight = undefined
            state.update(value => ({
              pendingReads: value.pendingReads - 1,
              ...(currentFlight ? { refreshing: false } : {})
            }))
          }),
          shareReplay({ bufferSize: 1, refCount: true })
        )
        flight = request
        return request
      })
    },
    invalidate() {
      // Detach, do not cancel: existing subscribers still receive their own result.
      revision++
      flight = undefined
      state.update(() => ({ expires: 0, refreshing: false }))
    },
    reset() {
      epoch++
      revision++
      flight = undefined
      const previous = cancelled
      cancelled = new Subject<void>()
      // Reset before cancellation: completion callbacks may synchronously start a new read.
      state.update(() => ({
        data: options.initialData(),
        loaded: false,
        pendingReads: 0,
        refreshing: false,
        expires: 0,
        error: undefined
      }))
      previous.next()
      previous.complete()
    }
  }
}
