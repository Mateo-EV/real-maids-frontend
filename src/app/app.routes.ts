import { passwordChangeGuard } from "./features/auth/presentation/guards/auth.guard"
import { Routes } from "@angular/router"

export const routes: Routes = [
  {
    path: "",
    pathMatch: "full",
    redirectTo: "login"
  },
  {
    path: "",
    loadChildren: () => import("./features/auth/auth.routes").then(routes => routes.AUTH_ROUTES)
  },
  {
    // WP10 T16: the forced first-sign-in password change. It needs an authenticated session, keeps a
    // provisional one here and sends a settled one to the destination it carries. Composed here so
    // the auth lazy set keeps `/login` as its only route.
    path: "change-password",
    title: "Cambiar contraseña | The Real Maids",
    canActivate: [passwordChangeGuard],
    loadComponent: () =>
      import("./features/auth/presentation/pages/change-password-page/change-password-page").then(
        component => component.ChangePasswordPage
      )
  },
  {
    path: "",
    loadChildren: () =>
      import("./experiences/admin/admin.routes").then(routes => routes.ADMIN_ROUTES)
  },
  {
    // WP10 T2/S4: the customer experience. Its own lazy group and shell, guarded by the same
    // audience decision that keeps a customer out of `/admin`.
    path: "",
    loadChildren: () =>
      import("./experiences/portal/portal.routes").then(routes => routes.PORTAL_ROUTES)
  },
  {
    path: "**",
    redirectTo: "login"
  }
]
