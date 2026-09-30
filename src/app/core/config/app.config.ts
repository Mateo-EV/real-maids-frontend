import { ApplicationConfig, provideBrowserGlobalErrorListeners } from "@angular/core"
import { provideRouter } from "@angular/router"
import { routes } from "../../app.routes"
import { provideClientHydration } from "@angular/platform-browser"
import { AuthInMemorySource } from "@/app/features/auth/infrastructure/source/auth-in-memory.source"
import { AUTH_REPOSITORY } from "@/app/features/auth/domain/repositories/auth.repository"
import { CustomerInMemorySource } from "@/app/features/customers/infrastructure/source/customer-in-memory.source"
import { CUSTOMER_REPOSITORY } from "@/app/features/customers/domain/repositories/customer.repository"

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(),
    { useExisting: AuthInMemorySource, provide: AUTH_REPOSITORY },
    { useExisting: CustomerInMemorySource, provide: CUSTOMER_REPOSITORY }
  ]
}
