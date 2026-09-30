import { guestGuard } from "@/app/features/auth/presentation/guards/auth.guard"
import { Routes } from "@angular/router"

export const AUTH_ROUTES: Routes = [
  {
    path: "login",
    title: "Iniciar sesión | The Real Maids",
    canActivate: [guestGuard],
    loadComponent: () =>
      import("./presentation/pages/login-page/login-page").then(component => component.LoginPage)
  }
]
