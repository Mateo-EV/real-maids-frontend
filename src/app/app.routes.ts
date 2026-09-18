import { Routes } from "@angular/router"

export const routes: Routes = [
  {
    path: "",
    pathMatch: "full",
    redirectTo: "login"
  },
  {
    path: "",
    loadChildren: () =>
      import("./admin/features/auth/auth.routes").then(routes => routes.AUTH_ROUTES)
  },
  {
    path: "**",
    redirectTo: "login"
  }
]
