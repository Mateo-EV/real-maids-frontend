import { Routes } from "@angular/router"
import { authGuard } from "@/app/features/auth/presentation/guards/auth.guard"
import { provideCatalogToast } from "@/app/shared/notifications/catalog-toast"

export const FIELD_OPERATIONS_ROUTES: Routes = [
  {
    path: "",
    title: "Personal | The Real Maids",
    canActivate: [authGuard],
    providers: provideCatalogToast(),
    loadComponent: () =>
      import("./presentation/pages/staff-page/staff-page").then(component => component.StaffPage)
  },
  {
    path: "me",
    title: "Mi perfil de personal | The Real Maids",
    data: { ownStaffProfile: true },
    canActivate: [authGuard],
    providers: provideCatalogToast(),
    loadComponent: () =>
      import("./presentation/pages/staff-detail-page/staff-detail-page").then(
        component => component.StaffDetailPage
      )
  },
  {
    path: ":id",
    title: "Detalle de personal | The Real Maids",
    canActivate: [authGuard],
    providers: provideCatalogToast(),
    loadComponent: () =>
      import("./presentation/pages/staff-detail-page/staff-detail-page").then(
        component => component.StaffDetailPage
      )
  }
]
