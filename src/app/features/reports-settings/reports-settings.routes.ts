import { Routes } from "@angular/router"
import { authGuard } from "@/app/features/auth/presentation/guards/auth.guard"
import { provideCatalogToast } from "@/app/shared/notifications/catalog-toast"

/**
 * W6 reports (S4, S5): one guarded lazy screen under the admin shell. The shell owns the
 * layout and navigation, so this route set only adds `/admin/reports` itself, and it owns the
 * complete route-local toast scope because a confirmed generation shows generic feedback.
 */
export const REPORTS_SETTINGS_ROUTES: Routes = [
  {
    path: "",
    title: "Reportes | The Real Maids",
    canActivate: [authGuard],
    providers: provideCatalogToast(),
    loadComponent: () =>
      import("./presentation/pages/reports-page/reports-page").then(
        component => component.ReportsPage
      )
  }
]
