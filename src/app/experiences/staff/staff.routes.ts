import { staffGuard } from "@/app/features/auth/presentation/guards/auth.guard"
import { Routes } from "@angular/router"

/**
 * WP11 T2 / S3–S4 — the field staff experience at `/staff`.
 *
 * It is the third protected family, composed exactly like `/admin` and `/portal`: one guarded lazy
 * shell with its own children, protected by the same shared audience decision, so a field staff
 * session never reaches the backoffice or the customer portal and neither of those audiences reaches
 * this tree.
 *
 * `/staff` opens the first implemented section, «Mis servicios»: the orders the backend already
 * scopes to the authenticated staff member. Every later section adds its route together with its
 * consumer, so no dead destination is created here.
 */
export const STAFF_ROUTES: Routes = [
  {
    path: "staff",
    canActivate: [staffGuard],
    loadComponent: () =>
      import("./presentation/components/staff-shell/staff-shell").then(
        component => component.StaffShell
      ),
    children: [
      { path: "", pathMatch: "full", redirectTo: "services" },
      {
        path: "services",
        title: "Mis servicios | The Real Maids",
        loadComponent: () =>
          import("./presentation/pages/staff-services-page/staff-services-page").then(
            component => component.StaffServicesPage
          )
      }
    ]
  }
]
