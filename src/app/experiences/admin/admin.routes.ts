import { authGuard } from "@/app/features/auth/presentation/guards/auth.guard"
import { Routes } from "@angular/router"

export const ADMIN_ROUTES: Routes = [
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
