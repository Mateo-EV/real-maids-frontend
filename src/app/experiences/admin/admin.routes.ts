import { authGuard } from "@/app/features/auth/presentation/guards/auth.guard"
import { Routes } from "@angular/router"

export const ADMIN_ROUTES: Routes = [
  {
    path: "admin/users",
    canActivate: [authGuard],
    loadChildren: () =>
      import("../../features/users/users.routes").then(routes => routes.USERS_ROUTES)
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
