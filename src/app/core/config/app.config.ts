import { ApplicationConfig, Injector, provideBrowserGlobalErrorListeners } from "@angular/core"
import { provideHttpClient, withInterceptors } from "@angular/common/http"
import { authInterceptor } from "@/app/features/auth/infrastructure/interceptors/auth.interceptor"
import { API_URL } from "../tokens/api-url.token"
import { LINKED_IDENTITY_SYNC } from "./linked-identity-sync"
import { UserStore } from "@/app/features/users/presentation/state/user.store"
import { CustomersStore } from "@/app/features/customers/presentation/state/customers.store"
import { environment } from "@/environments/environment"
import { provideRouter } from "@angular/router"
import { routes } from "../../app.routes"
import { provideClientHydration } from "@angular/platform-browser"
import { AuthRepositoryImpl } from "@/app/features/auth/infrastructure/repositories/auth.repository-impl"
import { AUTH_REPOSITORY } from "@/app/features/auth/domain/repositories/auth.repository"
import { CustomerRepositoryImpl } from "@/app/features/customers/infrastructure/repositories/customer.repository-impl"
import { CUSTOMER_REPOSITORY } from "@/app/features/customers/domain/repositories/customer.repository"

import { UserRepositoryImpl } from "@/app/features/users/infrastructure/repositories/user.repository-impl"
import { USER_REPOSITORY } from "@/app/features/users/domain/repositories/user.repository"
import { RoleRepositoryImpl } from "@/app/features/users/infrastructure/repositories/role.repository-impl"
import { ROLE_REPOSITORY } from "@/app/features/users/domain/repositories/role.repository"
import { AUDIT_LOG_REPOSITORY } from "@/app/features/users/domain/repositories/audit-log.repository"
import { AuditLogRepositoryImpl } from "@/app/features/users/infrastructure/repositories/audit-log.repository-impl"
import { USER_SESSION_REPOSITORY } from "@/app/features/users/domain/repositories/user-session.repository"
import { UserSessionRepositoryImpl } from "@/app/features/users/infrastructure/repositories/user-session.repository-impl"
import { RBAC_REPOSITORY } from "@/app/features/users/domain/repositories/rbac.repository"
import { RbacRepositoryImpl } from "@/app/features/users/infrastructure/repositories/rbac.repository-impl"

import { ACQUISITION_REPOSITORY } from "@/app/features/customers/domain/repositories/acquisition.repository"
import { AcquisitionRepositoryImpl } from "@/app/features/customers/infrastructure/repositories/acquisition.repository-impl"
import { CUSTOMER_CAPABILITIES_REPOSITORY } from "@/app/features/customers/domain/repositories/customer-capabilities.repository"
import { CustomerCapabilitiesRepositoryImpl } from "@/app/features/customers/infrastructure/repositories/customer-capabilities.repository-impl"
import { CUSTOMER_RELATIONS_REPOSITORY } from "@/app/features/customers/domain/repositories/customer-relations.repository"
import { CustomerRelationsRepositoryImpl } from "@/app/features/customers/infrastructure/repositories/customer-relations.repository-impl"
import { PROPERTY_REPOSITORY } from "@/app/features/customers/domain/repositories/property.repository"
import { PropertyRepositoryImpl } from "@/app/features/customers/infrastructure/repositories/property.repository-impl"
import { CUSTOMER_HISTORY_REPOSITORY } from "@/app/features/customers/domain/repositories/customer-history.repository"
import { CustomerHistoryRepositoryImpl } from "@/app/features/customers/infrastructure/repositories/customer-history.repository-impl"
import { CRM_COMMUNICATIONS_REPOSITORY } from "@/app/features/communications/domain/repositories/communications.repository"
import { CommunicationsRepositoryImpl } from "@/app/features/communications/infrastructure/repositories/communications.repository-impl"

import { provideFieldOperationsReads } from "@/app/features/field-operations/field-operations.providers"
import { provideOperationsRequestReads } from "@/app/features/operations/operations.providers"
import { provideCustomerSupportReads } from "@/app/features/customer-support/customer-support.providers"
import { provideServiceCatalogReads } from "@/app/features/service-catalog/service-catalog.providers"
import { provideDashboardReads } from "@/app/features/dashboard/dashboard.providers"
import { provideReportsSettingsReads } from "@/app/features/reports-settings/reports-settings.providers"

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(),
    provideHttpClient(withInterceptors([authInterceptor])),
    { provide: API_URL, useValue: environment.apiUrl },
    /**
     * The customer/account identity is shared by the backend, so each feature's root store must be
     * able to expire the other side's cached presentation data. These callbacks are the only
     * cross-feature knowledge, and they resolve the peer store lazily: composing the application
     * creates neither store for this seam and dispatches no read.
     */
    {
      provide: LINKED_IDENTITY_SYNC,
      useFactory: (injector: Injector) => ({
        invalidateUserPages: () => injector.get(UserStore).invalidateLinkedIdentity(),
        invalidateCustomerIdentity: (customerId: number | null) =>
          injector.get(CustomersStore).invalidateLinkedIdentity(customerId)
      }),
      deps: [Injector]
    },
    provideFieldOperationsReads(),
    provideOperationsRequestReads(),
    provideCustomerSupportReads(),
    provideServiceCatalogReads(),
    provideDashboardReads(),
    provideReportsSettingsReads(),
    { useExisting: AuthRepositoryImpl, provide: AUTH_REPOSITORY },
    { useExisting: CustomerRepositoryImpl, provide: CUSTOMER_REPOSITORY },
    { useExisting: AcquisitionRepositoryImpl, provide: ACQUISITION_REPOSITORY },
    { useExisting: CustomerCapabilitiesRepositoryImpl, provide: CUSTOMER_CAPABILITIES_REPOSITORY },
    { useExisting: CustomerRelationsRepositoryImpl, provide: CUSTOMER_RELATIONS_REPOSITORY },
    { useExisting: PropertyRepositoryImpl, provide: PROPERTY_REPOSITORY },
    { useExisting: CustomerHistoryRepositoryImpl, provide: CUSTOMER_HISTORY_REPOSITORY },
    { useExisting: CommunicationsRepositoryImpl, provide: CRM_COMMUNICATIONS_REPOSITORY },
    { useExisting: UserRepositoryImpl, provide: USER_REPOSITORY },
    { useExisting: RoleRepositoryImpl, provide: ROLE_REPOSITORY },
    { useExisting: AuditLogRepositoryImpl, provide: AUDIT_LOG_REPOSITORY },
    { useExisting: UserSessionRepositoryImpl, provide: USER_SESSION_REPOSITORY },
    { useExisting: RbacRepositoryImpl, provide: RBAC_REPOSITORY }
  ]
}
