import { guestGuard } from "@/app/features/auth/presentation/guards/auth.guard"
import { Routes } from "@angular/router"

// Auth owns `/login`. The forced first-sign-in change (`/change-password`, WP10 T16) is composed at
// application level so this lazy set keeps its pinned shape; the screen itself still lives in the
// auth feature and is guarded by `passwordChangeGuard`.
export const AUTH_ROUTES: Routes = [
  {
    path: "login",
    title: "Iniciar sesión | The Real Maids",
    canActivate: [guestGuard],
    loadComponent: () =>
      import("./presentation/pages/login-page/login-page").then(component => component.LoginPage)
  }
]
