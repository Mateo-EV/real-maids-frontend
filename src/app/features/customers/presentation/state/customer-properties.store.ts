import { computed, inject, Injector } from "@angular/core"
import { patchState, signalStore, withComputed, withMethods, withState } from "@ngrx/signals"
import { catchError, defer, EMPTY, finalize, Observable, of, takeUntil, tap } from "rxjs"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import {
  createReadResource,
  ReadResource,
  ReadResourceState
} from "@/app/shared/state/read-resource"
import { Result } from "@/app/shared/utils/result"
import {
  CreatePropertyUseCase,
  ListCustomerPropertiesUseCase,
  SetPropertyStatusUseCase,
  UpdatePropertyUseCase
} from "../../application/use-cases/property.use-cases"
import { Property } from "../../domain/entities/property.entity"
import { CustomerError } from "../../domain/errors/customer.error"
import { CreatePropertyParams, UpdatePropertyParams } from "../../domain/params/property.params"
import { CustomerHistoryStore } from "./customer-history.store"

type PropertyRead = ReadResourceState<readonly Property[], CustomerError>
const emptyRead = (): PropertyRead => ({
  data: [],
  loaded: false,
  pendingReads: 0,
  refreshing: false,
  expires: 0,
  error: undefined
})
const initialState = {
  properties: {} as Record<number, PropertyRead>,
  pendingWrites: 0,
  writeError: undefined as CustomerError | undefined
}

/** Owner-specific lists; subscribe to load, select within a computed, unsubscribe on teardown. */
export const CustomerPropertiesStore = signalStore(
  { providedIn: "root" },
  withState(initialState),
  withComputed(store => ({
    loading: computed(
      () =>
        store.pendingWrites() > 0 ||
        Object.values(store.properties()).some(value => (value.pendingReads ?? 0) > 0)
    )
  })),
  withMethods(
    (
      store,
      list = inject(ListCustomerPropertiesUseCase),
      create = inject(CreatePropertyUseCase),
      update = inject(UpdatePropertyUseCase),
      status = inject(SetPropertyStatusUseCase),
      injector = inject(Injector)
    ) => {
      // Coordinators retain flights only. Verified data lives exclusively in SignalStore.
      const resources = new Map<number, ReadResource<readonly Property[], CustomerError>>()
      const scope = createSessionReadScope(() => {
        resources.forEach(resource => resource.reset())
        resources.clear()
        patchState(store, initialState)
      })
      const normalizeError = (error: unknown) =>
        error instanceof CustomerError ? error : new CustomerError("UNEXPECTED")
      const selectProperties = (id: number): PropertyRead => store.properties()[id] ?? emptyRead()
      function trim() {
        const inactive = [...resources].filter(([, resource]) => !resource.isPending())
        for (const [id] of inactive.slice(0, Math.max(0, inactive.length - 20))) {
          resources.delete(id)
          patchState(store, state => {
            const properties = { ...state.properties }
            delete properties[id]
            return { properties }
          })
        }
      }
      function resource(id: number) {
        let value = resources.get(id)
        if (!value) {
          value = createReadResource<readonly Property[], CustomerError>({
            state: {
              get: () => selectProperties(id),
              update: updateState =>
                patchState(store, state => {
                  const current = state.properties[id] ?? emptyRead()
                  return {
                    properties: {
                      ...state.properties,
                      [id]: { ...current, ...updateState(current) }
                    }
                  }
                })
            },
            initialData: () => [],
            request: () => list.execute(id),
            normalizeError,
            ttl: 120000,
            scope,
            forcePolicy: "join",
            cancelOnInvalidate: true
          })
        }
        resources.delete(id)
        resources.set(id, value)
        return value
      }
      function mutate<T>(id: number, request: () => Observable<Result<T, CustomerError>>) {
        return defer(() => {
          if (!scope.check()) return EMPTY
          const generation = scope.generation()
          patchState(store, state => ({
            pendingWrites: state.pendingWrites + 1,
            writeError: undefined
          }))
          return defer(request).pipe(
            catchError((error: unknown) => of(Result.failure(normalizeError(error)))),
            tap(result => {
              if (generation !== scope.generation()) return
              result.either(
                () => {
                  resources.get(id)?.invalidate()
                  // Cancelling readers invokes caller completion callbacks synchronously.
                  if (!scope.check() || generation !== scope.generation()) return
                  const history = injector.get(CustomerHistoryStore)
                  if (!scope.check() || generation !== scope.generation()) return
                  history.invalidateCustomer(id)
                },
                error => patchState(store, { writeError: error })
              )
            }),
            takeUntil(scope.cancelled$),
            finalize(() => {
              if (generation === scope.generation())
                patchState(store, state => ({ pendingWrites: state.pendingWrites - 1 }))
            })
          )
        })
      }
      return {
        selectProperties,
        loadProperties(
          id: number,
          force = false
        ): Observable<Result<readonly Property[], CustomerError>> {
          return defer(() => {
            if (!scope.check()) return EMPTY
            return resource(id).read(force).pipe(finalize(trim))
          })
        },
        createProperty(id: number, params: CreatePropertyParams) {
          return mutate(id, () => create.execute(id, params))
        },
        updateProperty(id: number, params: UpdatePropertyParams) {
          return mutate(id, () => update.execute(id, params))
        },
        setPropertyStatus(id: number, propertyId: number, isActive: boolean) {
          return mutate(id, () => status.execute(id, propertyId, isActive))
        }
      }
    }
  )
)
