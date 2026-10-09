import { authGuard } from "@/app/features/auth/presentation/guards/auth.guard"
import { Routes } from "@angular/router"

export const ADMIN_ROUTES: Routes = [
  {
    path: "admin",
    canActivate: [authGuard],
    loadComponent: () =>
      import("./presentation/components/admin-shell/admin-shell").then(
        component => component.AdminShell
      ),
    children: [
      // Temporary entry destination until the approved dashboard scope is implemented.
      { path: "", pathMatch: "full", redirectTo: "users" },
      {
        path: "users",
        loadChildren: () =>
          import("../../features/users/users.routes").then(routes => routes.USERS_ROUTES)
      }
    ]
  }
]
