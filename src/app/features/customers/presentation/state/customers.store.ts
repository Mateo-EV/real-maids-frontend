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
  take,
  takeUntil,
  tap
} from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { CustomerListQuery } from "../../domain/models/customer-list-query"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { createKeyedReads, KeyedEntry, keyedState } from "@/app/shared/state/keyed-reads"
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
type KeyedDetail = KeyedEntry<number, Customer, CustomerError>
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
/**
 * Inverse of `customerQueryKey`: the normalized query a stored key identifies. Reading an
 * existing key needs that identity, because the entry records the adopted effective page.
 */
const queryFromCustomerKey = (key: string): CustomerListQuery => {
  const [offset, limit, search, type] = JSON.parse(key) as [
    number,
    number,
    string | null,
    CustomerListQuery["type"] | null
  ]
  return normalizeQuery({
    offset,
    limit,
    ...(search === null ? {} : { search }),
    ...(type === null ? {} : { type })
  })
}
const toCustomerError = (error: unknown) =>
  error instanceof CustomerError ? error : new CustomerError("UNEXPECTED")
/** Details keep their public shape; only these adapters speak `KeyedEntry`. */
const toKeyedDetails = (details: Readonly<Record<number, CustomerReadEntry<Customer>>>) => {
  const keyed: Record<string, KeyedDetail> = {}
  for (const [key, entry] of Object.entries(details))
    keyed[key] = {
      query: Number(key),
      result: entry.result,
      loading: entry.loading,
      refreshing: entry.refreshing,
      error: entry.error,
      expires: entry.expires
    }
  return keyed
}
const fromKeyedDetails = (entries: Readonly<Record<string, KeyedDetail>>) => {
  const details: Record<number, CustomerReadEntry<Customer>> = {}
  for (const [key, entry] of Object.entries(entries))
    details[Number(key)] = {
      result: entry.result,
      loading: entry.loading,
      refreshing: entry.refreshing,
      error: entry.error,
      expires: entry.expires
    }
  return details
}
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
    const scope = createSessionReadScope(() => {
      // Keyed state is cleared before the coordinators reset, so no teardown write reappears.
      pages.reset()
      details.reset()
      patchState(store, initialState)
    })
    const pages = createKeyedReads<CustomerListQuery, Page, CustomerError>({
      key: customerQueryKey,
      normalize: normalizeQuery,
      request: query =>
        injector
          .get(ListCustomersUseCase)
          .execute(query)
          .pipe(take(1), defaultIfEmpty(Result.failure(new CustomerError("INVALID_RESPONSE")))),
      // The cache key stays the requested page; the entry records the effective one.
      adopt: (query, data) => ({ ...query, offset: data.offset, limit: data.limit }),
      state: keyedState<CustomerListQuery, Page, CustomerError>(
        () => store.entries(),
        next => patchState(store, { entries: next })
      ),
      scope,
      ttl: 120000,
      // The page on screen is the only pinning difference from oldest-inactive eviction.
      isPinned: key => key === store.currentPageKey(),
      expireOnError: true,
      noSession: "failure",
      noSessionObserve: "empty",
      noSessionError: () => new CustomerError("UNAUTHENTICATED"),
      normalizeError: toCustomerError,
      overflow: () => new CustomerError("UNEXPECTED")
    })
    const details = createKeyedReads<number, Customer, CustomerError>({
      key: id => String(id),
      request: id =>
        injector
          .get(GetCustomerByIdUseCase)
          .execute(id)
          .pipe(take(1), defaultIfEmpty(Result.failure(new CustomerError("INVALID_RESPONSE")))),
      state: keyedState<number, Customer, CustomerError>(
        () => toKeyedDetails(store.details()),
        next => patchState(store, { details: fromKeyedDetails(next) })
      ),
      scope,
      ttl: 120000,
      // The selected profile is the only pinning difference from oldest-inactive eviction.
      isPinned: key => Number(key) === store.selectedId(),
      expireOnError: true,
      noSession: "failure",
      noSessionObserve: "empty",
      noSessionError: () => new CustomerError("UNAUTHENTICATED"),
      normalizeError: toCustomerError,
      overflow: () => new CustomerError("UNEXPECTED")
    })
    const readPage = (query: CustomerListQuery = {}, force = false): Observable<PageResult> =>
      pages.read(query, force)
    const readCustomer = (id: number, force = false): Observable<DetailResult> =>
      details.read(id, force)
    const invalidateCustomers = (customerId?: number): void => {
      if (!scope.check()) return
      pages.markMutated()
      // A customer-specific invalidation touches only that profile; a broad one touches all.
      details.markMutated(entry => customerId === undefined || entry.query === customerId)
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
          patchState(store, { currentPageKey: key })
          // The stored key's own query keeps the request on the adopted effective page.
          return pages.read(snapshot ?? queryFromCustomerKey(key), force)
        })
      },
      loadCustomer(id: number, force = false): Observable<DetailResult> {
        return defer(() => {
          if (!scope.check()) return of(Result.failure(new CustomerError("UNAUTHENTICATED")))
          patchState(store, { selectedId: id })
          return details.read(id, force)
        })
      },
      observeQuery(query: CustomerListQuery = {}, force = false): Observable<PageResult> {
        return defer(() => {
          if (!scope.check()) return EMPTY
          return pages.observe(query, { force })
        })
      },
      observeCustomer(id: number, force = false): Observable<DetailResult> {
        return defer(() => {
          if (!scope.check()) return EMPTY
          return details.observe(id, { force })
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
