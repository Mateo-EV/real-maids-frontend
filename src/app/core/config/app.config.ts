import { ApplicationConfig, provideBrowserGlobalErrorListeners } from "@angular/core"
import { provideRouter } from "@angular/router"
import { routes } from "../../app.routes"
import { provideClientHydration } from "@angular/platform-browser"
import { AuthInMemorySource } from "@/app/features/auth/infrastructure/source/auth-in-memory.source"
import { AUTH_REPOSITORY } from "@/app/features/auth/domain/repositories/auth.repository"
import { CustomerInMemorySource } from "@/app/features/customers/infrastructure/source/customer-in-memory.source"
import { CUSTOMER_REPOSITORY } from "@/app/features/customers/domain/repositories/customer.repository"

import { UserInMemorySource } from "@/app/features/users/infrastructure/source/user-in-memory.source"
import { USER_REPOSITORY } from "@/app/features/users/domain/repositories/user.repository"
import { RoleInMemorySource } from "@/app/features/users/infrastructure/source/role-in-memory.source"
import { ROLE_REPOSITORY } from "@/app/features/users/domain/repositories/role.repository"

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(),
    { useExisting: AuthInMemorySource, provide: AUTH_REPOSITORY },
    { useExisting: CustomerInMemorySource, provide: CUSTOMER_REPOSITORY },
    { useExisting: UserInMemorySource, provide: USER_REPOSITORY },
    { useExisting: RoleInMemorySource, provide: ROLE_REPOSITORY }
  ]
}
