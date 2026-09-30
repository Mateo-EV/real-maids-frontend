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
      import("./features/auth/auth.routes").then(routes => routes.AUTH_ROUTES)
  },
  {
    path: "",
    loadChildren: () =>
      import("./experiences/admin/admin.routes").then(routes => routes.ADMIN_ROUTES)
  },
  {
    path: "**",
    redirectTo: "login"
  }
]
