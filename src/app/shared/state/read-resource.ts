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
import { Result } from "@/app/shared/utils/result"

/** Reactive data lives only in the consumer's state; the coordinator retains flight identity. */
export interface ReadResourceState<T, E> {
  data: T
  loaded: boolean
  /** Optional adapter projection; flight accounting itself is owned by the resource. */
  pendingReads?: number
  refreshing: boolean
  expires: number
  error: E | undefined
}

export interface ReadScope {
  check(): boolean
  generation(): number
  cancelled$: Observable<void>
}

export interface ReadResourceOptions<T, E> {
  state: {
    get(): ReadResourceState<T, E>
    update(update: (state: ReadResourceState<T, E>) => Partial<ReadResourceState<T, E>>): void
  }
  initialData(): T
  request(): Observable<Result<T, E>>
  normalizeError(error: unknown): E
  ttl: number
  scope: ReadScope
  /** Replace detaches older flights without cancelling them; join shares even forced reads. */
  forcePolicy?: "join" | "replace"
  cancelOnInvalidate?: boolean
  obsoleteResult?(result: Result<T, E>): Result<T, E>
}

export interface ReadResource<T, E> {
  read(force?: boolean, request?: () => Observable<Result<T, E>>): Observable<Result<T, E>>
  invalidate(): void
  reset(): void
  readonly pendingReads: number
  isPending(): boolean
}

export function createReadResource<T, E>(options: ReadResourceOptions<T, E>): ReadResource<T, E> {
  const { state, scope } = options
  let revision = 0
  let epoch = 0
  let latest = 0
  let pendingReads = 0
  let flight: Observable<Result<T, E>> | undefined
  let cancelled = new Subject<void>()

  return {
    get pendingReads() {
      return pendingReads
    },
    isPending: () => pendingReads > 0,
    read(force = false, requestFactory = options.request): Observable<Result<T, E>> {
      return defer(() => {
        if (!scope.check()) return EMPTY
        if (flight && (!force || options.forcePolicy === "join")) return flight
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
          pendingReads++
          state.update(value => ({
            pendingReads,
            refreshing: value.loaded,
            error: undefined
          }))
          return defer(requestFactory)
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
          map(result =>
            !isCurrent() && options.obsoleteResult ? options.obsoleteResult(result) : result
          ),
          takeUntil(scope.cancelled$),
          takeUntil(reset$),
          finalize(() => {
            if (!sameScope()) return
            const currentFlight = flight === request
            if (currentFlight) flight = undefined
            pendingReads--
            state.update(() => ({
              pendingReads,
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
      revision++
      flight = undefined
      if (options.cancelOnInvalidate) {
        epoch++
        pendingReads = 0
        const previous = cancelled
        cancelled = new Subject<void>()
        // Publish stale state before completing consumers, which may synchronously read again.
        state.update(() => ({ expires: 0, refreshing: false, pendingReads: 0 }))
        previous.next()
        previous.complete()
      } else {
        // Detach, do not cancel: existing subscribers still receive their own result.
        state.update(() => ({ expires: 0, refreshing: false }))
      }
    },
    reset() {
      epoch++
      revision++
      flight = undefined
      pendingReads = 0
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
