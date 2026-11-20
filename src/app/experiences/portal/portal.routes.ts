import { portalGuard } from "@/app/features/auth/presentation/guards/auth.guard"
import { Routes } from "@angular/router"

/**
 * WP10 T2 / S4 — the customer experience at `/portal`, composed exactly like the admin experience:
 * one guarded lazy shell with its own children. The audience guard is the same decision the admin
 * tree uses, so a staff session never renders the portal and a customer never reaches `/admin`.
 *
 * `/portal` opens the only implemented section today. Later sections (own orders, own support) add
 * their route and their navigation entry in the same slice that connects their consumer, so no dead
 * destination is created here.
 */
export const PORTAL_ROUTES: Routes = [
  {
    path: "portal",
    canActivate: [portalGuard],
    loadComponent: () =>
      import("./presentation/components/portal-shell/portal-shell").then(
        component => component.PortalShell
      ),
    children: [
      { path: "", pathMatch: "full", redirectTo: "requests" },
      {
        path: "requests",
        title: "Mis solicitudes | The Real Maids",
        loadComponent: () =>
          import("./presentation/pages/portal-requests-page/portal-requests-page").then(
            component => component.PortalRequestsPage
          )
      },
      // Declared after `requests`, so the static section path always wins over the id segment.
      {
        path: "requests/:id",
        title: "Detalle de solicitud | The Real Maids",
        loadComponent: () =>
          import("./presentation/pages/portal-request-detail-page/portal-request-detail-page").then(
            component => component.PortalRequestDetailPage
          )
      }
    ]
  }
]
