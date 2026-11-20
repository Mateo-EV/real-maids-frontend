import { portalGuard } from "@/app/features/auth/presentation/guards/auth.guard"
import { Routes } from "@angular/router"

/**
 * WP10 T2 / S4 — the customer experience at `/portal`, composed exactly like the admin experience:
 * one guarded lazy shell with its own children. The audience guard is the same decision the admin
 * tree uses, so a staff session never renders the portal and a customer never reaches `/admin`.
 *
 * `/portal` opens the first implemented section. Every later section adds its route and its
 * navigation entry in the same slice that connects its consumer, so no dead destination is created
 * here: `requests` (own service requests) and `services` (own service orders) are both implemented.
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
      },
      // Own service orders (WP10 T4). The static list precedes its own `:id` child.
      {
        path: "services",
        title: "Mis servicios | The Real Maids",
        loadComponent: () =>
          import("./presentation/pages/portal-services-page/portal-services-page").then(
            component => component.PortalServicesPage
          )
      },
      {
        path: "services/:id",
        title: "Detalle del servicio | The Real Maids",
        loadComponent: () =>
          import("./presentation/pages/portal-service-detail-page/portal-service-detail-page").then(
            component => component.PortalServiceDetailPage
          )
      }
    ]
  }
]
