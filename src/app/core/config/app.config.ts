import { ApplicationConfig, provideBrowserGlobalErrorListeners } from "@angular/core"
import { provideHttpClient, withInterceptors } from "@angular/common/http"
import { authInterceptor } from "@/app/features/auth/infrastructure/interceptors/auth.interceptor"
import { API_URL } from "../tokens/api-url.token"
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

import { provideFieldOperationsReads } from "@/app/features/field-operations/field-operations.providers"
import { provideOperationsRequestReads } from "@/app/features/operations/operations.providers"

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(),
    provideHttpClient(withInterceptors([authInterceptor])),
    { provide: API_URL, useValue: environment.apiUrl },
    provideFieldOperationsReads(),
    provideOperationsRequestReads(),
    { useExisting: AuthRepositoryImpl, provide: AUTH_REPOSITORY },
    { useExisting: CustomerRepositoryImpl, provide: CUSTOMER_REPOSITORY },
    { useExisting: AcquisitionRepositoryImpl, provide: ACQUISITION_REPOSITORY },
    { useExisting: CustomerCapabilitiesRepositoryImpl, provide: CUSTOMER_CAPABILITIES_REPOSITORY },
    { useExisting: CustomerRelationsRepositoryImpl, provide: CUSTOMER_RELATIONS_REPOSITORY },
    { useExisting: PropertyRepositoryImpl, provide: PROPERTY_REPOSITORY },
    { useExisting: CustomerHistoryRepositoryImpl, provide: CUSTOMER_HISTORY_REPOSITORY },
    { useExisting: UserRepositoryImpl, provide: USER_REPOSITORY },
    { useExisting: RoleRepositoryImpl, provide: ROLE_REPOSITORY },
    { useExisting: AuditLogRepositoryImpl, provide: AUDIT_LOG_REPOSITORY },
    { useExisting: UserSessionRepositoryImpl, provide: USER_SESSION_REPOSITORY },
    { useExisting: RbacRepositoryImpl, provide: RBAC_REPOSITORY }
  ]
}
