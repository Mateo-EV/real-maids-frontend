import { EnvironmentProviders, makeEnvironmentProviders } from "@angular/core"
import { FIELD_OPERATIONS_REPOSITORY } from "./domain/repositories/field-operations.repository"
import { FieldOperationsRepositoryImpl } from "./infrastructure/repositories/field-operations.repository-impl"

/** Install at the application root alongside the existing HTTP/auth composition. */
export function provideFieldOperationsReads(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: FIELD_OPERATIONS_REPOSITORY, useExisting: FieldOperationsRepositoryImpl }
  ])
}
