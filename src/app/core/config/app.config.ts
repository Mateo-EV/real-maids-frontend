import { ApplicationConfig, provideBrowserGlobalErrorListeners } from "@angular/core"
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

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(),
    { useExisting: AuthRepositoryImpl, provide: AUTH_REPOSITORY },
    { useExisting: CustomerRepositoryImpl, provide: CUSTOMER_REPOSITORY },
    { useExisting: UserRepositoryImpl, provide: USER_REPOSITORY },
    { useExisting: RoleRepositoryImpl, provide: ROLE_REPOSITORY },
    { useExisting: AuditLogRepositoryImpl, provide: AUDIT_LOG_REPOSITORY },
    { useExisting: UserSessionRepositoryImpl, provide: USER_SESSION_REPOSITORY },
    { useExisting: RbacRepositoryImpl, provide: RBAC_REPOSITORY }
  ]
}
