import { computed, DestroyRef, inject, Injector } from "@angular/core"
import { patchState, signalStore, withComputed, withMethods, withState } from "@ngrx/signals"
import {
  catchError,
  defaultIfEmpty,
  defer,
  EMPTY,
  filter,
  finalize,
  merge,
  Observable,
  of,
  shareReplay,
  Subject,
  switchMap,
  take,
  takeUntil,
  tap
} from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { CustomerListQuery } from "../../domain/models/customer-list-query"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import {
  createReadResource,
  ReadResource,
  ReadResourceState
} from "@/app/shared/state/read-resource"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { CreateCustomerUseCase } from "../../application/use-cases/create-customer.use-case"
import { SetCustomerStatusUseCase } from "../../application/use-cases/set-customer-status.use-case"
import { GetCustomerByIdUseCase } from "../../application/use-cases/get-customer-by-id.use-case"
import { ListCustomersUseCase } from "../../application/use-cases/list-customers.use-case"
import { UpdateCustomerUseCase } from "../../application/use-cases/update-customer.use-case"
import { LinkCustomerAccountUseCase } from "../../application/use-cases/link-customer-account.use-case"
import { Customer } from "../../domain/entities/customer.entity"
import { CustomerError } from "../../domain/errors/customer.error"
import {
  CreateCustomerParams,
  UpdateCustomerParams,
  SetCustomerStatusParams,
  LinkCustomerAccountParams
} from "../../domain/params/customer.params"
import { CustomerHistoryStore } from "./customer-history.store"

type Page = PaginationResponse<Customer>
type PageResult = Result<Page, CustomerError>
type DetailResult = Result<Customer, CustomerError>
export interface CustomerReadEntry<T> {
  readonly result: T | undefined
  readonly loading: boolean
  readonly refreshing: boolean
  readonly error: CustomerError | undefined
  readonly expires: number
}
export interface CustomerPageEntry extends CustomerReadEntry<Page> {
  readonly query: CustomerListQuery
}
const emptyEntry = <T>(): CustomerReadEntry<T> => ({
  result: undefined,
  loading: false,
  refreshing: false,
  error: undefined,
  expires: 0
})
const normalizeQuery = (query: CustomerListQuery): CustomerListQuery => {
  const search = query.search?.trim()
  return {
    offset: query.offset ?? 0,
    limit: query.limit ?? 20,
    ...(search ? { search } : {}),
    ...(query.type !== undefined ? { type: query.type } : {})
  }
}
export const customerQueryKey = (query: CustomerListQuery) => {
  const q = normalizeQuery(query)
  return JSON.stringify([q.offset, q.limit, q.search ?? null, q.type ?? null])
}
const resourceState = <T>(
  entry: CustomerReadEntry<T>
): ReadResourceState<T | undefined, CustomerError> => ({
  data: entry.result,
  loaded: entry.result !== undefined,
  refreshing: entry.refreshing,
  expires: entry.expires,
  error: entry.error
})
const toCustomerError = (error: unknown) =>
  error instanceof CustomerError ? error : new CustomerError("UNEXPECTED")
interface CustomersState {
  readonly entries: Readonly<Record<string, CustomerPageEntry>>
  readonly details: Readonly<Record<number, CustomerReadEntry<Customer>>>
  readonly currentPageKey: string | null
  readonly selectedId: number | null
  readonly writePending: number
  readonly writeError: CustomerError | null
  readonly successMessage: string | null
}
const initialState: CustomersState = {
  entries: {},
  details: {},
  currentPageKey: null,
  selectedId: null,
  writePending: 0,
  writeError: null,
  successMessage: null
}

export const CustomersStore = signalStore(
  { providedIn: "root" },
  withState(initialState),
  withComputed(store => {
    const current = computed(() =>
      store.currentPageKey() === null ? undefined : store.entries()[store.currentPageKey()!]
    )
    const selected = computed(() =>
      store.selectedId() === null ? undefined : store.details()[store.selectedId()!]
    )
    return {
      customers: computed(() => current()?.result?.items ?? []),
      total: computed(() => current()?.result?.total ?? null),
      offset: computed(() => current()?.result?.offset ?? null),
      limit: computed(() => current()?.result?.limit ?? null),
      currentQuery: computed(() => (current()?.result ? current()!.query : null)),
      loaded: computed(() => current()?.result !== undefined),
      selectedCustomer: computed(() => selected()?.result ?? null),
      loading: computed(
        () =>
          store.writePending() > 0 ||
          Object.values(store.entries()).some(e => e.loading) ||
          Object.values(store.details()).some(e => e.loading)
      ),
      refreshing: computed(() => !!current()?.refreshing),
      writeLoading: computed(() => store.writePending() > 0),
      error: computed(() => store.writeError() ?? current()?.error ?? selected()?.error ?? null),
      isEmpty: computed(
        () => current()?.result?.total === 0 && !current()?.loading && !current()?.error
      )
    }
  }),
  withMethods(store => {
    const injector = inject(Injector)
    const pages = new Map<string, ReadResource<Page | undefined, CustomerError>>()
    const details = new Map<number, ReadResource<Customer | undefined, CustomerError>>()
    const activePages = new Map<string, number>()
    const activeDetails = new Map<number, number>()
    interface Invalidation {
      pages: Map<string, Observable<PageResult>>
      details: Map<number, Observable<DetailResult>>
    }
    const invalidations = new Subject<Invalidation | null>()
    inject(DestroyRef).onDestroy(() => invalidations.complete())
    const scope = createSessionReadScope(() => {
      const previous = [...pages.values(), ...details.values()]
      pages.clear()
      details.clear()
      patchState(store, initialState)
      previous.forEach(resource => resource.reset())
      invalidations.next(null)
    })
    const admitPage = (key: string, query: CustomerListQuery) => {
      if (store.entries()[key]) return
      const entries = { ...store.entries() }
      if (Object.keys(entries).length >= 20) {
        const oldest = Object.keys(entries).find(
          k => k !== store.currentPageKey() && !activePages.has(k) && !pages.get(k)?.isPending()
        )
        if (oldest === undefined)
          throw new Error("At most 20 customer pages can be active concurrently")
        delete entries[oldest]
        pages.delete(oldest)
      }
      patchState(store, { entries: { ...entries, [key]: { ...emptyEntry<Page>(), query } } })
    }
    const admitDetail = (id: number) => {
      if (store.details()[id]) return
      const entries = { ...store.details() }
      if (Object.keys(entries).length >= 20) {
        const oldest = Object.keys(entries)
          .map(Number)
          .find(
            k => k !== store.selectedId() && !activeDetails.has(k) && !details.get(k)?.isPending()
          )
        if (oldest === undefined)
          throw new Error("At most 20 customer details can be active concurrently")
        delete entries[oldest]
        details.delete(oldest)
      }
      patchState(store, { details: { ...entries, [id]: emptyEntry<Customer>() } })
    }
    const readPageKey = (
      key: string,
      query: CustomerListQuery,
      force = false
    ): Observable<PageResult> =>
      defer(() => {
        if (!scope.check()) return of(Result.failure(new CustomerError("UNAUTHENTICATED")))
        admitPage(key, query)
        let resource = pages.get(key)
        if (!resource) {
          const coordinator = createReadResource<Page | undefined, CustomerError>({
            state: {
              get: () => resourceState(store.entries()[key]),
              update: update => {
                const entry = store.entries()[key]
                if (!entry || pages.get(key) !== coordinator) return
                const patch = update(resourceState(entry))
                const next = { ...resourceState(entry), ...patch }
                const settled = "data" in patch || patch.error !== undefined
                patchState(store, {
                  entries: {
                    ...store.entries(),
                    [key]: {
                      result: next.data,
                      query: patch.data
                        ? { ...entry.query, offset: patch.data.offset, limit: patch.data.limit }
                        : entry.query,
                      loading:
                        !settled &&
                        (next.pendingReads ?? coordinator.pendingReads) > 0 &&
                        !next.loaded,
                      refreshing: !settled && next.refreshing,
                      expires: patch.error ? 0 : next.expires,
                      error: next.error
                    }
                  }
                })
              }
            },
            initialData: () => undefined,
            request: () =>
              injector
                .get(ListCustomersUseCase)
                .execute(store.entries()[key].query)
                .pipe(
                  take(1),
                  defaultIfEmpty(Result.failure(new CustomerError("INVALID_RESPONSE")))
                ),
            normalizeError: toCustomerError,
            ttl: 120000,
            scope,
            forcePolicy: "join",
            cancelOnInvalidate: true
          })
          resource = coordinator
          pages.set(key, coordinator)
        }
        return resource.read(force) as Observable<PageResult>
      })
    const readPage = (query: CustomerListQuery = {}, force = false) => {
      const snapshot = normalizeQuery(query)
      return readPageKey(customerQueryKey(snapshot), snapshot, force)
    }
    const readCustomer = (id: number, force = false): Observable<DetailResult> =>
      defer(() => {
        if (!scope.check()) return of(Result.failure(new CustomerError("UNAUTHENTICATED")))
        admitDetail(id)
        let resource = details.get(id)
        if (!resource) {
          const coordinator = createReadResource<Customer | undefined, CustomerError>({
            state: {
              get: () => resourceState(store.details()[id]),
              update: update => {
                const entry = store.details()[id]
                if (!entry || details.get(id) !== coordinator) return
                const patch = update(resourceState(entry))
                const next = { ...resourceState(entry), ...patch }
                const settled = "data" in patch || patch.error !== undefined
                patchState(store, {
                  details: {
                    ...store.details(),
                    [id]: {
                      result: next.data,
                      loading:
                        !settled &&
                        (next.pendingReads ?? coordinator.pendingReads) > 0 &&
                        !next.loaded,
                      refreshing: !settled && next.refreshing,
                      expires: patch.error ? 0 : next.expires,
                      error: next.error
                    }
                  }
                })
              }
            },
            initialData: () => undefined,
            request: () =>
              injector
                .get(GetCustomerByIdUseCase)
                .execute(id)
                .pipe(
                  take(1),
                  defaultIfEmpty(Result.failure(new CustomerError("INVALID_RESPONSE")))
                ),
            normalizeError: toCustomerError,
            ttl: 120000,
            scope,
            forcePolicy: "join",
            cancelOnInvalidate: true
          })
          resource = coordinator
          details.set(id, coordinator)
        }
        return resource.read(force) as Observable<DetailResult>
      })
    const invalidateCustomers = (customerId?: number): void => {
      if (!scope.check()) return
      const generation = scope.generation()
      const current = () => scope.check() && generation === scope.generation()
      const event: Invalidation = { pages: new Map(), details: new Map() }
      pages.forEach((resource, key) => {
        if (!current()) return
        resource.invalidate()
        const entry = store.entries()[key]
        if (activePages.has(key) && entry)
          event.pages.set(
            key,
            defer(() => (current() ? readPageKey(key, entry.query) : EMPTY)).pipe(
              shareReplay({ bufferSize: 1, refCount: true })
            )
          )
      })
      details.forEach((resource, id) => {
        if (!current() || (customerId !== undefined && customerId !== id)) return
        resource.invalidate()
        if (activeDetails.has(id))
          event.details.set(
            id,
            defer(() => (current() ? readCustomer(id) : EMPTY)).pipe(
              shareReplay({ bufferSize: 1, refCount: true })
            )
          )
      })
      if (current()) invalidations.next(event)
    }
    const mutate = (
      request: () => Observable<DetailResult>,
      message: string,
      history: boolean
    ): Observable<DetailResult> =>
      defer(() => {
        if (!scope.check()) return of(Result.failure(new CustomerError("UNAUTHENTICATED")))
        const generation = scope.generation()
        patchState(store, {
          writePending: store.writePending() + 1,
          writeError: null,
          successMessage: null
        })
        return defer(request).pipe(
          take(1),
          defaultIfEmpty(Result.failure(new CustomerError("INVALID_RESPONSE"))),
          catchError(error => of(Result.failure(toCustomerError(error)))),
          takeUntil(scope.cancelled$),
          tap(result => {
            if (!scope.check() || generation !== scope.generation()) return
            if (!result.success) {
              patchState(store, { writeError: result.error })
              return
            }
            const customer = result.data
            // The returned profile is verified, but does not establish page membership or totals.
            const selected = store.details()[customer.id]
            if (selected)
              patchState(store, {
                details: {
                  ...store.details(),
                  [customer.id]: { ...selected, result: customer, error: undefined }
                }
              })
            patchState(store, { successMessage: message })
            invalidateCustomers(customer.id)
            // Observer feedback may synchronously log out or replace the session.
            if (history && scope.check() && generation === scope.generation())
              injector.get(CustomerHistoryStore).invalidateCustomer(customer.id)
          }),
          finalize(() => {
            if (generation === scope.generation())
              patchState(store, { writePending: store.writePending() - 1 })
          })
        )
      })
    return {
      readPage,
      readCustomer,
      selectQuery: (query: CustomerListQuery = {}): CustomerPageEntry =>
        store.entries()[customerQueryKey(query)] ?? {
          ...emptyEntry<Page>(),
          query: normalizeQuery(query)
        },
      selectCustomer: (id: number): CustomerReadEntry<Customer> =>
        store.details()[id] ?? emptyEntry<Customer>(),
      loadCustomers(query?: CustomerListQuery, force = false): Observable<PageResult> {
        const snapshot = query === undefined ? undefined : normalizeQuery(query)
        return defer(() => {
          if (!scope.check()) return of(Result.failure(new CustomerError("UNAUTHENTICATED")))
          const key = snapshot
            ? customerQueryKey(snapshot)
            : (store.currentPageKey() ?? customerQueryKey({}))
          const requested = snapshot ?? store.entries()[key]?.query ?? normalizeQuery({})
          patchState(store, { currentPageKey: key })
          return readPageKey(key, requested, force)
        })
      },
      loadCustomer(id: number, force = false): Observable<DetailResult> {
        return defer(() => {
          if (!scope.check()) return of(Result.failure(new CustomerError("UNAUTHENTICATED")))
          patchState(store, { selectedId: id })
          return readCustomer(id, force)
        })
      },
      observeQuery(query: CustomerListQuery = {}, force = false): Observable<PageResult> {
        const snapshot = normalizeQuery(query),
          key = customerQueryKey(snapshot)
        return defer(() => {
          if (!scope.check()) return EMPTY
          admitPage(key, snapshot)
          activePages.set(key, (activePages.get(key) ?? 0) + 1)
          return merge(invalidations, of("initial" as const)).pipe(
            switchMap(event =>
              event === "initial"
                ? readPageKey(key, snapshot, force)
                : (event?.pages.get(key) ?? EMPTY)
            ),
            takeUntil(scope.cancelled$),
            finalize(() => {
              const count = (activePages.get(key) ?? 1) - 1
              if (count) activePages.set(key, count)
              else activePages.delete(key)
            })
          )
        })
      },
      observeCustomer(id: number, force = false): Observable<DetailResult> {
        return defer(() => {
          if (!scope.check()) return EMPTY
          admitDetail(id)
          activeDetails.set(id, (activeDetails.get(id) ?? 0) + 1)
          return merge(invalidations, of("initial" as const)).pipe(
            filter(event => event === "initial" || event === null || event.details.has(id)),
            switchMap(event =>
              event === "initial" ? readCustomer(id, force) : (event?.details.get(id) ?? EMPTY)
            ),
            takeUntil(scope.cancelled$),
            finalize(() => {
              const count = (activeDetails.get(id) ?? 1) - 1
              if (count) activeDetails.set(id, count)
              else activeDetails.delete(id)
            })
          )
        })
      },
      invalidateCustomers,
      createCustomer: (params: CreateCustomerParams) =>
        mutate(
          () => injector.get(CreateCustomerUseCase).execute(params),
          "Customer created successfully",
          false
        ),
      updateCustomer: (params: UpdateCustomerParams) =>
        mutate(
          () => injector.get(UpdateCustomerUseCase).execute(params),
          "Customer updated successfully",
          true
        ),
      setCustomerStatus: (params: SetCustomerStatusParams) =>
        mutate(
          () => injector.get(SetCustomerStatusUseCase).execute(params),
          "Customer status updated successfully",
          true
        ),
      linkCustomerAccount: (params: LinkCustomerAccountParams) =>
        mutate(
          () => injector.get(LinkCustomerAccountUseCase).execute(params),
          "Customer account linked successfully",
          true
        ),
      clearFeedback() {
        scope.check()
        patchState(store, { writeError: null, successMessage: null })
      }
    }
  })
)
