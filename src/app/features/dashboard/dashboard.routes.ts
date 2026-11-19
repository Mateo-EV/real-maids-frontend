import { Routes } from "@angular/router"
import { authGuard } from "@/app/features/auth/presentation/guards/auth.guard"

/**
 * P02 dashboard (W4, S2, S6). One guarded lazy screen: the admin shell owns the layout and
 * navigation, so this route set only adds the page itself at `/admin`.
 */
export const DASHBOARD_ROUTES: Routes = [
  {
    path: "",
    pathMatch: "full",
    title: "Panel operativo | The Real Maids",
    canActivate: [authGuard],
    loadComponent: () =>
      import("./presentation/pages/dashboard-page/dashboard-page").then(
        component => component.DashboardPage
      )
  }
]
