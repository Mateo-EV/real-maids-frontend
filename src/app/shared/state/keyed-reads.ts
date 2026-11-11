import { computed, Signal } from "@angular/core"
import {
  defer,
  EMPTY,
  filter,
  finalize,
  map,
  merge,
  Observable,
  of,
  shareReplay,
  Subject,
  switchMap,
  takeUntil,
  timer
} from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { createReadResource, ReadResource, ReadResourceState, ReadScope } from "./read-resource"

/** Verified result plus read status for one cache key; `query` is the effective query. */
export interface KeyedEntry<Q, T, E> {
  readonly query: Q
  readonly result: T | undefined
  readonly loading: boolean
  readonly refreshing: boolean
  readonly error: E | undefined
  readonly expires: number
}

export interface KeyedState<Q, T, E> {
  get(): Readonly<Record<string, KeyedEntry<Q, T, E>>>
  update(next: Record<string, KeyedEntry<Q, T, E>>): void
  /** Optional reactive projection of the same entries; only `selectReactive` needs it. */
  source?(): Signal<Readonly<Record<string, KeyedEntry<Q, T, E>>>>
}

export type NoSession = "empty" | "failure"

export interface KeyedReadsOptions<Q, T, E> {
  key(query: Q): string
  normalize?(query: Q): Q
  /** Called lazily per flight; `effective` is true once a verified result exists. */
  request(query: Q, context: { effective: boolean }): Observable<Result<T, E>>
  state: KeyedState<Q, T, E>
  scope: ReadScope
  ttl: number
  maxEntries?: number
  /** Placeholder data for an unverified entry; verified data is always request-owned. */
  initialData?(): T
  normalizeError(error: unknown): E
  /** Records effective metadata on success without changing the cache key. */
  adopt?(query: Q, data: T): Q
  overflow(): E
  /** Zero an entry's freshness when a read fails instead of retaining it. */
  expireOnError?: boolean
  /** No-session outcome; defaults to `"empty"` for both paths. */
  noSession?: NoSession
  /** Overrides `noSession` for observation, e.g. a failing read with an empty stream. */
  noSessionObserve?: NoSession
  /** Error used by failure mode; falls back to `overflow()` when absent. */
  noSessionError?(): E
}

export interface KeyedReads<Q, T, E> {
  read(query: Q, force?: boolean): Observable<Result<T, E>>
  observe(query: Q, opts?: { delayMs?: number; force?: boolean }): Observable<Result<T, E>>
  select(query: Q): KeyedEntry<Q, T, E> | undefined
  /** Tracks entries only when `state.source` is supplied; otherwise it follows the query. */
  selectReactive(query: Signal<Q>): Signal<KeyedEntry<Q, T, E> | undefined>
  markMutated(filter?: (entry: KeyedEntry<Q, T, E>) => boolean): void
  reset(): void
  readonly keys: string[]
}

/** Trivial adapter: consumers supply their own state read/write, never a registry-owned store. */
export function keyedState<Q, T, E>(
  getEntries: () => Readonly<Record<string, KeyedEntry<Q, T, E>>>,
  setEntries: (next: Record<string, KeyedEntry<Q, T, E>>) => void,
  source?: () => Signal<Readonly<Record<string, KeyedEntry<Q, T, E>>>>
): KeyedState<Q, T, E> {
  return source
    ? { get: getEntries, update: setEntries, source }
    : { get: getEntries, update: setEntries }
}

type Entries<Q, T, E> = Record<string, KeyedEntry<Q, T, E>>
type ItemResult<T, E> = Result<T | undefined, E>

const emptyEntry = <Q, T, E>(query: Q): KeyedEntry<Q, T, E> => ({
  query,
  result: undefined,
  loading: false,
  refreshing: false,
  error: undefined,
  expires: 0
})

/**
 * Per-key read coordination over `createReadResource`: success-only freshness, bounded
 * history with active-view pinning, one admission outcome, shared flights and mutation
 * refresh batches. Key identity, requests, validation and writes stay in the consumer.
 */
export function createKeyedReads<Q, T, E>(
  options: KeyedReadsOptions<Q, T, E>
): KeyedReads<Q, T, E> {
  const maxEntries = options.maxEntries ?? 20
  const noSession = options.noSession ?? "empty"
  const normalize = (query: Q): Q => (options.normalize ? options.normalize(query) : query)
  const resources = new Map<string, ReadResource<T | undefined, E>>()
  // Observation pins: an active or in-flight key is never evicted to admit a new one.
  const active = new Map<string, number>()
  // Event-local fan-out, not a second cache: a synchronous failure must still reach
  // every active observer exactly once, just like the reference stores.
  const refreshes = new Subject<ReadonlyMap<string, Observable<ItemResult<T, E>>>>()
  const entries = () => options.state.get()
  const isPending = (key: string) => resources.get(key)?.isPending() ?? false
  const oldestEvictable = (next: Entries<Q, T, E>, keep: string) =>
    Object.keys(next).find(
      candidate => candidate !== keep && !active.has(candidate) && !isPending(candidate)
    )
  const refuse = (path: "read" | "observe"): Observable<Result<T, E>> => {
    const mode = path === "observe" ? (options.noSessionObserve ?? noSession) : noSession
    return mode === "empty"
      ? EMPTY
      : of(Result.failure(options.noSessionError ? options.noSessionError() : options.overflow()))
  }

  /** Single admission behavior: prune one oldest inactive entry or refuse the key. */
  const admit = (key: string, query: Q): boolean => {
    const current = entries()
    if (current[key]) return true
    const next = { ...current }
    if (Object.keys(next).length >= maxEntries) {
      const candidate = oldestEvictable(next, key)
      if (candidate === undefined) return false
      delete next[candidate]
      resources.delete(candidate)
    }
    next[key] = emptyEntry<Q, T, E>(query)
    options.state.update(next)
    return true
  }
  /** A cleared or evicted key never resurrects from a late teardown write. */
  const writeEntry = (key: string, entry: KeyedEntry<Q, T, E>) => {
    const current = entries()
    if (!current[key]) return
    const next = { ...current, [key]: entry }
    while (Object.keys(next).length > maxEntries) {
      const candidate = oldestEvictable(next, key)
      if (candidate === undefined) break
      delete next[candidate]
      resources.delete(candidate)
    }
    options.state.update(next)
  }
  const resourceState = (entry: KeyedEntry<Q, T, E>): ReadResourceState<T | undefined, E> => ({
    data: entry.result,
    loaded: entry.result !== undefined,
    refreshing: entry.refreshing,
    error: entry.error,
    expires: entry.expires
  })
  const bind = (key: string, snapshot: Q): ReadResource<T | undefined, E> => {
    const coordinator: ReadResource<T | undefined, E> = createReadResource({
      state: {
        get: () => {
          const entry = entries()[key]
          return resourceState(entry ?? emptyEntry<Q, T, E>(snapshot))
        },
        update: update => {
          const entry = entries()[key]
          // Clearing the registry or evicting history must never be undone by teardown.
          if (!entry || resources.get(key) !== coordinator) return
          const current = resourceState(entry)
          const patch = update(current)
          const settled = "data" in patch || patch.error !== undefined
          const next = { ...current, ...patch }
          writeEntry(key, {
            query:
              "data" in patch && next.data !== undefined && options.adopt
                ? options.adopt(entry.query, next.data)
                : entry.query,
            result: next.data,
            loading:
              !settled && !next.loaded && (next.pendingReads ?? coordinator.pendingReads) > 0,
            refreshing: !settled && next.refreshing,
            error: next.error,
            // Only a successful current result renews freshness.
            expires: options.expireOnError && patch.error !== undefined ? 0 : next.expires
          })
        }
      },
      initialData: () => options.initialData?.(),
      // Resolve at subscribe time so a forced read reuses the adopted effective query.
      request: () =>
        defer(() => {
          const entry = entries()[key]
          const effective = entry?.result !== undefined
          return options.request(effective && entry ? entry.query : snapshot, { effective })
        }),
      normalizeError: options.normalizeError,
      ttl: options.ttl,
      scope: options.scope,
      forcePolicy: "join",
      cancelOnInvalidate: true
    })
    return coordinator
  }
  const ensure = (key: string, snapshot: Q): ReadResource<T | undefined, E> => {
    let resource = resources.get(key)
    if (!resource) {
      resource = bind(key, snapshot)
      resources.set(key, resource)
    }
    return resource
  }
  const readDeferred = (snapshot: Q, key: string, force: boolean): Observable<ItemResult<T, E>> => {
    if (!options.scope.check()) return refuse("read")
    if (!admit(key, snapshot)) return of(Result.failure(options.overflow()))
    return ensure(key, snapshot).read(force)
  }
  const read = (query: Q, force = false): Observable<Result<T, E>> => {
    const snapshot = normalize(query)
    const key = options.key(snapshot)
    // A successful read always carries request data; only unverified entries are undefined.
    return defer(() => readDeferred(snapshot, key, force)) as Observable<Result<T, E>>
  }
  const observe = (
    query: Q,
    opts: { delayMs?: number; force?: boolean } = {}
  ): Observable<Result<T, E>> => {
    const snapshot = normalize(query)
    const key = options.key(snapshot)
    const delayMs = opts.delayMs ?? 0
    const force = opts.force ?? false
    return defer((): Observable<ItemResult<T, E>> => {
      if (!options.scope.check()) return refuse("observe")
      if (!active.has(key) && active.size >= maxEntries)
        return of(Result.failure(options.overflow()))
      if (!admit(key, snapshot)) return of(Result.failure(options.overflow()))
      active.set(key, (active.get(key) ?? 0) + 1)
      const entry = entries()[key]
      // Deferred reads show their pending state before the timer fires.
      if (delayMs > 0 && !isPending(key) && (force || !entry || entry.expires <= Date.now()))
        writeEntry(key, {
          ...(entry ?? emptyEntry<Q, T, E>(snapshot)),
          loading: entry?.result === undefined,
          refreshing: entry?.result !== undefined,
          error: undefined
        })
      const refreshes$ = refreshes.pipe(
        map(batch => batch.get(key)),
        filter((flight): flight is Observable<ItemResult<T, E>> => flight !== undefined)
      )
      const initial$ = (delayMs > 0 ? timer(delayMs) : of(0)).pipe(
        map(() => readDeferred(snapshot, key, force))
      )
      return merge(refreshes$, initial$).pipe(
        switchMap(value => value),
        takeUntil(options.scope.cancelled$),
        finalize(() => {
          const remaining = (active.get(key) ?? 1) - 1
          if (remaining) active.set(key, remaining)
          else {
            active.delete(key)
            const current = entries()[key]
            if (current && !isPending(key))
              writeEntry(key, { ...current, loading: false, refreshing: false })
          }
        })
      )
    }) as Observable<Result<T, E>>
  }
  const select = (query: Q): KeyedEntry<Q, T, E> | undefined =>
    entries()[options.key(normalize(query))]
  const markMutated = (filter?: (entry: KeyedEntry<Q, T, E>) => boolean) => {
    const generation = options.scope.generation()
    const current = () => generation === options.scope.generation()
    // Only existing entries are invalidated; a missing key is never admitted by a mutation.
    const keys = [...resources.keys()].filter(key => {
      const entry = entries()[key]
      return entry !== undefined && (!filter || filter(entry))
    })
    for (const key of keys) {
      if (!current()) return
      resources.get(key)?.invalidate()
    }
    const batch = new Map<string, Observable<ItemResult<T, E>>>()
    for (const key of keys) {
      if (!current()) return
      const resource = resources.get(key)
      // One lazy flight per observed key; each observer subscribes to the same batch.
      if (active.has(key) && resource)
        batch.set(key, resource.read(true).pipe(shareReplay({ bufferSize: 1, refCount: true })))
    }
    if (current()) refreshes.next(batch)
  }
  const reset = () => {
    const previous = [...resources.values()]
    resources.clear()
    active.clear()
    options.state.update({})
    // Reset after clearing: teardown writes from old coordinators are already fenced.
    previous.forEach(resource => resource.reset())
  }
  return {
    read,
    observe,
    select,
    selectReactive: (query: Signal<Q>) => {
      const source = options.state.source?.()
      return source
        ? computed(() => source()[options.key(normalize(query()))])
        : computed(() => select(query()))
    },
    markMutated,
    reset,
    get keys() {
      return Object.keys(entries())
    }
  }
}
