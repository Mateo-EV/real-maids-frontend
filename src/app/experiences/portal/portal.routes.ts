import { portalGuard } from "@/app/features/auth/presentation/guards/auth.guard"
import { Routes } from "@angular/router"
import { portalPendingLeaveGuard } from "./presentation/navigation/portal-support-create-leave.guard"

/**
 * WP10 T2 / S4 — the customer experience at `/portal`, composed exactly like the admin experience:
 * one guarded lazy shell with its own children. The audience guard is the same decision the admin
 * tree uses, so a staff session never renders the portal and a customer never reaches `/admin`.
 *
 * `/portal` opens the first implemented section. Every later section adds its route and its
 * navigation entry in the same slice that connects its consumer, so no dead destination is created
 * here: `requests` (own service requests), `services` (own service orders) and `support` (own support
 * attentions, list, own creation and detail) are all implemented.
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
      },
      // Own support attentions (WP10 T5). The static list precedes its own `:id` child.
      {
        path: "support",
        title: "Soporte | The Real Maids",
        loadComponent: () =>
          import("./presentation/pages/portal-support-page/portal-support-page").then(
            component => component.PortalSupportPage
          )
      },
      // Own attention creation (WP10 T6). Static before `support/:id`, so `new` is never taken for
      // an id. The pending write owns the leave decision; a confirmed creation always leaves.
      {
        path: "support/new",
        title: "Nueva atención | The Real Maids",
        canDeactivate: [portalPendingLeaveGuard],
        loadComponent: () =>
          import("./presentation/pages/portal-support-create-page/portal-support-create-page").then(
            component => component.PortalSupportCreatePage
          )
      },
      {
        path: "support/:id",
        title: "Detalle de atención | The Real Maids",
        loadComponent: () =>
          import("./presentation/pages/portal-support-detail-page/portal-support-detail-page").then(
            component => component.PortalSupportDetailPage
          )
      }
    ]
  }
]
