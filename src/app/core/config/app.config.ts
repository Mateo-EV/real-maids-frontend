import { ApplicationConfig, provideBrowserGlobalErrorListeners } from "@angular/core"
import { provideRouter } from "@angular/router"
import { routes } from "../../app.routes"
import { provideClientHydration } from "@angular/platform-browser"
import { AuthRepositoryImpl } from "@/app/admin/features/auth/infrastructure/repositories/auth.repository.impl"
import { AUTH_REPOSITORY } from "@/app/admin/features/auth/domain/repositories/auth.repository"
import { CustomerRepositoryImpl } from "@/app/admin/features/customers/infrastructure/repositories/customer.repository.impl"
import { CUSTOMER_REPOSITORY } from "@/app/admin/features/customers/domain/repositories/customer.repository"

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(),
    { useClass: AuthRepositoryImpl, provide: AUTH_REPOSITORY },
    { useClass: CustomerRepositoryImpl, provide: CUSTOMER_REPOSITORY }
  ]
}
