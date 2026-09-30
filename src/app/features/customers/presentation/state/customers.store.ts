import { computed, inject } from "@angular/core"
import { patchState, signalStore, withComputed, withMethods, withState } from "@ngrx/signals"
import { catchError, defer, finalize, Observable, of, tap } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { CreateCustomerUseCase } from "../../application/use-cases/create-customer.use-case"
import { DeleteCustomerUseCase } from "../../application/use-cases/delete-customer.use-case"
import { GetCustomerByIdUseCase } from "../../application/use-cases/get-customer-by-id.use-case"
import { ListCustomersUseCase } from "../../application/use-cases/list-customers.use-case"
import { UpdateCustomerUseCase } from "../../application/use-cases/update-customer.use-case"
import { Customer } from "../../domain/entities/customer.entity"
import { CustomerError } from "../../domain/errors/customer.error"

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

const toCustomerError = (error: unknown): CustomerError =>
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
      deleteCustomerUseCase = inject(DeleteCustomerUseCase)
    ) => {
      let pendingRequests = 0
      let catalogRevision = 0
      let latestListRequest = 0

      const execute = <T>(
        request: () => Observable<Result<T, CustomerError>>,
        onSuccess: (data: T) => void,
        successMessage: string | null = null
      ): Observable<Result<T, CustomerError>> =>
        defer(() => {
          pendingRequests += 1
          patchState(store, { loading: true, error: null, successMessage: null })

          return defer(request).pipe(
            catchError((error: unknown) => of(Result.failure(toCustomerError(error)))),
            tap(result => {
              if (result.success) {
                onSuccess(result.data)
                patchState(store, { error: null, successMessage })
              } else {
                patchState(store, { error: result.error, successMessage: null })
              }
            })
          )
        }).pipe(
          finalize(() => {
            pendingRequests -= 1
            patchState(store, { loading: pendingRequests > 0 })
          })
        )

      return {
        loadCustomers() {
          return defer(() => {
            const requestId = ++latestListRequest
            const revisionAtStart = catalogRevision

            return execute(
              () => listCustomersUseCase.execute(),
              customers => {
                if (requestId !== latestListRequest || revisionAtStart !== catalogRevision) return

                patchState(store, { customers, selectedCustomer: null, loaded: true })
              }
            )
          })
        },
        loadCustomer(id: string) {
          return execute(
            () => getCustomerByIdUseCase.execute(id),
            selectedCustomer => patchState(store, { selectedCustomer })
          )
        },
        createCustomer(customer: Omit<Customer, "id">) {
          return execute(
            () => createCustomerUseCase.execute(customer),
            created => {
              catalogRevision += 1
              patchState(store, { customers: [...store.customers(), created] })
            },
            "Customer created successfully"
          )
        },
        updateCustomer(customer: Customer) {
          return execute(
            () => updateCustomerUseCase.execute(customer),
            updated => {
              catalogRevision += 1
              patchState(store, {
                customers: store.customers().map(item => (item.id === updated.id ? updated : item)),
                selectedCustomer:
                  store.selectedCustomer()?.id === updated.id ? updated : store.selectedCustomer()
              })
            },
            "Customer updated successfully"
          )
        },
        deleteCustomer(id: string) {
          return execute(
            () => deleteCustomerUseCase.execute(id),
            () => {
              catalogRevision += 1
              patchState(store, {
                customers: store.customers().filter(customer => customer.id !== id),
                selectedCustomer:
                  store.selectedCustomer()?.id === id ? null : store.selectedCustomer()
              })
            },
            "Customer deleted successfully"
          )
        },
        clearFeedback() {
          patchState(store, { error: null, successMessage: null })
        }
      }
    }
  )
)
