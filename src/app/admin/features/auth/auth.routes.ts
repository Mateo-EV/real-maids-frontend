import { authGuard, guestGuard } from "@/app/core/guards/auth.guard"
import { Routes } from "@angular/router"

export const AUTH_ROUTES: Routes = [
  {
    path: "login",
    title: "Iniciar sesión | The Real Maids",
    canActivate: [guestGuard],
    loadComponent: () =>
      import("./presentation/pages/login-page/login-page").then(component => component.LoginPage)
  },
  {
    path: "admin",
    title: "Inicio | The Real Maids",
    canActivate: [authGuard],
    loadComponent: () =>
      import("./presentation/pages/admin-home-page/admin-home-page").then(
        component => component.AdminHomePage
      )
  }
]
