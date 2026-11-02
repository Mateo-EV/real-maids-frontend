import { computed, inject } from "@angular/core"
import { patchState, signalStore, withComputed, withMethods, withState } from "@ngrx/signals"
import { catchError, defer, finalize, Observable, of, takeUntil, tap } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { CreateCustomerUseCase } from "../../application/use-cases/create-customer.use-case"
import { SetCustomerStatusUseCase } from "../../application/use-cases/set-customer-status.use-case"
import { GetCustomerByIdUseCase } from "../../application/use-cases/get-customer-by-id.use-case"
import { ListCustomersUseCase } from "../../application/use-cases/list-customers.use-case"
import { UpdateCustomerUseCase } from "../../application/use-cases/update-customer.use-case"
import { Customer } from "../../domain/entities/customer.entity"
import { CustomerError } from "../../domain/errors/customer.error"
import {
  CreateCustomerParams,
  UpdateCustomerParams,
  SetCustomerStatusParams
} from "../../domain/params/customer.params"

interface CustomersState {
  readonly customers: readonly Customer[]
  readonly selectedCustomer: Customer | null
  readonly loaded: boolean
  readonly loading: boolean
  readonly error: CustomerError | null
  readonly successMessage: string | null
}
const initialState: CustomersState = {
  customers: [],
  selectedCustomer: null,
  loaded: false,
  loading: false,
  error: null,
  successMessage: null
}
const toCustomerError = (error: unknown) =>
  error instanceof CustomerError ? error : new CustomerError("UNEXPECTED")

export const CustomersStore = signalStore(
  { providedIn: "root" },
  withState(initialState),
  withComputed(({ customers, loading, loaded, error }) => ({
    isEmpty: computed(() => loaded() && !loading() && error() === null && customers().length === 0)
  })),
  withMethods(
    (
      store,
      listCustomersUseCase = inject(ListCustomersUseCase),
      getCustomerByIdUseCase = inject(GetCustomerByIdUseCase),
      createCustomerUseCase = inject(CreateCustomerUseCase),
      updateCustomerUseCase = inject(UpdateCustomerUseCase),
      setCustomerStatusUseCase = inject(SetCustomerStatusUseCase)
    ) => {
      let pending = 0,
        revision = 0,
        latestList = 0,
        latestDetail = 0
      const scope = createSessionReadScope(() => {
        pending = 0
        revision++
        latestList++
        latestDetail++
        patchState(store, initialState)
      })
      const execute = <T>(
        request: () => Observable<Result<T, CustomerError>>,
        success: (data: T) => void,
        message: string | null = null,
        current: () => boolean = () => true
      ): Observable<Result<T, CustomerError>> =>
        defer(() => {
          if (!scope.check()) return of(Result.failure(new CustomerError("UNAUTHENTICATED")))
          const generation = scope.generation()
          pending++
          patchState(store, { loading: true, error: null, successMessage: null })
          return defer(request).pipe(
            takeUntil(scope.cancelled$),
            catchError(error => of(Result.failure(toCustomerError(error)))),
            tap(result => {
              if (!scope.check() || generation !== scope.generation() || !current()) return
              if (result.success) {
                success(result.data)
                patchState(store, { error: null, successMessage: message })
              } else patchState(store, { error: result.error, successMessage: null })
            }),
            finalize(() => {
              if (generation !== scope.generation()) return
              pending--
              patchState(store, { loading: pending > 0 })
            })
          )
        })
      // Only confirmed server profiles alter the active-only list. Inactive detail
      // remains available, and a subsequent list replaces this projection entirely.
      const apply = (customer: Customer) => {
        revision++
        const existing = store.customers().some(c => c.id === customer.id)
        const customers = customer.isActive
          ? existing
            ? store.customers().map(c => (c.id === customer.id ? customer : c))
            : [...store.customers(), customer]
          : store.customers().filter(c => c.id !== customer.id)
        patchState(store, {
          customers,
          selectedCustomer:
            store.selectedCustomer()?.id === customer.id ? customer : store.selectedCustomer()
        })
      }
      return {
        loadCustomers() {
          return defer(() => {
            const requestId = ++latestList,
              start = revision
            return execute(
              () => listCustomersUseCase.execute(),
              customers => patchState(store, { customers, selectedCustomer: null, loaded: true }),
              null,
              () => requestId === latestList && start === revision
            )
          })
        },
        loadCustomer(id: number) {
          return defer(() => {
            const requestId = ++latestDetail
            return execute(
              () => getCustomerByIdUseCase.execute(id),
              selectedCustomer => patchState(store, { selectedCustomer }),
              null,
              () => requestId === latestDetail
            )
          })
        },
        createCustomer(params: CreateCustomerParams) {
          return execute(
            () => createCustomerUseCase.execute(params),
            apply,
            "Customer created successfully"
          )
        },
        updateCustomer(params: UpdateCustomerParams) {
          return execute(
            () => updateCustomerUseCase.execute(params),
            apply,
            "Customer updated successfully"
          )
        },
        setCustomerStatus(params: SetCustomerStatusParams) {
          return execute(
            () => setCustomerStatusUseCase.execute(params),
            apply,
            "Customer status updated successfully"
          )
        },
        clearFeedback() {
          scope.check()
          patchState(store, { error: null, successMessage: null })
        }
      }
    }
  )
)
