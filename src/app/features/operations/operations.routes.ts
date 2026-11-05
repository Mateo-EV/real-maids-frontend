import { Routes } from "@angular/router"
import { authGuard } from "@/app/features/auth/presentation/guards/auth.guard"
import { provideCatalogToast } from "@/app/shared/notifications/catalog-toast"

export const OPERATIONS_ROUTES: Routes = [
  { path: "", pathMatch: "full", redirectTo: "requests" },
  {
    path: "requests",
    title: "Solicitudes internas | The Real Maids",
    canActivate: [authGuard],
    providers: provideCatalogToast(),
    loadComponent: () =>
      import("./presentation/pages/service-requests-page/service-requests-page").then(
        component => component.ServiceRequestsPage
      )
  },
  {
    path: "requests/:id",
    title: "Detalle de solicitud | The Real Maids",
    canActivate: [authGuard],
    providers: provideCatalogToast(),
    loadComponent: () =>
      import("./presentation/pages/service-request-detail-page/service-request-detail-page").then(
        component => component.ServiceRequestDetailPage
      )
  }
]
