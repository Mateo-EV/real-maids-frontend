import { EnvironmentProviders, makeEnvironmentProviders } from "@angular/core"
import { REPORTS_SETTINGS_REPOSITORY } from "./domain/repositories/reports-settings.repository"
import { ReportsSettingsRepositoryImpl } from "./infrastructure/repositories/reports-settings.repository-impl"

/**
 * Opt-in composition next to the application's existing root HTTP/auth providers. The token
 * aliases the root implementation with `useExisting`, so the shared root HTTP source stays a
 * single instance and no domain token is bound directly to a source.
 */
export function provideReportsSettingsReads(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: REPORTS_SETTINGS_REPOSITORY, useExisting: ReportsSettingsRepositoryImpl }
  ])
}
