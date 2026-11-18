import { Routes } from "@angular/router"
import { authGuard } from "@/app/features/auth/presentation/guards/auth.guard"
import { provideCatalogToast } from "@/app/shared/notifications/catalog-toast"

/**
 * T4/D1/S11: one protected lazy group under the admin shell. The inbox owns the complete
 * route toast scope and reuses the root support store, exactly like the other lazy groups.
 * T5 adds the guarded `:id` detail next to it, with its own scope; both stay independently
 * lazy and the empty-path route keeps its shape.
 */
export const CUSTOMER_SUPPORT_ROUTES: Routes = [
  {
    path: "",
    title: "Soporte | The Real Maids",
    canActivate: [authGuard],
    providers: provideCatalogToast(),
    loadComponent: () =>
      import("./presentation/pages/support-requests-page/support-requests-page").then(
        component => component.SupportRequestsPage
      )
  },
  {
    path: ":id",
    title: "Detalle de atención | The Real Maids",
    canActivate: [authGuard],
    providers: provideCatalogToast(),
    loadComponent: () =>
      import("./presentation/pages/support-request-detail-page/support-request-detail-page").then(
        component => component.SupportRequestDetailPage
      )
  }
]
