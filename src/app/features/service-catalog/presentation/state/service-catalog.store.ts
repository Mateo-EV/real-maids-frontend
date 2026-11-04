import { computed, inject } from "@angular/core"
import { patchState, signalStore, withComputed, withMethods, withState } from "@ngrx/signals"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { createReadResource, ReadResourceState } from "@/app/shared/state/read-resource"
import { ListActiveServiceTypesUseCase } from "../../application/use-cases/list-active-service-types.use-case"
import { ServiceCatalogError } from "../../domain/errors/service-catalog.error"
import { ServiceTypeSummary } from "../../domain/models/service-type-summary"

type CatalogRead = ReadResourceState<ServiceTypeSummary[], ServiceCatalogError>
const emptyRead = (): CatalogRead => ({
  data: [],
  loaded: false,
  pendingReads: 0,
  refreshing: false,
  expires: 0,
  error: undefined
})

/** One catalog entry; reads are finite and subscriptions belong to consumers. */
export const ServiceCatalogStore = signalStore(
  { providedIn: "root" },
  withState({ activeServiceTypes: emptyRead() }),
  withComputed(store => ({
    loading: computed(() => (store.activeServiceTypes().pendingReads ?? 0) > 0)
  })),
  withMethods((store, list = inject(ListActiveServiceTypesUseCase)) => {
    const scope = createSessionReadScope(() => resource.reset())
    const resource = createReadResource<ServiceTypeSummary[], ServiceCatalogError>({
      state: {
        get: () => store.activeServiceTypes(),
        update: update =>
          patchState(store, state => ({
            activeServiceTypes: {
              ...state.activeServiceTypes,
              ...update(state.activeServiceTypes)
            }
          }))
      },
      initialData: () => [],
      request: () => list.execute(),
      normalizeError: error =>
        error instanceof ServiceCatalogError
          ? error
          : new ServiceCatalogError("UNKNOWN", "No se pudo consultar el catálogo de servicios."),
      ttl: 120000,
      scope,
      forcePolicy: "join",
      cancelOnInvalidate: true
    })
    return {
      selectActiveServiceTypes: (): CatalogRead => store.activeServiceTypes(),
      loadActiveServiceTypes: (force = false) => resource.read(force)
    }
  })
)
