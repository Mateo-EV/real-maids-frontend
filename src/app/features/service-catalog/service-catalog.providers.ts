import { EnvironmentProviders, makeEnvironmentProviders } from "@angular/core"
import { SERVICE_CATALOG_REPOSITORY } from "./domain/repositories/service-catalog.repository"
import { ServiceCatalogRepositoryImpl } from "./infrastructure/repositories/service-catalog.repository-impl"

/** Opt-in composition for later consumers; the application still owns HttpClient/auth. */
export function provideServiceCatalogReads(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: SERVICE_CATALOG_REPOSITORY, useExisting: ServiceCatalogRepositoryImpl }
  ])
}
