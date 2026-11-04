import { EnvironmentProviders, makeEnvironmentProviders } from "@angular/core"
import { OPERATIONS_REPOSITORY } from "./domain/repositories/operations.repository"
import { OperationsRepositoryImpl } from "./infrastructure/repositories/operations.repository-impl"

/** Opt-in reads alongside the application's existing root HTTP/auth providers. */
export function provideOperationsRequestReads(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: OPERATIONS_REPOSITORY, useExisting: OperationsRepositoryImpl }
  ])
}
