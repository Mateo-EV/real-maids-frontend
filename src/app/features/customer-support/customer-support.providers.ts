import { EnvironmentProviders, makeEnvironmentProviders } from "@angular/core"
import { CUSTOMER_SUPPORT_REPOSITORY } from "./domain/repositories/customer-support.repository"
import { CustomerSupportRepositoryImpl } from "./infrastructure/repositories/customer-support.repository-impl"

/**
 * Opt-in read composition next to the application's existing root HTTP/auth providers.
 * The token aliases the root implementation, which keeps the shared root HTTP source.
 */
export function provideCustomerSupportReads(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: CUSTOMER_SUPPORT_REPOSITORY, useExisting: CustomerSupportRepositoryImpl }
  ])
}
