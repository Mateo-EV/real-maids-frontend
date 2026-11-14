import { Routes } from "@angular/router"
import { authGuard } from "@/app/features/auth/presentation/guards/auth.guard"
import { provideCatalogToast } from "@/app/shared/notifications/catalog-toast"

export const OPERATIONS_ROUTES: Routes = [
  { path: "", pathMatch: "full", redirectTo: "requests" },
  {
    path: "",
    title: "Operaciones | The Real Maids",
    canActivate: [authGuard],
    loadComponent: () =>
      import("./presentation/pages/operations-shell/operations-shell").then(
        component => component.OperationsShell
      ),
    children: [
      {
        path: "requests",
        title: "Solicitudes internas | The Real Maids",
        providers: provideCatalogToast(),
        loadComponent: () =>
          import("./presentation/pages/service-requests-page/service-requests-page").then(
            component => component.ServiceRequestsPage
          )
      },
      {
        path: "requests/:id",
        title: "Detalle de solicitud | The Real Maids",
        providers: provideCatalogToast(),
        loadComponent: () =>
          import("./presentation/pages/service-request-detail-page/service-request-detail-page").then(
            component => component.ServiceRequestDetailPage
          )
      },
      {
        path: "orders",
        title: "Órdenes de servicio | The Real Maids",
        providers: provideCatalogToast(),
        loadComponent: () =>
          import("./presentation/pages/service-orders-page/service-orders-page").then(
            component => component.ServiceOrdersPage
          )
      },
      {
        path: "orders/:id",
        title: "Detalle de orden | The Real Maids",
        providers: provideCatalogToast(),
        loadComponent: () =>
          import("./presentation/pages/service-order-detail-page/service-order-detail-page").then(
            component => component.ServiceOrderDetailPage
          )
      },
      {
        path: "agenda",
        title: "Agenda | The Real Maids",
        providers: provideCatalogToast(),
        loadComponent: () =>
          import("./presentation/pages/agenda-page/agenda-page").then(
            component => component.AgendaPage
          )
      }
    ]
  }
]
