import { authGuard } from "@/app/features/auth/presentation/guards/auth.guard"
import { Routes } from "@angular/router"

export const USERS_ROUTES: Routes = [
  {
    path: "",
    title: "Usuarios | The Real Maids",
    canActivate: [authGuard],
    loadComponent: () =>
      import("./presentation/pages/users-page/users-page").then(component => component.UsersPage)
  }
]
