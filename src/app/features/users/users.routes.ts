import { authGuard } from "@/app/features/auth/presentation/guards/auth.guard"
import { Routes } from "@angular/router"
import { ViewService } from "@ngneat/overview"
import { HotToastService, provideHotToastConfig } from "@ngxpert/hot-toast"

export const USERS_ROUTES: Routes = [
  {
    path: "",
    title: "Usuarios | The Real Maids",
    canActivate: [authGuard],
    // Shadow both root services: ViewService creates the body overlay with its own injector.
    // The container and Users consumers must resolve the same route-owned toast instance.
    providers: [HotToastService, ViewService, provideHotToastConfig()],
    loadComponent: () =>
      import("./presentation/pages/users-page/users-page").then(component => component.UsersPage)
  }
]
