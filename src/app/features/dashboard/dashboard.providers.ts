import { EnvironmentProviders, makeEnvironmentProviders } from "@angular/core"
import { DASHBOARD_REPOSITORY } from "./domain/repositories/dashboard.repository"
import { DashboardRepositoryImpl } from "./infrastructure/repositories/dashboard.repository-impl"

/**
 * Opt-in read composition next to the application's existing root HTTP/auth providers.
 * The token aliases the root implementation, which keeps the shared root HTTP source.
 */
export function provideDashboardReads(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: DASHBOARD_REPOSITORY, useExisting: DashboardRepositoryImpl }
  ])
}
