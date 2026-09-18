import { ApplicationConfig, provideBrowserGlobalErrorListeners } from "@angular/core"
import { provideRouter } from "@angular/router"
import { routes } from "../../app.routes"
import { provideClientHydration } from "@angular/platform-browser"
import { AuthRepositoryImpl } from "@/app/admin/features/auth/infrastructure/repositories/auth.repository.impl"
import { AUTH_REPOSITORY } from "@/app/admin/features/auth/domain/repositories/auth.repository"

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(),
    { useClass: AuthRepositoryImpl, provide: AUTH_REPOSITORY }
  ]
}
