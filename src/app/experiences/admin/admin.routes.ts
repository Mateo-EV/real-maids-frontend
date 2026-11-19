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
      // P02: `/admin` opens the dashboard (W4, S2); the other children are unchanged.
      // `pathMatch: "full"` is load-bearing: an empty-path prefix child with `loadChildren` would
      // swallow every sibling URL (`/admin/users`, `/admin/customers`, ...) and then fail to match
      // inside the dashboard's own routes, so the lazy group is admitted only for the bare `/admin`.
      {
        path: "",
        pathMatch: "full",
        loadChildren: () =>
          import("../../features/dashboard/dashboard.routes").then(
            routes => routes.DASHBOARD_ROUTES
          )
      },
      {
        path: "users",
        loadChildren: () =>
          import("../../features/users/users.routes").then(routes => routes.USERS_ROUTES)
      },
      {
        path: "customers",
        loadChildren: () =>
          import("../../features/customers/customers.routes").then(
            routes => routes.CUSTOMERS_ROUTES
          )
      },
      {
        path: "staff",
        loadChildren: () =>
          import("../../features/field-operations/field-operations.routes").then(
            routes => routes.FIELD_OPERATIONS_ROUTES
          )
      },
      {
        path: "operations",
        loadChildren: () =>
          import("../../features/operations/operations.routes").then(
            routes => routes.OPERATIONS_ROUTES
          )
      },
      {
        path: "support",
        loadChildren: () =>
          import("../../features/customer-support/customer-support.routes").then(
            routes => routes.CUSTOMER_SUPPORT_ROUTES
          )
      },
      {
        // W6 reports: its own guarded lazy group with a route-local toast scope.
        path: "reports",
        loadChildren: () =>
          import("../../features/reports-settings/reports-settings.routes").then(
            routes => routes.REPORTS_SETTINGS_ROUTES
          )
      }
    ]
  }
]
