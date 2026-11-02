import { Routes } from "@angular/router"
import { provideCatalogToast } from "@/app/shared/notifications/catalog-toast"
import { authGuard } from "@/app/features/auth/presentation/guards/auth.guard"

export const CUSTOMERS_ROUTES: Routes = [
  {
    path: "",
    title: "Clientes | The Real Maids",
    canActivate: [authGuard],
    providers: provideCatalogToast(),
    loadComponent: () =>
      import("./presentation/pages/customers-page/customers-page").then(
        component => component.CustomersPage
      )
  }
]
