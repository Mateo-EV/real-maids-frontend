import { Routes } from "@angular/router"
import { provideCatalogToast } from "@/app/shared/notifications/catalog-toast"
import { authGuard } from "@/app/features/auth/presentation/guards/auth.guard"

export const CUSTOMERS_ROUTES: Routes = [
  {
    path: "",
    canActivate: [authGuard],
    loadComponent: () =>
      import("./presentation/pages/crm-shell/crm-shell").then(component => component.CrmShell),
    children: [
      {
        path: "",
        title: "Clientes | The Real Maids",
        providers: provideCatalogToast(),
        loadComponent: () =>
          import("./presentation/pages/customers-page/customers-page").then(
            component => component.CustomersPage
          )
      },
      {
        path: "leads",
        title: "Prospectos | The Real Maids",
        providers: provideCatalogToast(),
        loadComponent: () =>
          import("./presentation/pages/leads-page/leads-page").then(
            component => component.LeadsPage
          )
      },
      {
        path: "leads/:id",
        title: "Detalle del prospecto | The Real Maids",
        providers: provideCatalogToast(),
        loadComponent: () =>
          import("./presentation/pages/lead-detail-page/lead-detail-page").then(
            component => component.LeadDetailPage
          )
      },
      {
        path: "origins",
        title: "Orígenes de prospecto | The Real Maids",
        providers: provideCatalogToast(),
        loadComponent: () =>
          import("./presentation/pages/crm-origins-page/crm-origins-page").then(
            component => component.CrmOriginsPage
          )
      },
      {
        path: "stages",
        title: "Etapas del embudo | The Real Maids",
        providers: provideCatalogToast(),
        loadComponent: () =>
          import("./presentation/pages/crm-stages-page/crm-stages-page").then(
            component => component.CrmStagesPage
          )
      },
      {
        path: ":id",
        title: "Detalle del cliente | The Real Maids",
        providers: provideCatalogToast(),
        loadComponent: () =>
          import("./presentation/pages/customer-detail-page/customer-detail-page").then(
            component => component.CustomerDetailPage
          )
      }
    ]
  }
]
